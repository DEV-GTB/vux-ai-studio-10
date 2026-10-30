import { z } from 'zod';
import crypto from 'node:crypto';
import { insertIssue } from './repo.js';

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(5000).default(''),
  severity: z.enum(['info', 'warning', 'error']),
  reproductionSteps: z.array(z.string().trim().max(1000)).max(30).default([]),
  expected: z.string().max(3000).default(''),
  actual: z.string().max(3000).default(''),
  screenshotIds: z.array(z.string().max(128)).max(20).default([]),
  eventIds: z.array(z.string().max(128)).max(100).default([]),
  suspectedCauses: z.array(z.string().max(1000)).max(20).default([]),
  verificationPlan: z.array(z.string().max(1000)).max(30).default([]),
});

export function validateIssue(input) {
  return schema.parse(input);
}

export function createIssue(input) {
  const data = schema.parse(input);
  const report = {
    id: crypto.randomUUID(),
    title: data.title,
    summary: data.summary,
    severity: data.severity,
    reproductionSteps: data.reproductionSteps,
    expected: data.expected,
    actual: data.actual,
    screenshotIds: data.screenshotIds,
    eventIds: data.eventIds,
    suspectedCauses: data.suspectedCauses,
    verificationPlan: data.verificationPlan,
    createdAt: new Date().toISOString(),
  };
  insertIssue(report);
  return report;
}

export function toMarkdown(report) {
  return [
    `# ${report.title}`,
    '',
    `**Severity:** ${report.severity}`,
    `**Created:** ${report.createdAt}`,
    '',
    '## Summary',
    report.summary || '_No summary provided._',
    '',
    '## Reproduction Steps',
    ...report.reproductionSteps.map((s, i) => `${i + 1}. ${s}`),
    '',
    '## Expected',
    report.expected || '_Not provided._',
    '',
    '## Actual',
    report.actual || '_Not provided._',
    '',
    '## Evidence',
    `Screenshots: ${report.screenshotIds.join(', ') || 'none'}`,
    `Events: ${report.eventIds.join(', ') || 'none'}`,
    '',
    '## Suspected Causes',
    ...report.suspectedCauses.map((s) => `- ${s}`),
    '',
    '## Verification Plan',
    ...report.verificationPlan.map((s) => `- ${s}`),
  ].join('\n');
}