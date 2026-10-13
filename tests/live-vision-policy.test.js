import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePreviewUrl, normalizePreviewUrl } from '../lib/live-vision/policy.js';

test('accepts localhost loopback HTTP URL', () => {
  assert.equal(validatePreviewUrl('http://localhost:5173'), 'http://localhost:5173/');
});

test('accepts 127.0.0.1', () => {
  assert.match(validatePreviewUrl('127.0.0.1:3000'), /127\.0\.0\.1:3000/);
});

test('rejects external host', () => {
  assert.throws(() => validatePreviewUrl('https://example.com'), /allowed|Use an allowed/);
});

test('rejects file scheme', () => {
  assert.throws(() => validatePreviewUrl('file:///etc/passwd'));
});

test('rejects credential-bearing URL', () => {
  assert.throws(() => validatePreviewUrl('http://user:pass@localhost:5173'));
});

test('normalizes missing scheme', () => {
  assert.equal(normalizePreviewUrl('localhost:4173'), 'http://localhost:4173/');
});