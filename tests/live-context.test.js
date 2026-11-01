import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import newsRouter from '../routes/news.js';
import weatherRouter from '../routes/weather.js';
import { clearLiveContextCache } from '../lib/liveContext.js';

const app = express();
app.use('/api/news', newsRouter);
app.use('/api/weather', weatherRouter);

const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const nativeFetch = globalThis.fetch;
const originalEnvironment = {};

after(async () => {
  globalThis.fetch = nativeFetch;
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

afterEach(() => {
  globalThis.fetch = nativeFetch;
  clearLiveContextCache();
});

beforeEach(() => {
  delete process.env.NEWSAPI_KEY;
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('weather returns the current conditions and forecast for a place', async () => {
  globalThis.fetch = async (url) => {
    const urlString = String(url);
    if (urlString.includes('geocoding-api.open-meteo.com')) {
      return jsonResponse({ results: [{ name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405 }] });
    }
    return jsonResponse({
      current: { temperature_2m: 12, apparent_temperature: 10, relative_humidity_2m: 70, weather_code: 3, wind_speed_10m: 4 },
      daily: { time: ['2026-11-01', '2026-11-02'], temperature_2m_max: [14, 13], temperature_2m_min: [8, 7], weather_code: [3, 2] },
    });
  };

  const response = await nativeFetch(`${baseUrl}/api/weather?location=Berlin`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.weather.current.temperature_2m, 12);
  assert.equal(payload.weather.location.name, 'Berlin');
  assert.equal(payload.weather.daily.time.length, 2);
});

test('weather returns a null weather when no place is found', async () => {
  globalThis.fetch = async () => jsonResponse({ results: [] });

  const response = await nativeFetch(`${baseUrl}/api/weather?location=Nowhere`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.weather, null);
});

test('news returns headlines for a topic', async () => {
  globalThis.fetch = async () => jsonResponse({
    articles: [{ title: 'Test headline', url: 'https://example.com/story', source: { name: 'Test Wire' }, description: 'A test.' }],
  });

  const response = await nativeFetch(`${baseUrl}/api/news?topic=technology`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.news.length, 1);
  assert.equal(payload.news[0].title, 'Test headline');
  assert.equal(payload.topic, 'technology');
});

test('news returns an empty list when nothing is available', async () => {
  globalThis.fetch = async () => jsonResponse({});

  const response = await nativeFetch(`${baseUrl}/api/news?topic=unknown`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.news, []);
});
