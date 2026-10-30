import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import express from 'express';
import { createServer } from 'node:http';

const originalRoot = process.env.STUDIO_WORKSPACE_ROOT;
const originalVercel = process.env.VERCEL;
const originalNodeEnv = process.env.NODE_ENV;
const root = await mkdtemp(path.join(os.tmpdir(), 'vux-workspace-test-'));
process.env.STUDIO_WORKSPACE_ROOT = root;
delete process.env.VERCEL;
process.env.NODE_ENV = 'test';

const { default: workspaceRouter } = await import('../routes/workspace.js');
const app = express();
app.use(express.json());
app.use('/api/workspace', workspaceRouter);
const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/api/workspace`;

before(async () => {
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src', 'main.js'), 'console.log("before");\n');
  await writeFile(path.join(root, '.env'), 'PRIVATE=value');
  await writeFile(path.join(root, 'token.pem'), 'PRIVATE');
  await mkdir(path.join(root, 'node_modules'));
  await writeFile(path.join(root, 'node_modules', 'ignored.js'), 'ignore');
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(root, { recursive: true, force: true });
  if (originalRoot === undefined) delete process.env.STUDIO_WORKSPACE_ROOT;
  else process.env.STUDIO_WORKSPACE_ROOT = originalRoot;
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test('lists workspace text files without secrets and excluded dependency folders', async () => {
  const response = await fetch(baseUrl);
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.files['src/main.js'], 'console.log("before");\n');
  assert.equal(result.files['.env'], undefined);
  assert.equal(result.files['token.pem'], undefined);
  assert.equal(result.files['node_modules/ignored.js'], undefined);
});

test('creates, updates, renames, and deletes workspace files and folders', async () => {
  const createdFolder = await fetch(`${baseUrl}/folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'src/components' }),
  });
  assert.equal(createdFolder.status, 200);

  const createFile = async (filePath, content, mode) => fetch(`${baseUrl}/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content, mode }),
  });
  assert.equal((await createFile('src/components/Card.jsx', 'export default 1;', 'create')).status, 200);
  assert.equal((await createFile('src/components/Card.jsx', 'overwrite', 'create')).status, 409);
  assert.equal((await createFile('src/components/Card.jsx', 'export default 2;', 'write')).status, 200);
  assert.equal(await readFile(path.join(root, 'src/components/Card.jsx'), 'utf8'), 'export default 2;');

  const renamed = await fetch(`${baseUrl}/file`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'src/components/Card.jsx', to: 'src/components/Panel.jsx' }),
  });
  assert.equal(renamed.status, 200);

  const removed = await fetch(`${baseUrl}/file`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'src/components/Panel.jsx' }),
  });
  assert.equal(removed.status, 200);

  const removedFolder = await fetch(`${baseUrl}/folder`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'src/components', recursive: true }),
  });
  assert.equal(removedFolder.status, 200);
});

test('rejects traversal, absolute paths, protected files, and remote origins', async () => {
  for (const target of ['../outside.txt', 'C:\\outside.txt', '.env', 'node_modules/pkg/index.js']) {
    const response = await fetch(`${baseUrl}/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target, content: 'nope', mode: 'create' }),
    });
    assert.ok(response.status === 400 || response.status === 403, `${target} returned ${response.status}`);
  }

  const remoteOrigin = await fetch(baseUrl, { headers: { Origin: 'https://attacker.example' } });
  assert.equal(remoteOrigin.status, 403);
});

test('rejects symbolic links that point outside the workspace', async () => {
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'vux-outside-test-'));
  await writeFile(path.join(outsideRoot, 'outside.js'), 'outside');
  try {
    await symlink(outsideRoot, path.join(root, 'linked'), 'junction');
    const response = await fetch(`${baseUrl}/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'linked/outside.js', content: 'changed', mode: 'write' }),
    });
    assert.equal(response.status, 403);
    assert.equal(await readFile(path.join(outsideRoot, 'outside.js'), 'utf8'), 'outside');
  } finally {
    await rm(outsideRoot, { recursive: true, force: true });
  }
});