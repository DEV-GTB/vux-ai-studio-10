import test from 'node:test';
import assert from 'node:assert/strict';

import { validateIssue, toMarkdown } from '../lib/live-vision/issueReport.js';

test('validates required fields', () => {
  const report = validateIssue({
    title: 'Clipped button',
    severity: 'warning',
  });
  assert.equal(report.title, 'Clipped button');
});

test('rejects empty title', () => {
  assert.throws(() => validateIssue({ title: '', severity: 'info' }));
});

test('renders markdown', () => {
  const report = validateIssue({ title: 'T', severity: 'info' });
  const markdown = toMarkdown({ ...report, id: 'x', createdAt: 'now', screenshotIds: [], eventIds: [], reproductionSteps: [], suspectedCauses: [], verificationPlan: [], summary: '', expected: '', actual: '' });
  assert.match(markdown, /# T/);
});