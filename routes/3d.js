import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
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

function send3dError(res, error, label) {
  const message = String(error?.message || '').toLowerCase();
  console.error(`[3d] ${label} failed:`, error?.status || error?.providerCode || message.slice(0, 180) || 'unknown error');
  if (error?.providerCode === 2010 || message.includes('insufficient credits')) {
    return res.status(402).json({ error: 'Tripo generation credits are insufficient. Add credits in the Tripo console and try again.' });
  }
  if (message.includes('timed out')) {
    return res.status(504).json({ error: '3D generation took too long. Please try again.' });
  }
  if (error?.status === 429) return res.status(429).json({ error: '3D generation is busy. Please try again shortly.' });
  return res.status(502).json({ error: 'The 3D service is unavailable or returned an invalid model.' });
}

function parseImageUpload(req, res, next) {
  upload.single('image')(req, res, (error) => {
    if (!error) return next();
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.status || 400;
    return res.status(status).json({ error: status === 413 ? 'Images must be 8 MB or smaller.' : error.message });
  });
}

const TRIPO_BASE_URL = 'https://openapi.tripo3d.ai/v3';
const TRIPO_MODEL = process.env.TRIPO_MODEL || 'tripo-v3.1';
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
  if (hasTripoKey()) {
    try {
      return sendGlb(res, await generateTripoText(prompt.trim()));
    } catch (error) {
      console.error('[3d] Tripo text generation failed.', error?.status || error?.providerCode || error?.message);
      // Payment/credit issues should be reported directly; network/runtime errors may try configured services.
      if (error?.providerCode === 2010 || /insufficient credits/i.test(String(error?.message || ''))) {
        return send3dError(res, error, 'Tripo text generation');
      }
    }
  }

  // Optional keyless fallback
  if (process.env.THREE_FREE_PROVIDER === '1') {
    try {
      return sendGlb(res, await generateThreeWsText(prompt.trim()));
    } catch (error) {
      console.error('[3d] free text generation failed.', error?.message || 'provider-error');
    }
  }

  try {
    const threeStudioBase = getThreeStudioBase();
    const trellisEndpoint = process.env.TRELLIS_ENDPOINT;
    if (!threeStudioBase && (!trellisEndpoint || trellisEndpoint === 'https://your-trellis-endpoint')) {
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
    return send3dError(res, error, 'text generation');
  }
});

router.post('/image-to-3d', parseImageUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'An image is required.' });

  if (hasTripoKey()) {
    try {
      return sendGlb(res, await generateTripoImage(req.file));
    } catch (error) {
      const creditError = error?.providerCode === 2010 || /insufficient credits/i.test(String(error?.message || ''));
      if (creditError) return send3dError(res, error, 'Tripo image-to-3D');
      console.error('[3d] Tripo image-to-3D failed.', error?.status || error?.providerCode || error?.message);
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
    return send3dError(res, error, 'image-to-3D');
  }
});

export default router;
