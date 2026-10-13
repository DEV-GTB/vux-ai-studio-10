import { z } from 'zod';

const localPreviewSchema = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1'
    );
  } catch {
    return false;
  }
}, 'Use an allowed local HTTP(S) preview URL.');

export function normalizePreviewUrl(input) {
  const value = String(input ?? '').trim();
  const normalized = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  const url = new URL(normalized);
  url.hash = '';
  return url.toString();
}

export function validatePreviewUrl(input) {
  const normalized = normalizePreviewUrl(input);
  return localPreviewSchema.parse(normalized);
}

export function isAllowedFinalUrl(value) {
  try {
    validatePreviewUrl(value);
    return true;
  } catch {
    return false;
  }
}