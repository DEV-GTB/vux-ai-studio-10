import { Router } from 'express';
import { GENERIC_ERROR, IDENTITY_PROMPT, scrubIdentity } from '../lib/identity.js';

const router = Router();
const HF_CHAT_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';
const DEFAULT_VISION_FALLBACK = 'Qwen/Qwen2.5-VL-7B-Instruct:featherless-ai';
const VISION_INSTRUCTIONS = `${IDENTITY_PROMPT}\n\nReply in English with a concise, useful description of the supplied image. Do not guess identities or sensitive attributes.`;

function isAllowedImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

router.post('/', async (req, res) => {
  const { imageUrl, message } = req.body || {};
  if (typeof imageUrl !== 'string' || !imageUrl.trim() || imageUrl.length > 4096 || !isAllowedImageUrl(imageUrl)) {
    return res.status(400).json({ error: 'A valid HTTPS image URL is required.' });
  }
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'A message about the image is required.' });
  }
  if (message.length > 4000) {
    return res.status(400).json({ error: 'Please keep the message under 4,000 characters.' });
  }
  if (!process.env.HF_TOKEN || process.env.HF_TOKEN === 'your_huggingface_api_key_here') {
    return res.status(503).json({ error: 'Image understanding is not configured.' });
  }

  try {
    const visionModels = [...new Set([
      process.env.HF_VISION_MODEL || 'google/gemma-4-12B-it',
      process.env.HF_VISION_FALLBACK_MODEL || DEFAULT_VISION_FALLBACK,
    ])];
    let response;
    let responseBody = '';
    let data = {};

    for (const model of visionModels) {
      response = await fetch(HF_CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: VISION_INSTRUCTIONS },
            {
              role: 'user',
              content: [
                { type: 'text', text: message.trim() },
                { type: 'image_url', image_url: { url: imageUrl.trim() } },
              ],
            },
          ],
          stream: false,
        }),
      });

      responseBody = await response.text();
      data = {};
      try { data = responseBody ? JSON.parse(responseBody) : {}; } catch { data = {}; }
      if (response.ok) break;

      const upstreamReason = `${data?.error?.code || ''} ${data?.error?.message || data?.error || ''}`;
      if (response.status !== 400 || !/model_not_supported|not supported/i.test(upstreamReason)) break;
    }

    if (!response.ok) {
      const detail = responseBody;
      let reason = 'request-error';
      try {
        const errorBody = JSON.parse(detail);
        reason = errorBody?.error?.code || errorBody?.error?.type || errorBody?.error?.message || reason;
      } catch {
        reason = detail.slice(0, 180) || reason;
      }
      console.error('[vision] request failed:', response.status, String(reason).slice(0, 180));
      const status = response.status === 429 ? 429 : 502;
      return res.status(status).json({ error: status === 429 ? 'Image understanding is busy. Please try again shortly.' : GENERIC_ERROR.chat });
    }

    const content = data.choices?.[0]?.message?.content;
    const reply = typeof content === 'string'
      ? content.trim()
      : Array.isArray(content)
        ? content.map((part) => part?.text || '').join('\n').trim()
        : '';
    if (!reply) return res.status(502).json({ error: GENERIC_ERROR.chat });
    return res.json({ reply: scrubIdentity(reply) });
  } catch (error) {
    console.error('[vision] request failed:', error?.message || error);
    return res.status(502).json({ error: GENERIC_ERROR.chat });
  }
});

export default router;
