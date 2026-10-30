// ============================================================================
// Hunyuan3D-2, through a Hugging Face Space.
//
// The models this file serves:
//   3D object     Hunyuan3D-2 (the hosted Space)
//                 TRELLIS (a Space that names it)
//
// A Space is a Gradio app, so it is called with the Gradio client. The
// endpoint and its parameters are read from the Space itself instead of
// being hardcoded, so the same code works with a text-to-3D Space, an
// image-to-3D Space, or a Space that does both, such as Hunyuan3D-2.
//
// The Space returns the model as a file. It is fetched, checked, and handed
// back as bytes so the route can send it to the viewer.
// ============================================================================
import { Client } from '@gradio/client';
import { readFile } from 'node:fs/promises';

const DEFAULT_SPACE = 'tencent/Hunyuan3D-2';
const MAX_GLB_BYTES = 100 * 1024 * 1024;

// A sleeping Space has to boot before it answers, so connecting gets its own
// budget. Generating the model itself is the slow part.
const CONNECT_TIMEOUT_MS = Number(process.env.HF_3D_CONNECT_TIMEOUT_MS) || 120000;
const GENERATE_TIMEOUT_MS = Number(process.env.HF_3D_TIMEOUT_MS) || 300000;

// The parameter names a Space is likely to use, in the order they are tried.
const PARAMETER_ALIASES = {
  prompt: ['caption', 'text_prompt', 'prompt', 'text', 'description'],
  image: ['image', 'input_image', 'image_file', 'img', 'input_img'],
  steps: ['steps', 'num_inference_steps', 'inference_steps', 'step'],
  guidance: ['guidance_scale', 'cfg_scale', 'guidance'],
  seed: ['seed', 'random_seed'],
  octree: ['octree_resolution', 'octree'],
  background: ['check_box_rembg', 'remove_background', 'rembg'],
};

/**
 * @returns {string} the Space the 3D models come from
 */
export function getGradioSpace() {
  return process.env.HF_3D_SPACE?.trim() || DEFAULT_SPACE;
}

/**
 * @returns {string} the Space used for a prompt
 *
 * A space can have text-to-3D switched off, which is the case for the
 * hosted Hunyuan3D-2 demo. A space that does answer a prompt can be named
 * here, and it is used for text only.
 */
export function getGradioTextSpace() {
  return process.env.HF_3D_TEXT_SPACE?.trim() || getGradioSpace();
}

/**
 * @returns {boolean} whether the Space provider is switched on
 */
export function hasGradioSpace() {
  if (process.env.HF_3D_ENABLED === '0') return false;
  return Boolean(getGradioSpace());
}

function getToken() {
  const token = String(process.env.HF_TOKEN || '').trim();
  return token.startsWith('hf_') ? token : undefined;
}

function getSetting(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// The client is created here so a test can hand in a stand-in for it.
let clientFactory = (space, options) => Client.connect(space, options);

/**
 * Replaces the client used to reach the Space. A test uses this to answer
 * with a prepared model instead of asking a real Space.
 *
 * @param {(space: string, options: object) => Promise<object>} factory
 */
export function setGradioClientFactory(factory) {
  clientFactory = typeof factory === 'function' ? factory : (space, options) => Client.connect(space, options);
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`The ${label} took too long to answer.`);
      error.code = 'ETIMEDOUT';
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function connect(space = getGradioSpace()) {
  const options = {};
  const token = getToken();
  if (token) options.token = token;
  return withTimeout(clientFactory(space, options), CONNECT_TIMEOUT_MS, '3D space');
}

/**
 * Finds the endpoint that fits the job.
 *
 * A Space that does both text and image gives one endpoint for both, so the
 * endpoint is chosen by the parameters it accepts rather than by its name
 * alone. The name is only used to break a tie.
 */
function pickEndpoint(api, { needsImage }) {
  const named = api?.named_endpoints || {};
  const candidates = Object.entries(named).map(([name, info]) => {
    const parameters = Array.isArray(info?.parameters) ? info.parameters : [];
    const names = parameters
      .map((parameter) => String(parameter?.parameter_name || parameter?.label || '').toLowerCase())
      .filter(Boolean);

    const hasImage = names.some((name) => PARAMETER_ALIASES.image.includes(name));
    const hasPrompt = names.some((name) => PARAMETER_ALIASES.prompt.includes(name));

    let score = 0;
    if (needsImage && hasImage) score += 4;
    if (!needsImage && hasPrompt) score += 4;
    if (hasImage && hasPrompt) score += 2;
    if (/shape_generation|generate|3d|model|mesh/i.test(name)) score += 2;
    if (needsImage && /image/i.test(name)) score += 1;
    if (!needsImage && /text/i.test(name)) score += 1;
    if (needsImage && /text/i.test(name) && !hasImage) score -= 3;
    if (!needsImage && /image/i.test(name) && !hasPrompt) score -= 3;

    return { name, info, parameters, names, score };
  });

  candidates.sort((left, right) => right.score - left.score);
  return candidates.find((candidate) => candidate.score > 0) || null;
}

/**
 * Builds the payload for the endpoint, using the parameter names the Space
 * actually declares. A parameter that is not filled in gets the Space's own
 * default, so a Space with extra settings still works.
 */
function buildPayload(endpoint, values) {
  const payload = {};

  for (const parameter of endpoint.parameters) {
    const name = String(parameter?.parameter_name || parameter?.label || '');
    if (!name) continue;
    const key = name.toLowerCase();

    const alias = Object.keys(PARAMETER_ALIASES).find((candidate) =>
      PARAMETER_ALIASES[candidate].includes(key));
    if (alias && values[alias] !== undefined) {
      payload[name] = values[alias];
      continue;
    }

    const declaredDefault = parameter?.parameter_default ?? parameter?.default;
    if (declaredDefault !== undefined && declaredDefault !== null) {
      payload[name] = declaredDefault;
      continue;
    }

    const type = String(parameter?.type || '');
    if (type.includes('Blob') || type.includes('File') || type.includes('Buffer')) {
      payload[name] = null;
    } else if (type === 'boolean') {
      payload[name] = false;
    } else if (type === 'number') {
      payload[name] = 0;
    } else if (type === 'string') {
      payload[name] = '';
    }
  }

  return payload;
}

/**
 * Finds the generated model inside the answer of the Space.
 *
 * A file comes back in one of two shapes depending on the client version:
 * the newer one carries a `url`, the older one carries the link in `data`.
 * Both are accepted, and a path on disk is accepted as well.
 */
function findModelEntry(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findModelEntry(entry);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  const link = typeof value.url === 'string' && value.url
    ? value.url
    : (typeof value.data === 'string' && /^(https?:|data:)/i.test(value.data) ? value.data : '');

  const looksLikeAFile = value.blob
    || Boolean(link)
    || (typeof value.path === 'string' && value.path.toLowerCase().endsWith('.glb'));
  if (looksLikeAFile) return value;

  for (const child of Object.values(value)) {
    const found = findModelEntry(child);
    if (found) return found;
  }
  return null;
}

async function readModelBytes(entry) {
  if (entry.blob) {
    const blob = entry.blob;
    if (typeof blob.arrayBuffer === 'function') return Buffer.from(await blob.arrayBuffer());
    if (Buffer.isBuffer(blob)) return blob;
    return Buffer.from(blob);
  }

  const link = typeof entry.url === 'string' && entry.url
    ? entry.url
    : (typeof entry.data === 'string' && /^(https?:|data:)/i.test(entry.data) ? entry.data : '');
  if (link) {
    if (link.startsWith('data:')) {
      const base64 = link.slice(link.indexOf(',') + 1);
      return Buffer.from(base64, 'base64');
    }
    const response = await fetch(link);
    if (!response.ok) {
      const error = new Error(`The 3D model download failed with HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    const contentLength = Number(response.headers.get('content-length'));
    if (contentLength > MAX_GLB_BYTES) throw new Error('The generated model exceeds the 100 MB limit.');
    return Buffer.from(await response.arrayBuffer());
  }

  if (typeof entry.path === 'string' && entry.path) {
    return readFile(entry.path);
  }

  throw new Error('The 3D space did not return a model file.');
}

function assertGlb(buffer) {
  if (!buffer || !buffer.length) throw new Error('The 3D space returned an empty model.');
  if (buffer.length > MAX_GLB_BYTES) throw new Error('The generated model exceeds the 100 MB limit.');
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('The 3D space did not return a valid GLB file.');
  }
  return buffer;
}

async function generate({ prompt, image, space }) {
  const client = await connect(space);
  const api = await client.view_api();
  const endpoint = pickEndpoint(api, { needsImage: Boolean(image) });
  if (!endpoint) {
    throw new Error('The 3D space does not expose an endpoint that can build a 3D model.');
  }

  const values = {
    prompt: prompt ?? '',
    image: image ?? null,
    steps: getSetting('HF_3D_STEPS', 30),
    guidance: getSetting('HF_3D_GUIDANCE', 5.5),
    seed: getSetting('HF_3D_SEED', 42),
    octree: String(getSetting('HF_3D_OCTREE', 256)),
    background: true,
  };

  const payload = buildPayload(endpoint, values);

  const result = await withTimeout(
    client.predict(endpoint.name, payload),
    GENERATE_TIMEOUT_MS,
    '3D space',
  );

  const entry = findModelEntry(result?.data);
  if (!entry) throw new Error('The 3D space did not return a model file.');
  return assertGlb(await readModelBytes(entry));
}

/**
 * Builds a 3D model from a text prompt.
 *
 * @param {string} prompt
 * @returns {Promise<Buffer>} the GLB file
 */
export async function generateGradioText(prompt) {
  return generate({ prompt: String(prompt || '').trim(), space: getGradioTextSpace() });
}

/**
 * Builds a 3D model from an image.
 *
 * @param {{ buffer: Buffer, mimetype: string, originalname?: string }} file
 * @returns {Promise<Buffer>} the GLB file
 */
export async function generateGradioImage(file) {
  const blob = new Blob([file.buffer], { type: file.mimetype || 'image/png' });
  return generate({ prompt: '', image: blob });
}
