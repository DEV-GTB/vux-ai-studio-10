import app from '../server.js';

function legacyHandler(req, res) {
  res.status(200).json({ requiresAccessCode: false });
}

export default app;
