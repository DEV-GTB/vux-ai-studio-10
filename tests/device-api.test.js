import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

process.env.VERCEL = '1';
process.env.NEXUS_DEVICE_TOKEN = 'test-device-token';
process.env.NEXUS_DEVICE_ID = 'NEXUS-001';
process.env.APP_ACCESS_CODE = 'test-dashboard-access-code';

const { default: app } = await import('../server.js');
const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

const authHeaders = { Authorization: 'Bearer test-device-token' };

test('device polling requires authentication and returns null when no command is queued', async () => {
  const unauthorized = await fetch(`${baseUrl}/api/device/poll?deviceId=NEXUS-001`);
  const authorized = await fetch(`${baseUrl}/api/device/poll?deviceId=NEXUS-001`, {
    headers: authHeaders,
  });

  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await authorized.json(), { command: null });
});

test('device status is authenticated, cached in memory, and normalized for the dashboard', async () => {
  const payload = {
    deviceId: 'NEXUS-001',
    state: 0,
    room1Fan: true,
    room1Light: false,
    room2Fan: false,
    room2Light: true,
    wifiConnected: true,
    localApConnected: true,
    systemCurrent: 0.7,
    room1Sensor: 0,
    room2Sensor: 1,
    uptime: 5000,
  };
  const upload = await fetch(`${baseUrl}/api/device/status`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert.equal(upload.status, 202);

  const readback = await fetch(`${baseUrl}/api/device/state`, {
    headers: { 'X-App-Access-Code': 'test-dashboard-access-code' },
  });
  const result = await readback.json();
  assert.equal(readback.status, 200);
  assert.equal(result.device.rooms.length, 2);
  assert.equal(result.device.rooms[0].fanOn, true);
  assert.equal(result.device.rooms[1].lightOn, true);
  assert.equal(result.device.wifi.stationConnected, true);
  assert.equal(result.device.wifi.localApConnected, true);
  assert.equal(result.device.telemetry.system.current, 0.7);
  assert.equal(result.device.telemetry.system.voltage, null);
});

test('device status rejects mismatched device IDs and malformed relay values', async () => {
  const wrongDevice = await fetch(`${baseUrl}/api/device/status`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: 'OTHER', room1Fan: false, room1Light: false, room2Fan: false, room2Light: false }),
  });
  const malformed = await fetch(`${baseUrl}/api/device/status`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: 'NEXUS-001', room1Fan: 'yes', room1Light: false, room2Fan: false, room2Light: false }),
  });

  assert.equal(wrongDevice.status, 403);
  assert.equal(malformed.status, 400);

  const state = await fetch(`${baseUrl}/api/device/state`, {
    headers: { 'X-App-Access-Code': 'test-dashboard-access-code' },
  });
  const result = await state.json();
  assert.equal(result.device.rooms[0].fanOn, true);
});

test('dashboard telemetry requires the configured access code', async () => {
  const unauthorized = await fetch(`${baseUrl}/api/device/state`);
  const invalid = await fetch(`${baseUrl}/api/device/state`, {
    headers: { 'X-App-Access-Code': 'wrong-code' },
  });

  assert.equal(unauthorized.status, 401);
  assert.equal(invalid.status, 401);
});

test('dashboard queues a separate room appliance command for authenticated device polling', async () => {
  await fetch(`${baseUrl}/api/device/status`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: 'NEXUS-001', state: 0,
      room1Fan: false, room1Light: false, room2Fan: false, room2Light: false,
    }),
  });

  const unauthorized = await fetch(`${baseUrl}/api/device/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: 1, command: 'FAN_ON' }),
  });
  const accepted = await fetch(`${baseUrl}/api/device/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Access-Code': 'test-dashboard-access-code' },
    body: JSON.stringify({ room: 1, command: 'FAN_ON' }),
  });
  const polled = await fetch(`${baseUrl}/api/device/poll?deviceId=NEXUS-001`, { headers: authHeaders });
  const empty = await fetch(`${baseUrl}/api/device/poll?deviceId=NEXUS-001`, { headers: authHeaders });

  assert.equal(unauthorized.status, 401);
  assert.equal(accepted.status, 202);
  assert.deepEqual((await polled.json()).command, { command: 'FAN_ON', room: 1 });
  assert.deepEqual(await empty.json(), { command: null });
});

test('dashboard refuses ON commands during protection and rejects unsupported commands', async () => {
  await fetch(`${baseUrl}/api/device/status`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: 'NEXUS-001', state: 3,
      room1Fan: false, room1Light: false, room2Fan: false, room2Light: false,
    }),
  });

  const protectedOn = await fetch(`${baseUrl}/api/device/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Access-Code': 'test-dashboard-access-code' },
    body: JSON.stringify({ room: 2, command: 'LIGHT_ON' }),
  });
  const invalid = await fetch(`${baseUrl}/api/device/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Access-Code': 'test-dashboard-access-code' },
    body: JSON.stringify({ room: 2, command: 'UNLOCK_PROTECTION' }),
  });

  assert.equal(protectedOn.status, 409);
  assert.equal(invalid.status, 400);
});