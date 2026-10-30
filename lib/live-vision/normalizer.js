import crypto from 'node:crypto';

const MAX_MESSAGE_LENGTH = 2000;

const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'&\s]+/gi,
  /([?&](?:token|key|secret|password|authorization)=)[^&\s]+/gi,
];

export function redactSensitiveText(input) {
  let value = String(input ?? '').slice(0, MAX_MESSAGE_LENGTH);
  value = value.replace(SECRET_PATTERNS[0], 'Bearer [REDACTED]');
  value = value.replace(SECRET_PATTERNS[1], '$1=[REDACTED]');
  value = value.replace(SECRET_PATTERNS[2], '$1[REDACTED]');
  return value;
}

export function createFingerprint(kind, message, sourceUrl) {
  const normalized = [kind, String(message || '').trim().toLowerCase(), sourceUrl ?? ''].join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function normalizeEvent(input) {
  const message = redactSensitiveText(input.message);
  return {
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    kind: input.kind,
    severity: input.severity,
    message,
    sourceUrl: input.sourceUrl,
    statusCode: input.statusCode,
    timestamp: new Date().toISOString(),
    fingerprint: createFingerprint(input.kind, message, input.sourceUrl),
    redacted: true,
  };
}