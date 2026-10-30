import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import {
  generateGradioImage,
  generateGradioText,
  hasGradioSpace,
} from '../lib/hunyuan3d-2.js';
const router = Router();
const GLB_CONTENT_TYPE = 'model/gltf-binary';
const MAX_GLB_BYTES = 100 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) return callback(null, true);
    const error = new Error('Only PNG, JPEG, and WebP images are supported.');
    error.status = 415;
    return callback(error);
  },
});

function getThreeStudioBase() {
  const value = process.env.THREE_STUDIO_URL?.trim();
  if (!value) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid Threestudio endpoint configuration.');
  }
  return url;
}

async function readGlbResponse(response, baseUrl = null) {
  if (!response.ok) {
    const error = new Error(`3D service returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  let glb;
  if (contentType.includes('application/json')) {
    const data = await response.json();
    if (typeof data.model !== 'string' || !data.model) throw new Error('3D service did not return a model.');

    const dataUrl = data.model.match(/^data:model\/gltf-binary;base64,([A-Za-z0-9+/=]+)$/);
    if (dataUrl) {
      glb = Buffer.from(dataUrl[1], 'base64');
    } else {
      if (!baseUrl) throw new Error('3D service returned a model URL without a configured base URL.');
      const modelUrl = new URL(data.model, baseUrl);
      if (modelUrl.origin !== baseUrl.origin) throw new Error('3D service returned an unexpected model URL.');
      const modelResponse = await fetch(modelUrl);
      if (!modelResponse.ok) throw new Error(`Generated model download failed with HTTP ${modelResponse.status}.`);
      const contentLength = Number(modelResponse.headers.get('content-length'));
      if (contentLength > MAX_GLB_BYTES) throw new Error('Generated model exceeds the 100 MB limit.');
      glb = Buffer.from(await modelResponse.arrayBuffer());
    }
  } else {
    const contentLength = Number(response.headers.get('content-length'));
    if (contentLength > MAX_GLB_BYTES) throw new Error('Generated model exceeds the 100 MB limit.');
    glb = Buffer.from(await response.arrayBuffer());
  }

  if (glb.length < 12 || glb.length > MAX_GLB_BYTES || glb.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('3D service did not return a valid GLB file.');
  }
  return glb;
}

function sendGlb(res, glb) {
  res.setHeader('Content-Type', GLB_CONTENT_TYPE);
  res.setHeader('Content-Disposition', 'inline; filename="generated-model.glb"');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(glb);
}

/**
 * Builds the message the reader sees.
 *
 * When more than one provider was asked and more than one refused, every
 * reason is named. A single reason is not enough to tell whether the
 * problem is the credit balance or the space itself.
 */
function build3dMessage(errors) {
  const list = Array.isArray(errors) ? errors : [errors];
  const reasons = list
    .map((error) => String(error?.message || '').trim())
    .filter(Boolean);

  const first = list[0];
  const message = String(first?.message || '').toLowerCase();

  let text;
  if (first?.providerCode === 2010 || message.includes('insufficient credits')) {
    text = 'Tripo generation credits are insufficient. Add credits in the Tripo console and try again.';
  } else if (message.includes('timed out')) {
    text = '3D generation took too long. Please try again.';
  } else if (message.includes('space is sleeping') || message.includes('starting up')) {
    text = 'The 3D space is waking up. Please try again in a moment.';
  } else if (message.includes('is disable') || message.includes('is disabled')) {
    text = 'The 3D space has this mode switched off. Point it at a space that supports it.';
  } else if (first?.status === 429) {
    text = '3D generation is busy. Please try again shortly.';
  } else {
    text = 'The 3D service is unavailable or returned an invalid model.';
  }

  const others = reasons
    .slice(1)
    // A plain network failure says nothing the reader can act on.
    .filter((reason) => !/fetch fail|ECONNREFUSED|ENOTFOUND|network error|socket hang up/i.test(reason))
    .map((reason) => reason.slice(0, 160));
  if (others.length) text += ` The other service said: ${others.join(' | ')}`;
  return text;
}

function send3dError(res, error, label, extraErrors = []) {
  const errors = [error, ...(Array.isArray(extraErrors) ? extraErrors : [])].filter(Boolean);
  const first = errors[0] || {};
  const message = String(first?.message || '').toLowerCase();
  console.error(`[3d] ${label} failed:`, first?.status || first?.providerCode || message.slice(0, 180) || 'unknown error');
  for (const other of errors.slice(1)) {
    console.error(`[3d] ${label} also failed:`, other?.status || other?.message);
  }

  const text = build3dMessage(errors);
  if (/credits/i.test(text)) return res.status(402).json({ error: text });
  if (/took too long/i.test(text)) return res.status(504).json({ error: text });
  if (/waking up|switched off/i.test(text)) return res.status(503).json({ error: text });
  if (first?.status === 429) return res.status(429).json({ error: text });
  return res.status(502).json({ error: text });
}

function parseImageUpload(req, res, next) {
  upload.single('image')(req, res, (error) => {
    if (!error) return next();
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.status || 400;
    return res.status(status).json({ error: status === 413 ? 'Images must be 8 MB or smaller.' : error.message });
  });
}

const TRIPO_BASE_URL = 'https://openapi.tripo3d.ai/v3';
// The v3 API uses the dated model id. The old id returns an unknown model.
const TRIPO_MODEL = process.env.TRIPO_MODEL || 'v3.1-20260211';
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function tripoRequest(endpoint, { method = 'POST', body, multipart = false } = {}) {
  const headers = { Authorization: `Bearer ${process.env.TRIPO_API_KEY}` };
  if (!multipart) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${TRIPO_BASE_URL}${endpoint}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
  });
  const responseText = await response.text();
  let payload = {};
  try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = {}; }

  if (!response.ok || payload.code !== 0) {
    const error = new Error(payload.message || `3D service returned HTTP ${response.status}.`);
    error.status = response.status;
    error.providerCode = payload.code;
    throw error;
  }
  return payload.data || {};
}

async function waitForTripoTask(taskId) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await delay(2000);
    const task = await tripoRequest(`/tasks/${encodeURIComponent(taskId)}`, { method: 'GET' });
    if (task.status === 'success') {
      if (!task.output?.model_url) throw new Error('The 3D task completed without a model URL.');
      return task.output.model_url;
    }
    if (['failed', 'cancelled', 'banned'].includes(task.status)) {
      const error = new Error(task.error_message || `3D task ${task.status}.`);
      error.providerCode = task.error_code;
      throw error;
    }
  }
  throw new Error('3D generation timed out while waiting for the model.');
}

async function downloadTripoGlb(modelUrl) {
  const url = new URL(modelUrl);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !(hostname === 'tripo3d.ai' || hostname.endsWith('.tripo3d.ai'))) {
    throw new Error('The 3D service returned an unexpected model URL.');
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Generated model download failed with HTTP ${response.status}.`);
  const contentLength = Number(response.headers.get('content-length'));
  if (contentLength > MAX_GLB_BYTES) throw new Error('Generated model exceeds the 100 MB limit.');
  return readGlbResponse(response);
}

async function generateTripoText(prompt) {
  const task = await tripoRequest('/generation/text-to-model', {
    body: { prompt, model: TRIPO_MODEL, texture: true, pbr: true },
  });
  if (!task.task_id) throw new Error('The 3D service did not return a task ID.');
  return downloadTripoGlb(await waitForTripoTask(task.task_id));
}

async function generateTripoImage(file) {
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), path.basename(file.originalname));
  const uploaded = await tripoRequest('/files', { body: form, multipart: true });
  if (!uploaded.file_token) throw new Error('The 3D service did not accept the uploaded image.');
  const task = await tripoRequest('/generation/image-to-model', {
    body: { input: uploaded.file_token, model: TRIPO_MODEL, texture: true, pbr: true },
  });
  if (!task.task_id) throw new Error('The 3D service did not return a task ID.');
  return downloadTripoGlb(await waitForTripoTask(task.task_id));
}

function hasTripoKey() {
  return Boolean(process.env.TRIPO_API_KEY && process.env.TRIPO_API_KEY !== 'your_tripo_api_key_here');
}

async function generateThreeWsText(prompt) {
  // Optional keyless fallback; only used when THREE_FREE_PROVIDER=1
  if (process.env.THREE_FREE_PROVIDER !== '1') {
    throw new Error('Free 3D provider disabled.');
  }
  const submitResponse = await fetch('https://three.ws/api/3d/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: String(prompt).slice(0, 1000), format: 'glb' }),
  });
  if (!submitResponse.ok) {
    throw new Error(`Free 3D service returned HTTP ${submitResponse.status}.`);
  }
  let payload = {};
  try { payload = await submitResponse.json(); } catch { payload = {}; }

  const pickGlbUrl = (value) => {
    if (!value || typeof value !== 'object') return null;
    const candidates = [
      value.glbUrl, value.glb_url, value.modelUrl, value.model_url, value.url, value.file,
      value?.result?.glbUrl, value?.result?.glb_url, value?.output?.model_url,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && /^https?:\/\//i.test(c)) return c;
    }
    return null;
  };

  let glbUrl = pickGlbUrl(payload);
  if (!glbUrl) {
    const pollPath = payload.poll || payload.pollUrl || payload.poll_url;
    if (typeof pollPath !== 'string') {
      throw new Error('Free 3D service did not return a model or poll URL.');
    }
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await delay(payload.retryAfter ? Number(payload.retryAfter) * 1000 : 5000);
      const absolutePoll = pollPath.startsWith('http') ? pollPath : ('https://three.ws' + pollPath);
      const r = await fetch(absolutePoll);
      if (!r.ok) throw new Error(`Free 3D polling failed with HTTP ${r.status}.`);
      payload = await r.json().catch(() => ({}));
      glbUrl = pickGlbUrl(payload);
      if (glbUrl) break;
      if (['failed', 'cancelled', 'error'].includes(String(payload.status || '').toLowerCase())) {
        throw new Error(payload.error || payload.message || 'Free 3D generation failed.');
      }
    }
  }

  if (!glbUrl) throw new Error('Free 3D service did not return a model URL.');
  const glbResponse = await fetch(glbUrl);
  if (!glbResponse.ok) throw new Error(`Free 3D model download failed with HTTP ${glbResponse.status}.`);
  const glb = Buffer.from(await glbResponse.arrayBuffer());
  if (glb.length < 12 || glb.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('Free 3D service did not return a valid GLB file.');
  }
  return glb;
}

router.post('/', async (req, res) => {
  const { prompt, mode = 'text' } = req.body || {};
  if (mode !== 'text') {
    return res.status(400).json({ error: 'This 3D endpoint currently accepts text prompts only.' });
  }
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'A prompt is required.' });
  }
  if (prompt.length > 4000) {
    return res.status(400).json({ error: 'Please keep the prompt under 4,000 characters.' });
  }
  // The first provider that answers serves the request. A provider that
  // cannot answer is remembered, so every reason can be reported when none
  // of them can.
  const providerErrors = [];
  const remember = (error) => {
    if (error) providerErrors.push(error);
  };

  if (hasTripoKey()) {
    try {
      return sendGlb(res, await generateTripoText(prompt.trim()));
    } catch (error) {
      remember(error);
      console.error('[3d] Tripo text generation failed.', error?.status || error?.providerCode || error?.message);
    }
  }

  // A Hugging Face Space builds the model from the same prompt and needs no
  // credit balance, so it answers when Tripo cannot.
  if (hasGradioSpace()) {
    try {
      return sendGlb(res, await generateGradioText(prompt.trim()));
    } catch (error) {
      remember(error);
      console.error('[3d] 3D space text generation failed.', error?.status || error?.message);
    }
  }

  // Optional keyless fallback
  if (process.env.THREE_FREE_PROVIDER === '1') {
    try {
      return sendGlb(res, await generateThreeWsText(prompt.trim()));
    } catch (error) {
      remember(error);
      console.error('[3d] free text generation failed.', error?.message || 'provider-error');
    }
  }

  try {
    const threeStudioBase = getThreeStudioBase();
    const trellisEndpoint = process.env.TRELLIS_ENDPOINT;
    if (!threeStudioBase && (!trellisEndpoint || trellisEndpoint === 'https://your-trellis-endpoint')) {
      // A provider that answered with a reason is more useful than a message
      // about a service that was never configured.
      if (providerErrors.length) return send3dError(res, providerErrors[0], 'text generation', providerErrors.slice(1));
      return res.status(503).json({ error: '3D generation is not configured. Set THREE_STUDIO_URL to a running Threestudio service.' });
    }

    const endpoint = threeStudioBase ? new URL('/generate', threeStudioBase) : new URL(trellisEndpoint);
    const requestBody = threeStudioBase ? { prompt: prompt.trim() } : { inputs: prompt.trim() };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const glb = await readGlbResponse(response, threeStudioBase);
    return sendGlb(res, glb);
  } catch (error) {
    remember(error);
    return send3dError(res, providerErrors[0] || error, 'text generation', providerErrors.slice(1));
  }
});

router.post('/image-to-3d', parseImageUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'An image is required.' });

  const providerErrors = [];
  const remember = (error) => {
    if (error) providerErrors.push(error);
  };

  if (hasTripoKey()) {
    try {
      return sendGlb(res, await generateTripoImage(req.file));
    } catch (error) {
      remember(error);
      console.error('[3d] Tripo image-to-3D failed.', error?.status || error?.providerCode || error?.message);
    }
  }

  // The space takes the picture itself, so it answers image-to-3D too.
  if (hasGradioSpace()) {
    try {
      return sendGlb(res, await generateGradioImage(req.file));
    } catch (error) {
      remember(error);
      console.error('[3d] 3D space image-to-3D failed.', error?.status || error?.message);
    }
  }

  if (process.env.THREE_FREE_PROVIDER === '1') {
    // three.ws is text-only; ignore for image jobs
  }

  let threeStudioBase;
  try {
    threeStudioBase = getThreeStudioBase();
  } catch (error) {
    return send3dError(res, error, 'configuration');
  }
  if (!threeStudioBase) {
    if (providerErrors.length) {
      return send3dError(res, providerErrors[0], 'image-to-3D', providerErrors.slice(1));
    }
    return res.status(503).json({ error: 'Image-to-3D requires THREE_STUDIO_URL to point to a running Threestudio service.' });
  }

  try {
    const form = new FormData();
    form.append('image', new Blob([req.file.buffer], { type: req.file.mimetype }), path.basename(req.file.originalname));
    const endpoint = new URL('/image-to-3d', threeStudioBase);
    const response = await fetch(endpoint, { method: 'POST', body: form });
    const glb = await readGlbResponse(response, threeStudioBase);
    return sendGlb(res, glb);
  } catch (error) {
    remember(error);
    return send3dError(res, providerErrors[0] || error, 'image-to-3D', providerErrors.slice(1));
  }
});

export default router;
