// Free live context for chat answers: weather, location, and news.
//
// The platform needs daily answers about the world, not just the training
// corpus: weather of a particular area, climate context, temperature, events,
// and news. Every source below is free at the volume VUX AI needs.
//
//   Weather  -> Open-Meteo geocoding + forecast. No key, no login, and a free
//               tier of far more than the 1000 requests a day the product needs.
//   News     -> NewsAPI when a key is configured, otherwise the free GDELT wire.
//
// Results are cached briefly per query so a burst of questions about the same
// area does not burn the free budgets and answers stay fast.

const WEATHER_BASE = 'https://api.open-meteo.com/v1';
const GEOCODE_BASE = 'https://geocoding-api.open-meteo.com/v1';
const NEWSAPI_URL = 'https://newsapi.org/v2/top-headlines';
const GDELT_BASE = 'https://api.gdelt.info/api/v2/doc';

const cache = new Map();

export function clearLiveContextCache() {
  cache.clear();
}

function cacheKey(value) {
  return String(value || '').toLowerCase().trim();
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response.ok) return null;
  const data = await response.json();
  return data && typeof data === 'object' ? data : null;
}

async function computeWeather(fetchImpl, query) {
  const searchUrl = `${GEOCODE_BASE}/search?name=${encodeURIComponent(String(query).trim())}&count=1&language=en&format=json`;
  const searchData = await fetchJson(fetchImpl, searchUrl);
  const place = searchData?.results?.[0];
  if (!place?.latitude || !place?.longitude) return '';

  const forecastUrl = `${WEATHER_BASE}/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`;
  const forecast = await fetchJson(fetchImpl, forecastUrl);
  const current = forecast?.current;
  if (!current) return '';

  const lines = [
    `LIVE WEATHER CONTEXT (source: Open-Meteo, free with no key required):`,
    `Weather in ${place.name}${place.country ? `, ${place.country}` : ''}: ${current.temperature_2m}°C, feels like ${current.apparent_temperature}°C, humidity ${current.relative_humidity_2m}%, condition code ${current.weather_code}, wind ${current.wind_speed_10m} km/h.`,
  ];

  const daily = forecast?.daily;
  const days = Array.isArray(daily?.time) ? daily.time.slice(0, 2) : [];
  if (days.length) {
    const summary = days.map((day, index) => {
      const max = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[index] : undefined;
      const min = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[index] : undefined;
      const code = Array.isArray(daily.weather_code) ? daily.weather_code[index] : undefined;
      return `${day}: ${min ?? '?'}°C to ${max ?? '?'}°C, condition ${code ?? '?'}`;
    }).join(' | ');
    lines.push(`Forecast: ${summary}.`);
  }

  return lines.join('\n');
}

export async function getWeatherContext(query, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const ttlMs = Number(options.cacheTtlMs ?? 10 * 60 * 1000);
  const key = cacheKey(query);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.text;

  const text = await computeWeather(fetchImpl, query);
  cache.set(key, { text, expiresAt: Date.now() + ttlMs });
  return text;
}

export async function getNewsContext(query, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const apiKey = process.env.NEWSAPI_KEY;

  if (apiKey) {
    const url = `${NEWSAPI_URL}?country=in&category=business&q=${encodeURIComponent(String(query).trim())}&pageSize=5&apiKey=${apiKey}`;
    const data = await fetchJson(fetchImpl, url);
    const articles = Array.isArray(data?.articles) ? data.articles : [];
    if (articles.length) {
      const lines = articles.map((article) => `- ${article.title || 'Untitled'} (${article.source?.name || 'source'}) — ${String(article.url || '')}`);
      return [`LIVE NEWS CONTEXT (source: NewsAPI, free tier):`, ...lines].join('\n');
    }
  }

  try {
    const queryValue = `"${String(query).trim()}"`;
    const url = `${GDELT_BASE}?query=${encodeURIComponent(queryValue)}&maxrecords=5&security=med`;
    const data = await fetchJson(fetchImpl, url);
    const articles = Array.isArray(data?.articles) ? data.articles : [];
    if (!articles.length) return '';
    const lines = articles.map((article) => {
      const title = typeof article?.title === 'string' ? article.title : 'Untitled';
      const urlValue = typeof article?.url === 'string' ? article.url : '';
      const source = typeof article?.source?.name === 'string' ? article.source.name : 'source';
      return `- ${title} (${source}) — ${urlValue}`;
    });
    return [`LIVE NEWS CONTEXT (source: GDELT, free):`, ...lines].join('\n');
  } catch {
    return '';
  }
}

// Combines the free live sources for one user question into a context block
// the chat answer can cite.
export async function buildLiveContext(query, options = {}) {
  const blocks = [];
  try {
    const weather = await getWeatherContext(query, options);
    if (weather) blocks.push(weather);
  } catch {
    // Weather is best effort; a failed lookup must never take the chat down.
  }
  try {
    const news = await getNewsContext(query, options);
    if (news) blocks.push(news);
  } catch {
    // News is best effort; a failed lookup must never take the chat down.
  }
  return blocks.join('\n\n');
}
