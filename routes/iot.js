import express from 'express';

const router = express.Router();

function backendUrl() {
  return process.env.IOT_BACKEND_URL?.replace(/\/$/, '');
}

router.use(async (req, res) => {
  const baseUrl = backendUrl();

  if (!baseUrl) {
    return res.status(503).json({
      error: 'BACKEND_NOT_CONFIGURED',
      message: 'The NEXUS IoT backend is not configured.',
    });
  }

  const target = `${baseUrl}${req.path}${req.url.includes('?') ? req.url.slice(req.path.length) : ''}`;
  const headers = { Accept: 'application/json' };

  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

  try {
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });

    const contentType = response.headers.get('content-type') || 'application/json';
    res.status(response.status).type(contentType);
    return res.send(await response.text());
  } catch {
    return res.status(502).json({
      error: 'BACKEND_UNAVAILABLE',
      message: 'The NEXUS IoT backend could not be reached.',
    });
  }
});

export default router;
