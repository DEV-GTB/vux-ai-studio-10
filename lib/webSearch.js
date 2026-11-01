// Web search tool for the chat answer pipeline.
//
// The chat needs fresh answers: current events, prices, weather, anything that
// changes after training. The tool runs before the answer provider is called
// and injects the results into the prompt as a tool result, so the answer can
// cite them and stay accurate.

const SEARCH_PROVIDERS = [
  {
    name: 'tavily',
    keyEnv: 'TAVILY_API_KEY',
    url: 'https://api.tavily.com/search',
    buildBody: (query, key, maxResults) => ({
      api_key: key,
      query,
      max_results: maxResults,
      search_depth: 'basic',
    }),
  },
  {
    name: 'brave',
    keyEnv: 'BRAVE_API_KEY',
    url: 'https://api.search.brave.com/res/v1/web/search',
    buildBody: (query, key, maxResults) => ({
      api_key: key,
      q: query,
      count: maxResults,
    }),
  },
  {
    name: 'exa',
    keyEnv: 'EXA_API_KEY',
    url: 'https://api.exa.ai/v1/search',
    buildBody: (query, key, maxResults) => ({
      api_key: key,
      query,
      type: 'keyword',
      numResults: maxResults,
    }),
  },
  {
    name: 'google',
    keyEnv: 'GOOGLE_CSE_API_KEY',
    keyEnv2: 'GOOGLE_CSE_CX',
    url: 'https://www.googleapis.com/customsearch/v1',
    buildBody: (query, key, cx, maxResults) => ({
      key,
      cx,
      q: query,
      num: maxResults,
    }),
  },
];

export function getWebSearchProvider() {
  for (const provider of SEARCH_PROVIDERS) {
    const key = process.env[provider.keyEnv];
    if (!key) continue;
    if (provider.name === 'google') {
      const cx = process.env[provider.keyEnv2];
      if (!cx) continue;
      return { name: provider.name, apiKey: key, cx };
    }
    return { name: provider.name, apiKey: key };
  }
  return null;
}

function resultsFromPayload(payload, provider) {
  let results = [];
  if (provider.name === 'tavily') {
    results = (Array.isArray(payload?.results) ? payload.results : []).map((result) => ({
      title: result.title || 'Untitled',
      url: result.url || '',
      snippet: String(result.content || result.description || ''),
    }));
  } else if (provider.name === 'brave') {
    results = (Array.isArray(payload?.web?.results) ? payload.web.results : []).map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.description || '',
    }));
  } else if (provider.name === 'exa') {
    results = (Array.isArray(payload?.results) ? payload.results : []).map((result) => ({
      title: result.title || 'Untitled',
      url: result.url || '',
      snippet: String(result.excerpt || result.text || ''),
    }));
  } else if (provider.name === 'google') {
    results = (Array.isArray(payload?.items) ? payload.items : []).map((result) => ({
      title: result.title,
      url: (result.link || '').replace('http://', 'https://'),
      snippet: result.snippet || '',
    }));
  }
  return results.filter((result) => result.title || result.url);
}

async function searchWithProvider(provider, query, options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const maxResults = Number(options.maxResults ?? 5);
  const body = provider.name === 'google'
    ? provider.buildBody(query, provider.apiKey, provider.cx, maxResults)
    : provider.buildBody(query, provider.apiKey, maxResults);

  const response = await fetchImpl(provider.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Web search provider ${provider.name} failed with HTTP ${response.status}`);
  const results = resultsFromPayload(payload, provider);
  return { results, provider: provider.name };
}

async function searchWikipedia(query, options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(String(query).trim())}&limit=5&namespace=0&format=json`;
  const data = await fetchImpl(searchUrl).then((response) => response.json()).catch(() => null);
  const titles = Array.isArray(data?.[1]) ? data[1] : [];
  const results = [];
  for (const title of titles.slice(0, 3)) {
    const descriptionUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    const summary = await fetchImpl(descriptionUrl).then((response) => response.json()).catch(() => null);
    results.push({
      title,
      url: summary?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      snippet: String(summary?.extract || ''),
    });
  }
  return { results, provider: 'wikipedia' };
}

// The chat web-search tool. Returns a numbered result list the answer can cite.
export async function webSearch(query, options = {}) {
  const provider = getWebSearchProvider();
  if (provider) {
    try {
      return await searchWithProvider(provider, query, options);
    } catch (error) {
      // A failed provider falls through to the free source instead of failing
      // the answer.
    }
  }
  return searchWikipedia(query, options);
}

// Decides whether a question is a web-search question at all. Weather and
// other live-context questions are handled by the live context layer instead.
const SEARCH_SIGNALS = [
  'latest', 'news', 'today', 'current', 'update', 'updated', 'price', 'stock', 'market',
  'score', 'who won', 'when did', 'what happened', 'breaking',
  'headlines', 'search', 'look up', 'find out', 'any new', 'newest', 'recent',
];

export function looksLikeSearchRequest(text = '') {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return false;
  const signals = [
    'latest news', 'breaking news', 'news about', 'current events', 'today\'s news',
    'price of', 'stock price', 'market update',
    'who won the', 'what is the score', 'search the web', 'look up', 'google it',
  ];
  if (signals.some((signal) => value.includes(signal))) return true;
  return SEARCH_SIGNALS.some((signal) => value.includes(signal));
}
