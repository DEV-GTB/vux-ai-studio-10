import express from 'express';
import { isIP } from 'node:net';
import { normalizeEsp32State } from '../lib/esp32.js';

const router = express.Router();

function getStateUrl() {
  const configuredBase = process.env.ESP32_BASE_URL || process.env.IOT_BACKEND_URL;
  if (process.env.VERCEL === '1' && !configuredBase) {
    const error = new Error('Vercel cannot connect to the ESP32 private access-point address. Configure a public, authenticated device bridge.');
    error.code = 'DEVICE_LINK_NOT_CONFIGURED';
    throw error;
  }

  const baseUrl = configuredBase || 'http://192.168.4.1';
  const statePath = process.env.ESP32_STATE_PATH || '/api/telemetry';
  const base = new URL(baseUrl);

  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new TypeError('ESP32_BASE_URL must be an HTTP(S) URL without embedded credentials.');
  }

  const privateIpv4 = isIP(base.hostname) === 4 && (
    base.hostname.startsWith('10.') ||
    base.hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(base.hostname) ||
    base.hostname.startsWith('127.') ||
    base.hostname.startsWith('169.254.')
  );
  const privateHostname = base.hostname === 'localhost' || base.hostname.endsWith('.local');
  if (process.env.VERCEL === '1' && (privateIpv4 || privateHostname)) {
    const error = new Error('The configured ESP32 URL is private and cannot be reached from Vercel.');
    error.code = 'DEVICE_LINK_NOT_CONFIGURED';
    throw error;
  }

  return new URL(statePath, `${base.origin}/`);
}

router.get('/status', async (_req, res) => {
  let target;
  try {
    target = getStateUrl();
  } catch (error) {
    const status = error.code === 'DEVICE_LINK_NOT_CONFIGURED' ? 503 : 500;
    return res.status(status).json({ error: error.code || 'ESP32_CONFIGURATION_ERROR', message: error.message });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const diagnosticPath = process.env.ESP32_DIAG_PATH || '/api/diag';
    const diagnosticUrl = new URL(diagnosticPath, `${target.origin}/`);
    const [response, diagnosticResponse] = await Promise.all([
      fetch(target, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }),
      fetch(diagnosticUrl, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }).catch(() => null),
    ]);

    const body = await response.text();
    if (!response.ok) {
      return res.status(502).json({
        error: 'ESP32_HTTP_ERROR',
        message: `ESP32 returned HTTP ${response.status}.`,
      });
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return res.status(502).json({
        error: 'ESP32_INVALID_RESPONSE',
        message: 'ESP32 telemetry endpoint did not return JSON. Check ESP32_STATE_PATH.',
      });
    }

    let diagnostics = null;
    if (diagnosticResponse?.ok) {
      try {
        diagnostics = await diagnosticResponse.json();
      } catch {
        diagnostics = null;
      }
    }

    return res.json({
      ...normalizeEsp32State(payload, new Date().toISOString(), diagnostics),
      source: { endpoint: target.origin },
    });
  } catch (error) {
    const timedOut = error.name === 'AbortError';
    return res.status(502).json({
      error: timedOut ? 'ESP32_TIMEOUT' : 'ESP32_UNAVAILABLE',
      message: timedOut
        ? 'ESP32 did not respond within 3.5 seconds.'
        : 'ESP32 could not be reached. Check the device Wi-Fi connection and address.',
    });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;