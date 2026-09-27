import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { normalizeEsp32State } from '../lib/esp32.js';

const router = express.Router();
const DEVICE_STATES = [
  'NORMAL',
  'WARNING',
  'VERIFYING',
  'PROTECTED',
  'AWAITING_REPAIR',
  'RECHECKING',
  'RECOVERING',
  'RECOVERED',
  'SENSOR_ERROR',
  'COMMUNICATION_DEGRADED',
];
let latestDeviceSnapshot = null;
const pendingCommands = [];

function configuredDeviceId() {
  return process.env.NEXUS_DEVICE_ID || 'NEXUS-001';
}

function secretMatches(providedValue, expectedValue) {
  if (!providedValue || !expectedValue) return false;
  const provided = Buffer.from(providedValue);
  const expected = Buffer.from(expectedValue);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function isAuthorized(req) {
  const configuredToken = process.env.NEXUS_DEVICE_TOKEN || '';
  const providedToken = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  return secretMatches(providedToken, configuredToken);
}

function makeDashboardPayload(payload) {
  const state = Number.isInteger(payload.state)
    ? DEVICE_STATES[payload.state] || 'UNKNOWN'
    : String(payload.state || 'UNKNOWN').toUpperCase();
  const current = Number.isFinite(payload.systemCurrent) ? payload.systemCurrent : null;
  const rooms = [1, 2].map((roomId) => {
    const fanOn = payload[`room${roomId}Fan`] === true;
    const lightOn = payload[`room${roomId}Light`] === true;
    const sensorRaw = payload[`room${roomId}Sensor`];
    return {
      roomId,
      name: `Room ${roomId}`,
      state: fanOn || lightOn ? 'ON' : 'OFF',
      stateName: state,
      relayState: fanOn || lightOn ? 'ON' : 'OFF',
      fanOn,
      lightOn,
      sensorState: 'UNAVAILABLE',
      sensorRaw: Number.isFinite(sensorRaw) ? sensorRaw : null,
    };
  });

  return {
    ...payload,
    name: 'NEXUS ESP32 Home Controller',
    firmwareVersion: payload.firmwareVersion || 'UNREPORTED',
    status: 'ONLINE',
    wifi: { connected: true, rssi: payload.wifiRSSI ?? null },
    backendConnected: true,
    protection: { state: state },
    telemetry: {
      system: {
        voltage: null,
        voltageQuality: 'UNAVAILABLE',
        current,
        currentQuality: current === null ? 'UNAVAILABLE' : 'UNVERIFIED',
        power: null,
      },
    },
    rooms,
  };
}

router.get('/state', (req, res) => {
  if (!process.env.APP_ACCESS_CODE) {
    return res.status(503).json({ error: 'DASHBOARD_ACCESS_NOT_CONFIGURED' });
  }
  if (!secretMatches(req.get('x-app-access-code') || '', process.env.APP_ACCESS_CODE)) {
    return res.status(401).json({ error: 'DASHBOARD_ACCESS_REQUIRED' });
  }

  if (!latestDeviceSnapshot) {
    return res.status(503).json({
      error: 'DEVICE_NOT_SEEN',
      message: 'Waiting for the ESP32 to send its first status update.',
    });
  }

  return res.json({
    ...normalizeEsp32State(makeDashboardPayload(latestDeviceSnapshot.payload), latestDeviceSnapshot.receivedAt),
    source: { endpoint: 'Cloud HTTPS API' },
  });
});

router.post('/status', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'DEVICE_UNAUTHORIZED' });
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'INVALID_DEVICE_STATUS' });
  }
  if (Buffer.byteLength(JSON.stringify(payload)) > 8192) {
    return res.status(413).json({ error: 'DEVICE_STATUS_TOO_LARGE' });
  }
  if (payload.deviceId !== configuredDeviceId()) {
    return res.status(403).json({ error: 'DEVICE_ID_NOT_ALLOWED' });
  }
  if (![1, 2].every((roomId) => (
    typeof payload[`room${roomId}Fan`] === 'boolean' &&
    typeof payload[`room${roomId}Light`] === 'boolean'
  ))) {
    return res.status(400).json({ error: 'INVALID_RELAY_TELEMETRY' });
  }
  if (payload.systemCurrent !== undefined && !Number.isFinite(payload.systemCurrent)) {
    return res.status(400).json({ error: 'INVALID_CURRENT_TELEMETRY' });
  }

  latestDeviceSnapshot = {
    payload,
    receivedAt: new Date().toISOString(),
  };
  return res.status(202).json({ accepted: true });
});

router.post('/command', (req, res) => {
  if (!process.env.APP_ACCESS_CODE) {
    return res.status(503).json({ error: 'DASHBOARD_ACCESS_NOT_CONFIGURED' });
  }
  if (!secretMatches(req.get('x-app-access-code') || '', process.env.APP_ACCESS_CODE)) {
    return res.status(401).json({ error: 'DASHBOARD_ACCESS_REQUIRED' });
  }
  if (!latestDeviceSnapshot || Date.now() - Date.parse(latestDeviceSnapshot.receivedAt) > 30000) {
    return res.status(409).json({ error: 'DEVICE_STATUS_STALE', message: 'Wait for a fresh device status before sending a command.' });
  }

  const room = Number(req.body?.room);
  const command = req.body?.command;
  if (![1, 2].includes(room) || !['FAN_ON', 'FAN_OFF', 'LIGHT_ON', 'LIGHT_OFF'].includes(command)) {
    return res.status(400).json({ error: 'INVALID_DEVICE_COMMAND' });
  }

  if (command.endsWith('_ON')) {
    const stateIndex = latestDeviceSnapshot.payload.state;
    const stateName = Number.isInteger(stateIndex) ? DEVICE_STATES[stateIndex] : String(stateIndex || '').toUpperCase();
    if (!['NORMAL', 'RECOVERED'].includes(stateName)) {
      return res.status(409).json({ error: 'DEVICE_PROTECTION_ACTIVE', message: 'The device does not currently report a safe state for turning a load on.' });
    }
  }

  if (pendingCommands.length >= 8) {
    return res.status(429).json({ error: 'DEVICE_COMMAND_QUEUE_FULL', message: 'Wait for the device to reconnect before sending more commands.' });
  }

  const queuedCommand = { command, room };
  pendingCommands.push(queuedCommand);
  return res.status(202).json({ accepted: true, command: queuedCommand });
});

router.get('/poll', (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'DEVICE_UNAUTHORIZED' });
  }
  if (req.query.deviceId !== configuredDeviceId()) {
    return res.status(403).json({ error: 'DEVICE_ID_NOT_ALLOWED' });
  }
  return res.json({ command: pendingCommands.shift() || null });
});

export default router;