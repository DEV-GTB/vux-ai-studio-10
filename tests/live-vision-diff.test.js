import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateChangedRatio } from '../lib/live-vision/diffService.js';

test('calculates ratio', () => {
  assert.equal(calculateChangedRatio(50, 100), 0.5);
});

test('rejects zero or negative total pixels', () => {
  assert.throws(() => calculateChangedRatio(1, 0));
  assert.throws(() => calculateChangedRatio(1, -5));
});