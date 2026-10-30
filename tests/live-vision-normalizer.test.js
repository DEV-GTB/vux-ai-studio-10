import test from 'node:test';
import assert from 'node:assert/strict';

import { redactSensitiveText, createFingerprint, normalizeEvent } from '../lib/live-vision/normalizer.js';

test('redacts bearer token', () => {
  const result = redactSensitiveText('Authorization: Bearer abc.def.ghi');
  assert.match(result, /Bearer \[REDACTED\]/);
});

test('limits message length', () => {
  const long = 'a'.repeat(3000);
  assert.equal(redactSensitiveText(long).length, 2000);
});

test('fingerprints are stable', () => {
  const a = createFingerprint('console-error', 'boom', 'http://localhost');
  const b = createFingerprint('console-error', 'boom', 'http://localhost');
  assert.equal(a, b);
});

test('normalizeEvent returns redacted event', () => {
  const event = normalizeEvent({
    sessionId: 's1',
    kind: 'console-error',
    severity: 'error',
    message: 'token = secret123',
  });
  assert.equal(event.redacted, true);
  assert.match(event.message, /\[REDACTED\]/);
  assert.ok(event.fingerprint);
});