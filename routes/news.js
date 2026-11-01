import { Router } from 'express';
import { getNewsArticles } from '../lib/liveContext.js';

const router = Router();

// Daily news headlines.
//
// Free source chain: NewsAPI when a key is configured, otherwise the free
// GDELT wire. Results are cached server side so a client polling the daily
// digest does not burn the free budget. The generic /api rate limiter is
// skipped for this route on purpose - news is a free live source.

router.get('/', async (req, res) => {
  try {
    const topic = String(req.query.topic || req.query.q || 'latest news').trim();
    const articles = await getNewsArticles(topic, { cacheTtlMs: 30 * 60 * 1000 });
    const news = articles.map((article) => ({
      title: article.title,
      url: article.url,
      source: article.source,
      description: article.description,
    }));
    return res.json({ news, topic, source: process.env.NEWSAPI_KEY ? 'NewsAPI' : 'GDELT' });
  } catch (error) {
    return res.json({ news: [], error: 'News is temporarily unavailable.' });
  }
});

export default router;
