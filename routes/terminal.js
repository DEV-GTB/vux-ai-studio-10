import { Router } from 'express';
import { runLocalCommand } from '../lib/localExecution.js';

const router = Router();

function requireLocalMode(req, res, next) {
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'HOSTED_EXECUTION_DISABLED' });
  }
  const origin = req.get('origin');
  if (origin) {
    try {
      if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(origin).hostname.toLowerCase())) {
        return res.status(403).json({ error: 'LOCAL_TERMINAL_ONLY' });
      }
    } catch {
      return res.status(403).json({ error: 'INVALID_ORIGIN' });
    }
  }
  if (req.hostname && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(req.hostname.toLowerCase())) {
    return res.status(403).json({ error: 'LOCAL_TERMINAL_ONLY' });
  }
  if (!req.is('application/json')) return res.status(415).json({ error: 'JSON_REQUIRED' });
  return next();
}

// POST /api/terminal - Execute terminal commands
router.post('/', requireLocalMode, async (req, res) => {
  const { command } = req.body || {};
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Command is required' });
  }

  try {
    const result = await runLocalCommand(command);
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    return res.status(result.success ? 200 : 400).json({
      success: result.success,
      code: result.code,
      output: output || (result.success ? 'Command completed successfully.' : 'Command failed.'),
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Command execution failed.' });
  }
});

export default router;