import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import terminalRouter from '../routes/terminal.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalVercel = process.env.VERCEL;
process.env.NODE_ENV = 'test';
delete process.env.VERCEL;

const app = express();
app.use(express.json());
app.use('/api/terminal', terminalRouter);
const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/api/terminal`;

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
});

async function run(command, headers = {}) {
  return fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ command }),
  });
}

test('executes basic npm and safe project commands', async () => {
  const version = await run('npm --version');
  const result = await version.json();
  assert.equal(version.status, 200);
  assert.equal(result.success, true);
  assert.match(result.output, /\d+\.\d+\.\d+/);

  const packageInfo = await run('npm pkg get name');
  assert.equal(packageInfo.status, 200);
  assert.match((await packageInfo.json()).output, /forge-ai-studio/);

  const installDryRun = await run('npm install --dry-run --ignore-scripts --no-audit --no-fund');
  assert.equal(installDryRun.status, 200);
  assert.equal((await installDryRun.json()).success, true);
});

test('rejects shell syntax and commands outside the allowlist', async () => {
  for (const command of ['npm --version && whoami', 'node -e console.log(1)', 'git push origin main', 'npm install --package-lock-only']) {
    const response = await run(command);
    assert.equal(response.status, 400, `${command} should be rejected`);
  }
});

test('blocks hosted and remote-origin terminal execution', async () => {
  const remoteOrigin = await run('npm --version', { Origin: 'https://attacker.example' });
  assert.equal(remoteOrigin.status, 403);

  process.env.VERCEL = '1';
  const hosted = await run('npm --version');
  assert.equal(hosted.status, 403);
  delete process.env.VERCEL;
});