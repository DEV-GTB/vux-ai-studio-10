import { Router } from 'express';
import { getWeatherData } from '../lib/liveContext.js';

const router = Router();

// Weather and forecast for a place.
//
// Free source: Open-Meteo (geocoding + forecast, no key required). The generic
// /api rate limiter is skipped for this route on purpose - weather is a free
// live source and must stay available for the daily quotas.

router.get('/', async (req, res) => {
  try {
    const location = String(req.query.location || req.query.q || 'global').trim();
    const data = await getWeatherData(location, { cacheTtlMs: 10 * 60 * 1000 });
    if (!data) {
      return res.json({ weather: null, error: 'No location found.' });
    }
    return res.json({
      weather: {
        location: {
          name: data.place.name,
          country: data.place.country,
          latitude: data.place.latitude,
          longitude: data.place.longitude,
        },
        current: data.current,
        daily: data.daily,
      },
    });
  } catch (error) {
    return res.json({ weather: null, error: 'Weather is temporarily unavailable.' });
  }
});

export default router;
