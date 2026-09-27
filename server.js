import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import chatRouter from './routes/chat.js';
import imageRouter from './routes/image.js';
import object3dRouter from './routes/3d.js';
import terminalRouter from './routes/terminal.js';
import projectRouter from './routes/project.js';
import iotRouter from './routes/iot.js';
import esp32Router from './routes/esp32.js';
import deviceRouter from './routes/device.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Hides X-Powered-By, sets HSTS/frame/content-type headers, and locks down
// what the page is allowed to load or connect to. connectSrc is 'self'
// only — the browser never talks to Gemini directly, so even a compromised
// script in the page can't be used to exfiltrate to the provider or reveal
// which model is in use.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://lh3.googleusercontent.com', 'blob:'],
        mediaSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        workerSrc: ["'self'", 'blob:'],
      },
    },
  })
);

// The frontend is served by this same server, so no cross-origin requests
// are needed. Only enable CORS if you explicitly host the UI elsewhere.
if (process.env.ALLOWED_ORIGIN) {
  const allowedOrigins = process.env.ALLOWED_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
  app.use(cors({ origin: allowedOrigins }));
}

app.use(express.json({ limit: '1mb' }));

// Rate limit every /api/* route per IP. Free-tier Gemini quotas are small
// and shared across all your users — this is what stops one visitor (or
// one bot) from burning through the day's quota.
const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max: Number(process.env.RATE_LIMIT_MAX) || 40, // requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const path = req.originalUrl.split('?')[0];
    return path === '/api/v1/iot/esp32/status' ||
      path === '/api/device/state' ||
      path.startsWith('/api/device/');
  },
  message: { error: 'Vux AI Studio is getting a lot of requests from you — please slow down.' },
});
app.use('/api/', apiLimiter);
app.use('/api/device', rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Device request limit reached. Please wait a moment.' },
}));
app.use('/api/device/state', rateLimit({
  windowMs: 60 * 1000,
  max: 45,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Device dashboard refresh limit reached. Please wait a moment.' },
}));

app.get('/api/config', (req, res) => {
  res.json({ requiresAccessCode: false });
});

if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
  const hostedExecutionDisabled = (_req, res) => res.status(403).json({
    error: 'HOSTED_EXECUTION_DISABLED',
    message: 'Terminal execution and project mutation are disabled on public hosting.',
  });
  app.use('/api/terminal', hostedExecutionDisabled);
  app.use('/api/project/run', hostedExecutionDisabled);
  app.use('/api/project/fix', hostedExecutionDisabled);
}

app.use('/api/chat', chatRouter);
app.use('/api/image', imageRouter);
app.use('/api/3d', object3dRouter);
app.use('/api/terminal', terminalRouter);
app.use('/api/project', projectRouter);
app.use('/api/device', deviceRouter);
app.use('/api/v1/iot/esp32', esp32Router);
app.use('/api/v1/iot', iotRouter);

const reactDist = path.join(__dirname, 'forge-ai-studio-react', 'dist');
const legacyPublic = path.join(__dirname, 'public');

// Serve the compiled React app when it exists, with the legacy UI as a local fallback.
app.use(express.static(reactDist, { index: 'index.html' }));
app.use(express.static(legacyPublic, { index: false }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(reactDist, 'index.html'), (error) => {
    if (error) next();
  });
});

if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 3001;
  const hasAnyAiKey = Boolean(process.env.GEMINI_API_KEY);

  app.listen(PORT, () => {
    console.log(`Vux AI Studio is running at http://localhost:${PORT}`);
    if (!hasAnyAiKey) console.warn('  Warning: no AI key is set — chat will fail.');
  });
}

export default app;