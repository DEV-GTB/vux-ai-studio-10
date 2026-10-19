import { Router } from 'express';
import { GENERIC_ERROR } from '../lib/identity.js';
import { getCloudflareAccounts, getModelList, runCloudflareModel, extractImagePayload, extractAudioPayload, extractVideoPayload, extractTranscription, extractGeneratedText, extractEmbeddings, extractMediaPayload } from '../lib/cloudflare.js';

const router = Router();

// Voice requests prefer the secondary Cloudflare account, like every other
// request that is not an image.
function getCloudflareTextToSpeechModels() {
  return getModelList('tts');
}

function getCloudflareSpeechToTextModels() {
  return getModelList('stt');
}

function getCartesiaApiKey() {
  return process.env.CARTESIA_API_KEY || process.env.Cartesia_API_KEY || '';
}

function getCartesiaVoice() {
  return process.env.CARTESIA_VOICE || 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4';
}

function extractGeneratedAudio(result) {
  const audioBase64 =
    typeof result === 'string'
      ? result
      : typeof result?.audio === 'string'
        ? result.audio
        : '';
  if (!audioBase64) {
    throw new Error('The voice service returned no audio.');
  }
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  if (!audioBuffer.length) {
    throw new Error('The voice service returned an empty audio file.');
  }
  return audioBuffer;
}

function extractSpeechToText(result) {
  const candidate =
    typeof result === 'string'
      ? result
      : typeof result?.text === 'string'
        ? result.text
        : typeof result?.transcription === 'string'
          ? result.transcription
          : typeof result?.transcript === 'string'
            ? result.transcript
            : '';
  if (!candidate.trim()) {
    throw new Error('The speech service returned no text.');
  }
  return candidate.trim();
}

async function generateWithCloudflareTextToSpeech(modelName, input, account) {
  const body = buildCloudflareTextToSpeechRequest(modelName, input);

  const data = await runCloudflareModel(modelName, body, account);
  const { base64, contentType: declaredType } = extractMediaPayload(data, { contentType: 'audio/mpeg' });
  if (!base64) throw new Error('The voice service returned no audio.');
  const audioBuffer = Buffer.from(base64, 'base64');
  const contentType = isProbablyWav(audioBuffer) ? 'audio/wav' : (declaredType || 'audio/mpeg');
  return { buffer: audioBuffer, contentType };
}

// Each speech model family expects a different body. Building it here keeps
// the provider loop model-agnostic.
function buildCloudflareTextToSpeechRequest(modelName, input) {
  if (modelName.startsWith('@cf/deepgram/')) {
    return { text: input.text };
  }
  if (modelName === '@cf/myshell-ai/melotts') {
    return { prompt: input.text };
  }

  const body = { text: input.text };
  if (modelName === 'elevenlabs/eleven-v3') {
    if (input.voiceId) body.voice_id = input.voiceId;
    if (input.outputFormat) body.output_format = input.outputFormat;
  }
  return body;
}

function isProbablyWav(buffer) {
  return buffer.length > 44 && buffer.toString('ascii', 0, 4) === 'RIFF';
}

// The catalogue speech models take raw base64 audio. When the caller only has
// a URL, the audio is fetched and encoded first.
async function buildCloudflareSpeechToTextRequest(modelName, input) {
  if (modelName.startsWith('@cf/')) {
    const base64 = await resolveAudioBase64(input);
    if (!base64) throw new Error('No audio input for this speech model.');
    return { audio: base64 };
  }

  const body = {};
  if (modelName === 'assemblyai/universal-3.5-pro' && input.audioUrl) {
    body.audio_url = input.audioUrl;
  } else if (modelName === 'xai/grok-stt' && input.audioUrl) {
    body.url = input.audioUrl;
  } else if (modelName === 'openai/gpt-4o-transcribe' && input.audioBase64) {
    body.file = `data:audio/wav;base64,${input.audioBase64}`;
  }

  if (Object.keys(body).length === 0) {
    // This model cannot use the provided audio, so try the next model.
    throw new Error('No audio input for this speech model.');
  }
  return body;
}

async function resolveAudioBase64(input) {
  if (input.audioBase64) return input.audioBase64;
  if (!input.audioUrl) return '';

  const response = await fetch(input.audioUrl);
  if (!response.ok) throw new Error('The audio file could not be downloaded.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('The audio file was empty.');
  return buffer.toString('base64');
}

async function generateWithCloudflareSpeechToText(modelName, input, account) {
  const body = await buildCloudflareSpeechToTextRequest(modelName, input);
  const data = await runCloudflareModel(modelName, body, account);
  const text = extractTranscription(data);
  return { text };
}

// Cartesia's REST endpoint is POST /tts/bytes and it requires a
// Cartesia-Version header. The older /v1/tts path returns 404, and the API
// answers "Invalid Cartesia-Version header" when the header is missing.
async function generateWithCartesiaTextToSpeech(input) {
  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': getCartesiaApiKey(),
      'Cartesia-Version': process.env.CARTESIA_VERSION || '2026-08-14',
    },
    body: JSON.stringify({
      api_key: getCartesiaApiKey(),
      model_id: process.env.CARTESIA_MODEL || 'sonic-3.6',
      voice_id: getCartesiaVoice(),
      transcript: input.text,
      output_format: {
        container: 'wav',
        encoding: 'pcm_s16le',
        sample_rate: 44100,
      },
    }),
  });

  const contentType = response.headers.get('content-type') || 'audio/wav';
  const audioBuffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    const failure = audioBuffer.toString('utf8');
    let message = `Cartesia returned HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(failure);
      message = parsed.message || parsed.title || parsed.error || message;
    } catch {
      message = failure.slice(0, 180) || message;
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (!audioBuffer.length) {
    throw new Error('The voice service returned an empty audio file.');
  }
  return { buffer: audioBuffer, contentType };
}

function sendVoiceError(res, error) {
  const failureText = String(error?.message || '').toLowerCase();
  console.error('[voice] request failed:', error?.status || failureText.slice(0, 180) || 'unknown error');
  const status = error?.status === 429 ? 429 : 502;
  return res.status(status).json({ error: status === 429 ? 'Voice generation is busy. Please try again shortly.' : GENERIC_ERROR.chat });
}

// POST /api/tts  { text, voiceId, outputFormat }
async function handleTextToSpeech(req, res) {
  const { text, voiceId, outputFormat } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'A text is required.' });
  }
  if (!getCartesiaApiKey() && !getCloudflareAccounts().length) {
    return res.status(503).json({ error: 'Text-to-speech is not configured. Add CARTESIA_API_KEY or Cloudflare API credentials to the server environment.' });
  }

  const input = {
    text: String(text).trim(),
    voiceId,
    outputFormat,
  };

  const providers = [];
  if (getCartesiaApiKey()) {
    providers.push({
      label: 'Cartesia',
      run: () => generateWithCartesiaTextToSpeech(input),
    });
  }
  for (const modelName of getCloudflareTextToSpeechModels()) {
    for (const account of getCloudflareAccounts()) {
      providers.push({
        label: `Cloudflare ${modelName}`,
        run: () => generateWithCloudflareTextToSpeech(modelName, input, account),
      });
    }
  }

  let failure;
  for (const provider of providers) {
    try {
      const result = await provider.run();
      const audioBase64 = result.buffer.toString('base64');
      return res.json({ audio: `data:${result.contentType};base64,${audioBase64}` });
    } catch (error) {
      failure = error;
      console.error(`[tts] ${provider.label} failed:`, error?.message || error);
    }
  }

  return sendVoiceError(res, failure);
}

// POST /api/stt  { audioBase64, audioUrl }
async function handleSpeechToText(req, res) {
  const { audioBase64, audioUrl } = req.body || {};
  const hasBase64 = typeof audioBase64 === 'string' && audioBase64.length > 0;
  const hasUrl = typeof audioUrl === 'string' && audioUrl.trim();
  if (!hasBase64 && !hasUrl) {
    return res.status(400).json({ error: 'An audio file or audio URL is required.' });
  }
  if (!getCloudflareAccounts().length) {
    return res.status(503).json({ error: 'Speech-to-text is not configured. Add Cloudflare API credentials to the server environment.' });
  }

  const input = {
    audioBase64,
    audioUrl: hasUrl ? audioUrl.trim() : '',
  };

  const providers = [];
  for (const modelName of getCloudflareSpeechToTextModels()) {
    for (const account of getCloudflareAccounts()) {
      providers.push({
        label: `Cloudflare ${modelName}`,
        run: () => generateWithCloudflareSpeechToText(modelName, input, account),
      });
    }
  }

  let failure;
  for (const provider of providers) {
    try {
      const result = await provider.run();
      return res.json({ text: result.text });
    } catch (error) {
      failure = error;
      console.error(`[stt] ${provider.label} failed:`, error?.message || error);
    }
  }

  return sendVoiceError(res, failure);
}

router.post('/tts', handleTextToSpeech);
router.post('/stt', handleSpeechToText);

// The endpoints are also served on their own paths, so a client can call
// /api/tts and /api/stt without knowing about the combined router.
export const ttsRouter = Router();
export const sttRouter = Router();

ttsRouter.post('/', handleTextToSpeech);
sttRouter.post('/', handleSpeechToText);

export default router;
