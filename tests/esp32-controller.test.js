import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeEsp32State } from '../lib/esp32.js';

test('normalizes live ESP32 network and relay state without inventing sensor readings', () => {
  const result = normalizeEsp32State({
    deviceId: 'NEXUS-1234',
    firmwareVersion: '0.1.0',
    wifi: { connected: true, rssi: -54 },
    mqtt: { connected: true },
    rooms: [{ roomId: 1, relayState: 'ON' }],
  }, '2026-09-26T12:00:00.000Z');

  assert.equal(result.device.deviceId, 'NEXUS-1234');
  assert.equal(result.device.status, 'ONLINE');
  assert.equal(result.device.telemetry.system.voltage, null);
  assert.equal(result.device.telemetry.system.current, null);
  assert.equal(result.device.rooms[0].state, 'ON');
  assert.equal(result.receivedAt, '2026-09-26T12:00:00.000Z');
});

test('accepts a nested device payload and preserves explicitly reported telemetry', () => {
  const result = normalizeEsp32State({
    device: {
      telemetry: { system: { voltage: 12.4, current: 0.6 } },
      rooms: [],
    },
  }, '2026-09-26T12:00:00.000Z');

  assert.equal(result.device.telemetry.system.voltage, 12.4);
  assert.equal(result.device.telemetry.system.current, 0.6);
  assert.equal(result.device.telemetry.system.currentQuality, 'VALID');
});

test('maps FW 1.2 current validity, relay booleans, room states, and diagnostic values', () => {
  const result = normalizeEsp32State({
    deviceId: 'NEXUS-ABC123',
    firmwareVersion: '1.2.0',
    uptime: 42,
    wifiConnected: true,
    wifiRSSI: -49,
    backendConnected: false,
    voltageValid: false,
    systemVoltage: 0,
    currentValid: true,
    systemCurrent: 0.735,
    systemPower: 0,
    sequence: 17,
    rooms: [
      { roomId: 1, name: 'Kitchen', relayState: true, sensorPresent: true, sensorValid: true, sensorRaw: 0, stateName: 'NORMAL', faultCode: '' },
      { roomId: 2, name: 'Office', relayState: false, sensorPresent: false, sensorValid: true, sensorRaw: 1, stateName: 'PROTECTED', faultCode: 'PRESENCE_LOST' },
    ],
  }, '2026-09-26T12:00:00.000Z', { r1: { pin: 35, raw: 0, present: true }, acsRaw: 2394 });

  assert.equal(result.device.telemetry.system.voltage, null);
  assert.equal(result.device.telemetry.system.current, 0.735);
  assert.equal(result.device.telemetry.system.currentQuality, 'VALID');
  assert.equal(result.device.wifi.connected, true);
  assert.equal(result.device.backendConnected, false);
  assert.equal(result.device.protection.state, 'PROTECTED');
  assert.equal(result.device.rooms[0].relayState, 'ON');
  assert.equal(result.device.rooms[0].sensorRaw, 0);
  assert.equal(result.device.rooms[0].sensorPresent, true);
  assert.equal(result.device.rooms[1].stateName, 'PROTECTED');
  assert.equal(result.device.alerts[0].type, 'PRESENCE_LOST');
  assert.equal(result.device.diagnostics.acsRaw, 2394);
});