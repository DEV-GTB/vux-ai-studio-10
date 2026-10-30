// Points the memory store at a temporary file so a test run never touches
// the real memory of the person running it. This module has to be imported
// before anything that loads the store, because the path is read once when
// the store module is first evaluated.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const workspace = mkdtempSync(path.join(tmpdir(), 'vux-memory-test-'));
process.env.VUX_MEMORY_DB_PATH = path.join(workspace, 'memory.db');

process.on('exit', () => {
  try {
    rmSync(workspace, { recursive: true, force: true });
  } catch {
    /* the file is still held open on Windows; the temp folder is small */
  }
});

export const memoryWorkspace = workspace;
