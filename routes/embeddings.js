import { Router } from 'express';
import { GENERIC_ERROR } from '../lib/identity.js';
import { getCloudflareAccounts, getModelList, runCloudflareModel, extractImagePayload, extractAudioPayload, extractVideoPayload, extractTranscription, extractGeneratedText, extractEmbeddings } from '../lib/cloudflare.js';

const router = Router();

// Text embeddings run on the secondary Cloudflare account, like every other
// request that is not an image.
function getCloudflareEmbeddingModels() {
  return getModelList('embeddings');
}

async function generateWithCloudflareEmbedding(modelName, texts, account) {
  const data = await runCloudflareModel(modelName, { text: texts }, account);
  const embeddings = extractEmbeddings(data);
  return { embeddings };
}

function sendEmbeddingError(res, error) {
  const failureText = String(error?.message || '').toLowerCase();
  console.error('[embeddings] request failed:', error?.status || failureText.slice(0, 180) || 'unknown error');
  const status = error?.status === 429 ? 429 : 502;
  return res.status(status).json({ error: status === 429 ? 'Embedding generation is busy. Please try again shortly.' : GENERIC_ERROR.chat });
}

// POST /api/embeddings  { text: string | string[] }
router.post('/', async (req, res) => {
  const { text } = req.body || {};
  const input = typeof text === 'string' ? [text] : Array.isArray(text) ? text : [];
  if (!input.length || input.some((value) => !value.trim())) {
    return res.status(400).json({ error: 'A text or list of texts is required.' });
  }
  if (!getCloudflareAccounts().length) {
    return res.status(503).json({ error: 'Embedding generation is not configured. Add Cloudflare API credentials to the server environment.' });
  }

  const providers = [];
  for (const modelName of getCloudflareEmbeddingModels()) {
    for (const account of getCloudflareAccounts()) {
      providers.push({
        label: `Cloudflare ${modelName}`,
        run: () => generateWithCloudflareEmbedding(modelName, input, account),
      });
    }
  }

  let failure;
  for (const provider of providers) {
    try {
      const result = await provider.run();
      return res.json({ embeddings: result.embeddings });
    } catch (error) {
      failure = error;
      console.error(`[embeddings] ${provider.label} failed:`, error?.message || error);
    }
  }

  return sendEmbeddingError(res, failure);
});

export default router;
