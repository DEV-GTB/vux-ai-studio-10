import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { STORAGE, getScreenshot, insertDiff } from './repo.js';

const MAX_PIXELS = 4096 * 4096;

function assertSafeRelative(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.includes('..') || path.isAbsolute(relativePath)) {
    throw new Error('Unsafe artifact path');
  }
  return path.join(STORAGE.ROOT, relativePath);
}

export async function compareScreenshots(baselineId, currentId, threshold = 0.1) {
  const baseline = getScreenshot(baselineId);
  const current = getScreenshot(currentId);
  if (!baseline || !current) throw new Error('Screenshot not found');

  const baselineFile = assertSafeRelative(baseline.relative_path);
  const currentFile = assertSafeRelative(current.relative_path);

  const baselineImg = await sharp(baselineFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const currentImg = await sharp(currentFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const dimensionsMatch =
    baselineImg.info.width === currentImg.info.width &&
    baselineImg.info.height === currentImg.info.height;

  if (!dimensionsMatch) {
    const id = crypto.randomUUID();
    const result = {
      id,
      baselineId,
      currentId,
      diffArtifactId: '',
      changedPixels: 0,
      totalPixels: baselineImg.info.width * baselineImg.info.height,
      changedRatio: 0,
      threshold,
      dimensionsMatch: false,
      createdAt: new Date().toISOString(),
    };
    insertDiff({ ...result, diffArtifactId: '', createdAt: result.createdAt });
    return result;
  }

  const width = baselineImg.info.width;
  const height = baselineImg.info.height;
  const totalPixels = width * height;
  if (totalPixels <= 0 || totalPixels > MAX_PIXELS) throw new Error('Invalid image pixel count');

  const tolerance = Math.max(0, Math.min(1, Number(threshold)));
  let changedPixels = 0;
  const diffBuffer = Buffer.alloc(width * height * 4);

  for (let i = 0; i < totalPixels; i++) {
    const o = i * 4;
    const r1 = baselineImg.data[o];
    const g1 = baselineImg.data[o + 1];
    const b1 = baselineImg.data[o + 2];
    const r2 = currentImg.data[o];
    const g2 = currentImg.data[o + 1];
    const b2 = currentImg.data[o + 2];

    const dr = Math.abs(r1 - r2) / 255;
    const dg = Math.abs(g1 - g2) / 255;
    const db = Math.abs(b1 - b2) / 255;
    const maxDelta = Math.max(dr, dg, db);

    if (maxDelta > tolerance) {
      changedPixels += 1;
      diffBuffer[o] = 255;
      diffBuffer[o + 1] = 64;
      diffBuffer[o + 2] = 64;
      diffBuffer[o + 3] = 255;
    } else {
      const gray = Math.round((r2 + g2 + b2) / 3 * 0.35);
      diffBuffer[o] = gray;
      diffBuffer[o + 1] = gray;
      diffBuffer[o + 2] = gray;
      diffBuffer[o + 3] = 180;
    }
  }

  const diffArtifactId = crypto.randomUUID();
  const diffRelativePath = path.join('diffs', `${diffArtifactId}.png`);
  const diffAbsolute = path.join(STORAGE.ROOT, diffRelativePath);

  await sharp(diffBuffer, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(diffAbsolute);

  const result = {
    id: crypto.randomUUID(),
    baselineId,
    currentId,
    diffArtifactId: diffRelativePath.replace(/\\/g, '/'),
    changedPixels,
    totalPixels,
    changedRatio: changedPixels / totalPixels,
    threshold: tolerance,
    dimensionsMatch: true,
    createdAt: new Date().toISOString(),
  };

  insertDiff({
    id: result.id,
    baselineId,
    currentId,
    diffArtifactId: result.diffArtifactId,
    changedPixels,
    totalPixels,
    changedRatio: result.changedRatio,
    threshold: tolerance,
    dimensionsMatch: true,
    createdAt: result.createdAt,
  });

  return {
    ...result,
    changedPixels,
    changedRatio: result.changedRatio,
  };
}

export function calculateChangedRatio(changedPixels, totalPixels) {
  if (totalPixels <= 0) throw new Error('Invalid image pixel count');
  return changedPixels / totalPixels;
}