import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { STORAGE, insertScreenshot } from './repo.js';

const MAX_PIXELS = 4096 * 4096;
const MAX_BYTES = 15 * 1024 * 1024;

export async function persistScreenshot({ sessionId, buffer, label, fullPage = false }) {
  if (!Buffer.isBuffer(buffer)) throw new Error('Invalid image buffer');
  if (buffer.length === 0 || buffer.length > MAX_BYTES) throw new Error('Screenshot size is invalid');

  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height || width * height > MAX_PIXELS) throw new Error('Screenshot dimensions are invalid');

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const id = crypto.randomUUID();
  const relativePath = path.join('screenshots', `${id}.png`);
  const absolutePath = path.join(STORAGE.ROOT, relativePath);

  await fs.writeFile(absolutePath, buffer);
  try {
    await insertScreenshot({
      id,
      sessionId,
      createdAt: new Date().toISOString(),
      width,
      height,
      relativePath: relativePath.replace(/\\/g, '/'),
      sha256,
      label,
      baseline: false,
    });
  } catch (err) {
    await fs.unlink(absolutePath).catch(() => {});
    throw err;
  }

  return {
    id,
    sessionId,
    createdAt: new Date().toISOString(),
    width,
    height,
    relativePath: relativePath.replace(/\\/g, '/'),
    label,
    baseline: false,
    sha256,
    fullPage,
  };
}

export async function deleteScreenshotFile(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.includes('..')) return;
  const filePath = path.join(STORAGE.ROOT, relativePath);
  await fs.unlink(filePath).catch(() => {});
}