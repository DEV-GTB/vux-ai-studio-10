import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

process.env.VERCEL = '1';
process.env.ESP32_BASE_URL = 'http://192.168.4.1';

const { default: app } = await import('../server.js');
const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('hosted mode blocks command execution and project mutation endpoints', async () => {
  const terminal = await fetch(`${baseUrl}/api/terminal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'whoami' }),
  });
  const projectRun = await fetch(`${baseUrl}/api/project/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'whoami' }),
  });
  const projectFix = await fetch(`${baseUrl}/api/project/fix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ issues: ['Dependencies not installed'] }),
  });

  assert.equal(terminal.status, 403);
  assert.equal(projectRun.status, 403);
  assert.equal(projectFix.status, 403);
});

test('hosted mode refuses the ESP32 private access-point URL', async () => {
  const response = await fetch(`${baseUrl}/api/v1/iot/esp32/status`);
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.error, 'DEVICE_LINK_NOT_CONFIGURED');
});