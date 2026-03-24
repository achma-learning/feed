// ═══════════════════════════════════════════════════════════════
// FEED AGGREGATOR — Cloudflare Worker
// Fetches RSS feeds + scrapes HTML sites, returns unified JSON.
// Deploy: npx wrangler deploy
// ═══════════════════════════════════════════════════════════════

// ── RSS Feed Sources ──
const RSS_FEEDS = [
  { id: 'health-maroc', cat: 'health-maroc', name: 'Santé Maroc', url: 'https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtWnlLQUFQAQ?hl=fr&gl=MA&ceid=MA:fr', color: '#16a34a' },
  { id: 'health-world', cat: 'health-world', name: 'Health World', url: 'https://news.google.com/rss/topics/CAAqJQgKIh9DQkFTRVFvSUwyMHZNR3QwTlRFU0JXVnVMVWRDS0FBUAE?hl=en-GB&gl=GB&ceid=GB:en', color: '#2563eb' },
  { id: 'surgery', cat: 'surgery', name: 'Surgery & AI', url: 'https://news.google.com/rss/search?q=robotic+surgery+OR+surgical+robotics+OR+AI+surgery&hl=en&gl=US&ceid=US:en', color: '#9333ea' },
  { id: 'map-news', cat: 'map', name: 'MAP News', url: 'https://news.google.com/rss/search?q=site:mapnews.ma&hl=ar&gl=MA&ceid=MA:ar', color: '#0d9488' },
  { id: 'newatlas-science', cat: 'newatlas', name: 'New Atlas Science', url: 'https://newatlas.com/science/index.rss', color: '#ea580c' },
  { id: 'newatlas-energy', cat: 'newatlas', name: 'New Atlas Energy', url: 'https://newatlas.com/energy/index.rss', color: '#d97706' },
  { id: 'newatlas-medical', cat: 'newatlas', name: 'New Atlas Medical', url: 'https://newatlas.com/medical/index.rss', color: '#db2777' },
  { id: 'health-france', cat: 'health-world', name: 'Santé France', url: 'https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtWnlLQUFQAQ?hl=fr&gl=FR&ceid=FR:fr', color: '#1d4ed8' },
  { id: 'mit', cat: 'mit', name: 'MIT News', url: 'https://news.mit.edu/rss/feed', color: '#475569' },
  { id: 'has-actualites', cat: 'has', name: 'HAS Actualités', url: 'https://www.has-sante.fr/feed/Rss2.jsp?id=p_3081656', color: '#7c3aed' },
  { id: 'has-recommandations', cat: 'has', name: 'HAS Recommandations', url: 'https://www.has-sante.fr/feed/Rss2.jsp?id=p_3081452', color: '#7c3aed' },
  { id: 'has-medicaments', cat: 'has', name: 'HAS Médicaments', url: 'https://www.has-sante.fr/feed/Rss2.jsp?id=p_3081449', color: '#7c3aed' },
  { id: 'vidal-actualites', cat: 'vidal', name: 'Vidal Actualités', url: 'https://www.vidal.fr/rss.xml', color: '#0369a1' },
];

// ── HTML Scrape Sources (no RSS available) ──
const SCRAPE_SOURCES = [
  { id: 'sante-gov-activites', cat: 'sante-gov', name: 'Min. Santé Activités', url: 'https://www.sante.gov.ma/Pages/activites.aspx', color: '#15803d' },
  { id: 'sante-gov-actualites', cat: 'sante-gov', name: 'Min. Santé Actualités', url: 'https://www.sante.gov.ma/Pages/toutes_actualites.aspx', color: '#15803d' },
  { id: 'ammps-actualites', cat: 'sante-gov', name: 'AMMPS Actualités', url: 'https://ammps.sante.gov.ma/actualites', color: '#059669' },
  { id: 'hcp-publications', cat: 'hcp', name: 'HCP Publications', url: 'https://www.hcp.ma/downloads/', color: '#b45309' },
];

const FAR_BASE = 'https://revue.far.ma';
const FAR_PAGES = [1, 2, 3];

// Stable cache keys — do NOT depend on worker URL or subdomain
const FEEDS_CACHE_KEY = 'https://feed-cache.internal/api/feeds';
const PRAYER_CACHE_PREFIX = 'https://feed-cache.internal/api/prayer?ville=';


// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case '/api/feeds':
          return await handleFeeds(ctx);
        case '/api/prayer':
          return await handlePrayer(ctx, url);
        case '/health':
          return jsonResponse({ status: 'ok', time: new Date().toISOString() });
        default:
          return jsonResponse({
            name: 'Feed Aggregator API',
            endpoints: ['/api/feeds', '/api/prayer?ville=104', '/health'],
          });
      }
    } catch (err) {
      console.error('Top-level error:', err.message, err.stack);
      return jsonResponse({ error: err.message, stack: err.stack }, 500);
    }
  },

  // Cron Trigger — runs on schedule, keeps cache warm
  async scheduled(event, env, ctx) {
    console.log('Cron triggered at', new Date().toISOString());
    try {
      const data = await fetchAllFeedData();
      const cache = caches.default;
      const cacheKey = new Request(FEEDS_CACHE_KEY);

      await cache.delete(cacheKey);

      const response = new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300',
          'X-Cache': 'CRON',
        },
      });

      await cache.put(cacheKey, response.clone());
      console.log(`Cron: cached ${data.articles.length} articles from ${Object.keys(data.feedResults).length} sources`);
    } catch (err) {
      console.error('Cron error:', err.message, err.stack);
    }
  },
};


// ═══════════════════════════════════════════════════════════════
// SHARED: Fetch all feed data (used by both /api/feeds and cron)
// ═══════════════════════════════════════════════════════════════

async function fetchAllFeedData() {
  const [rssResults, farResults, scrapeResults] = await Promise.allSettled([
    fetchAllRSS(),
    safeCall(scrapeFarRevues, []),
    safeCall(scrapeAllHTML, { articles: [], feedResults: {} }),
  ]);

  const rss = rssResults.status === 'fulfilled' ? rssResults.value : { articles: [], feedResults: {} };
  const far = farResults.status === 'fulfilled' ? farResults.value : [];
  const scraped = scrapeResults.status === 'fulfilled' ? scrapeResults.value : { articles: [], feedResults: {} };

  return {
    articles: [...rss.articles, ...scraped.articles],
    far,
    feedResults: {
      ...rss.feedResults,
      ...scraped.feedResults,
      'far-revue': { ok: far.length > 0, count: far.length },
    },
    timestamp: new Date().toISOString(),
  };
}

// Wraps any async function so it never throws
async function safeCall(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.error(`safeCall(${fn.name}) failed:`, err.message);
    return fallback;
  }
}


// ═══════════════════════════════════════════════════════════════
// /api/feeds
// ═══════════════════════════════════════════════════════════════

async function handleFeeds(ctx) {
  // Try cache first
  try {
    const cache = caches.default;
    const cacheKey = new Request(FEEDS_CACHE_KEY);
    const cached = await cache.match(cacheKey);
    if (cached) {
      const resp = new Response(cached.body, cached);
      resp.headers.set('Access-Control-Allow-Origin', '*');
      resp.headers.set('X-Cache', 'HIT');
      return resp;
    }
  } catch (cacheErr) {
    console.error('Cache read failed (non-fatal):', cacheErr.message);
  }

  // Cache miss — fetch everything fresh
  const data = await fetchAllFeedData();

  const response = jsonResponse(data, 200, {
    'Cache-Control': 'public, max-age=300',
    'X-Cache': 'MISS',
  });

  // Write to cache in background
  try {
    const cache = caches.default;
    const cacheKey = new Request(FEEDS_CACHE_KEY);
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  } catch (cacheErr) {
    console.error('Cache write failed (non-fatal):', cacheErr.message);
  }

  return response;
}


// ═══════════════════════════════════════════════════════════════
// /api/prayer
// ═══════════════════════════════════════════════════════════════

async function handlePrayer(ctx, url) {
  const ville = url.searchParams.get('ville') || '104';

  // Try cache
  try {
    const cache = caches.default;
    const cacheKey = new Request(PRAYER_CACHE_PREFIX + ville);
    const cached = await cache.match(cacheKey);
    if (cached) {
      const resp = new Response(cached.body, cached);
      resp.headers.set('Access-Control-Allow-Origin', '*');
      resp.headers.set('X-Cache', 'HIT');
      return resp;
    }
  } catch (e) { /* cache miss */ }

  let data;
  try {
    const habousUrl = `https://www.habous.gov.ma/prieres/horaire-api.php?ville=${ville}`;
    const resp = await fetchWithTimeout(habousUrl, 10000);
    const html = await resp.text();
    data = parseHabousPrayer(html);
    data.source = 'habous';
  } catch (e) {
    data = { error: 'Habous API failed: ' + e.message, source: 'none', times: {} };
  }

  const response = jsonResponse(data, 200, {
    'Cache-Control': 'public, max-age=3600',
    'X-Cache': 'MISS',
  });

  try {
    const cache = caches.default;
    const cacheKey = new Request(PRAYER_CACHE_PREFIX + ville);
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  } catch (e) { /* non-fatal */ }

  return response;
}


// ═══════════════════════════════════════════════════════════════
// RSS FETCHING
// ═══════════════════════════════════════════════════════════════

async function fetchAllRSS() {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(feed => fetchSingleRSS(feed))
  );

  const articles = [];
  const feedResults = {};

  results.forEach((r, i) => {
    const feed = RSS_FEEDS[i];
    if (r.status === 'fulfilled' && r.value.length > 0) {
      articles.push(...r.value);
      feedResults[feed.id] = { ok: true, count: r.value.length };
    } else {
      const error = r.status === 'rejected'
        ? (r.reason?.message || 'Unknown error')
        : 'No articles parsed';
      feedResults[feed.id] = { ok: false, count: 0, error };
    }
  });

  return { articles, feedResults };
}

async function fetchSingleRSS(feed) {
  let resp;
  try {
    resp = await fetchWithTimeout(feed.url, 15000);
  } catch (err) {
    throw new Error(`Fetch failed: ${err.message}`);
  }

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  let text;
  try {
    text = await resp.text();
  } catch (err) {
    throw new Error(`Read body failed: ${err.message}`);
  }

  if (!text || text.length < 50) {
    throw new Error('Empty or too-short response');
  }

  // Check if response looks like RSS/Atom
  const looksLikeXML = text.includes('<rss') || text.includes('<feed') ||
                        text.includes('<item') || text.includes('<entry');

  if (looksLikeXML) {
    const articles = parseRSS(text, feed);
    if (articles.length > 0) return articles;
  }

  // Not RSS — try HTML scraping for known categories
  if (feed.cat === 'has') {
    try {
      const scraped = scrapeHAS(feed, text);
      if (scraped.length > 0) return scraped;
    } catch (e) { /* fall through */ }
  }
  if (feed.cat === 'vidal') {
    try {
      const scraped = scrapeVidal(feed, text);
      if (scraped.length > 0) return scraped;
    } catch (e) { /* fall through */ }
  }

  throw new Error('Not RSS/Atom and scraper found nothing');
}


// ═══════════════════════════════════════════════════════════════
// RSS PARSER (regex-based — no DOM available in Workers)
// ═══════════════════════════════════════════════════════════════

function parseRSS(xml, feed) {
  const articles = [];

  // RSS 2.0 <item>
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    try {
      const article = parseRSSItem(match[1], feed);
      if (article) articles.push(article);
    } catch (e) { /* skip broken item */ }
  }

  // Atom <entry> fallback
  if (articles.length === 0) {
    const entryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null) {
      try {
        const article = parseAtomEntry(match[1], feed);
        if (article) articles.push(article);
      } catch (e) { /* skip */ }
    }
  }

  return articles;
}

function parseRSSItem(item, feed) {
  const title = extractCDATA(item, 'title');
  if (!title || title.length < 3) return null;

  const link = extractTag(item, 'link') || extractAttr(item, 'link', 'href') || '';
  const pubDate = extractTag(item, 'pubDate') || extractTag(item, 'dc:date') || '';
  const desc = extractCDATA(item, 'description') || '';

  let image = '';
  try {
    const enc = item.match(/<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i)
      || item.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image/i);
    if (enc) image = enc[1];
    if (!image) { const m = item.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i); if (m) image = m[1]; }
    if (!image) { const m = item.match(/<media:content[^>]+(?:type=["']image|medium=["']image)[^>]+url=["']([^"']+)["']/i); if (m) image = m[1]; }
    if (!image) { const m = item.match(/<media:content[^>]+url=["']([^"']+)["'][^>]+(?:type=["']image|medium=["']image)/i); if (m) image = m[1]; }
    if (!image && desc) { const m = desc.match(/<img[^>]+src=["']([^"']+)["']/i); if (m) image = m[1]; }
  } catch (e) { /* no image */ }

  return {
    title: stripHTML(title),
    link,
    pubDate: pubDate || new Date().toISOString(),
    image,
    source: feed.name,
    sourceId: feed.id,
    cat: feed.cat,
    color: feed.color,
    description: stripHTML(desc).slice(0, 200),
  };
}

function parseAtomEntry(entry, feed) {
  const title = extractCDATA(entry, 'title');
  if (!title || title.length < 3) return null;

  let link = '';
  const altLink = entry.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i);
  if (altLink) link = altLink[1];
  if (!link) { const m = entry.match(/<link[^>]+href=["']([^"']+)["']/i); if (m) link = m[1]; }

  const updated = extractTag(entry, 'updated') || extractTag(entry, 'published') || '';
  const summary = extractCDATA(entry, 'summary') || extractCDATA(entry, 'content') || '';

  let image = '';
  try { const m = summary.match(/<img[^>]+src=["']([^"']+)["']/i); if (m) image = m[1]; } catch (e) {}

  return {
    title: stripHTML(title),
    link,
    pubDate: updated || new Date().toISOString(),
    image,
    source: feed.name,
    sourceId: feed.id,
    cat: feed.cat,
    color: feed.color,
    description: stripHTML(summary).slice(0, 200),
  };
}


// ═══════════════════════════════════════════════════════════════
// HTML SCRAPERS
// ═══════════════════════════════════════════════════════════════

async function scrapeAllHTML() {
  const results = await Promise.allSettled(
    SCRAPE_SOURCES.map(src => scrapeSingleHTML(src))
  );

  const articles = [];
  const feedResults = {};

  results.forEach((r, i) => {
    const src = SCRAPE_SOURCES[i];
    if (r.status === 'fulfilled' && r.value.length > 0) {
      articles.push(...r.value);
      feedResults[src.id] = { ok: true, count: r.value.length };
    } else {
      const err = r.status === 'rejected' ? (r.reason?.message || 'Failed') : 'No articles';
      feedResults[src.id] = { ok: false, count: 0, error: err };
    }
  });

  return { articles, feedResults };
}

async function scrapeSingleHTML(src) {
  const resp = await fetchWithTimeout(src.url, 15000);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  if (!html || html.length < 100) throw new Error('Empty response');

  switch (src.id) {
    case 'sante-gov-activites':
    case 'sante-gov-actualites':
      return scrapeSanteGov(html, src);
    case 'ammps-actualites':
      return scrapeAMMPS(html, src);
    case 'hcp-publications':
      return scrapeHCP(html, src);
    default:
      return [];
  }
}

function scrapeHAS(feed, html) {
  const articles = [];
  const seen = new Set();
  const linkPattern = /<a[^>]+href=["'](\/jcms\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkPattern.exec(html)) !== null) {
    const title = stripHTML(m[2]).trim();
    const link = 'https://www.has-sante.fr' + m[1];
    if (title.length > 15 && !seen.has(link)) {
      seen.add(link);
      articles.push({ title, link, pubDate: new Date().toISOString(), image: '', source: feed.name, sourceId: feed.id, cat: feed.cat, color: feed.color, description: '' });
    }
  }
  return articles;
}

function scrapeVidal(feed, html) {
  const articles = [];
  const seen = new Set();
  const pattern = /<a[^>]+href=["'](\/actualites\/[^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const title = stripHTML(m[2]).trim();
    const link = 'https://www.vidal.fr' + m[1];
    if (title.length > 15 && !seen.has(link)) {
      seen.add(link);
      articles.push({ title, link, image: '', pubDate: new Date().toISOString(), source: feed.name, sourceId: feed.id, cat: feed.cat, color: feed.color, description: '' });
    }
  }
  return articles;
}

function scrapeSanteGov(html, src) {
  const articles = [];
  const seen = new Set();
  const pattern = /<a[^>]+href=["']([^"']*(?:activite|actualite)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const title = stripHTML(m[2]).trim();
    let link = m[1];
    if (!link.startsWith('http')) link = 'https://www.sante.gov.ma' + (link.startsWith('/') ? '' : '/') + link;
    if (title.length > 10 && !seen.has(link)) {
      seen.add(link);
      articles.push({ title, link, image: '', pubDate: new Date().toISOString(), source: src.name, sourceId: src.id, cat: src.cat, color: src.color, description: '' });
    }
  }
  return articles;
}

function scrapeAMMPS(html, src) {
  const articles = [];
  const seen = new Set();
  const pattern = /<a[^>]+href=["']([^"']*(?:\/actualites\/|\/alertes\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const title = stripHTML(m[2]).trim();
    let link = m[1];
    if (!link.startsWith('http')) link = 'https://ammps.sante.gov.ma' + (link.startsWith('/') ? '' : '/') + link;
    if (title.length > 10 && !seen.has(link)) {
      seen.add(link);
      articles.push({ title, link, image: '', pubDate: new Date().toISOString(), source: src.name, sourceId: src.id, cat: src.cat, color: src.color, description: '' });
    }
  }
  return articles;
}

function scrapeHCP(html, src) {
  const articles = [];
  const seen = new Set();
  const pattern = /<a[^>]+href=["']([^"']+\.pdf|[^"']*downloads[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const title = stripHTML(m[2]).trim();
    let link = m[1];
    if (!link.startsWith('http')) link = 'https://www.hcp.ma' + (link.startsWith('/') ? '' : '/') + link;
    if (title.length > 10 && !seen.has(link)) {
      seen.add(link);
      articles.push({ title, link, image: '', pubDate: new Date().toISOString(), source: src.name, sourceId: src.id, cat: src.cat, color: src.color, description: '' });
    }
  }
  return articles;
}


// ═══════════════════════════════════════════════════════════════
// REVUE FAR SCRAPER
// ═══════════════════════════════════════════════════════════════

async function scrapeFarRevues() {
  const allRevues = [];
  const results = await Promise.allSettled(
    FAR_PAGES.map(page => scrapeFarPage(page))
  );
  for (const r of results) {
    if (r.status === 'fulfilled') allRevues.push(...r.value);
  }
  return allRevues;
}

async function scrapeFarPage(page) {
  const resp = await fetchWithTimeout(`${FAR_BASE}/revues?page=${page}`, 15000);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  return parseFarHTML(html);
}

function parseFarHTML(html) {
  const revues = [];
  const seen = new Set();
  const linkRegex = /<a[^>]+href=["']([^"']*editon[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    let link = m[1];
    if (!link.startsWith('http')) link = FAR_BASE + (link.startsWith('/') ? '' : '/') + link;
    const title = stripHTML(m[2]).trim();
    if (title && title.length > 3 && !seen.has(link)) {
      seen.add(link);
      let image = '';
      try {
        const nearbyImg = html.slice(Math.max(0, m.index - 500), m.index + 500).match(/<img[^>]+src=["']([^"']+)["']/i);
        if (nearbyImg) {
          image = nearbyImg[1];
          if (!image.startsWith('http')) image = FAR_BASE + (image.startsWith('/') ? '' : '/') + image;
        }
      } catch (e) {}
      revues.push({ title, link, image, source: 'Revue FAR', cat: 'far' });
    }
  }
  return revues;
}


// ═══════════════════════════════════════════════════════════════
// HABOUS PRAYER TIMES PARSER
// ═══════════════════════════════════════════════════════════════

function parseHabousPrayer(html) {
  const times = {};
  const prayers = [
    { key: 'Fajr', ar: '\u0627\u0644\u0641\u062c\u0631' },
    { key: 'Sunrise', ar: '\u0627\u0644\u0634\u0631\u0648\u0642' },
    { key: 'Dhuhr', ar: '\u0627\u0644\u0638\u0647\u0631' },
    { key: 'Asr', ar: '\u0627\u0644\u0639\u0635\u0631' },
    { key: 'Maghrib', ar: '\u0627\u0644\u0645\u063a\u0631\u0628' },
    { key: 'Isha', ar: '\u0627\u0644\u0639\u0634\u0627\u0621' },
  ];
  for (const p of prayers) {
    try {
      const regex = new RegExp(p.ar + '[^\\d]*(\\d{1,2}:\\d{2})');
      const match = html.match(regex);
      if (match) times[p.key] = match[1];
    } catch (e) {}
  }
  const hijriMatch = html.match(/(\u0627\u0644[\u0627-\u064a]+\s+\d+\s+[\u0627-\u064a]+\s+\d+\s*\u0647\u0640?)/);
  const hijriDate = hijriMatch ? hijriMatch[1].trim() : '';
  const gregMatch = html.match(/\u0627\u0644\u0645\u0648\u0627\u0641\u0642\s*([\d\s\u0627-\u064a]+\u0645)/);
  const gregDate = gregMatch ? gregMatch[1].trim() : '';
  return { times, hijriDate, gregDate };
}


// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

async function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'FeedAggregator/1.0 (https://github.com/achma-learning/feed)',
        'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml, text/html, */*',
      },
    });
    clearTimeout(timer);
    return resp;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

function extractTag(xml, tag) {
  try {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const m = xml.match(regex);
    return m ? m[1].trim() : '';
  } catch (e) { return ''; }
}

function extractCDATA(xml, tag) {
  try {
    const regex = new RegExp(`<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${tag}>`, 'i');
    const m = xml.match(regex);
    if (!m) return '';
    return (m[1] || m[2] || '').trim();
  } catch (e) { return ''; }
}

function extractAttr(xml, tag, attr) {
  try {
    const tagName = tag.split('[')[0];
    const regex = new RegExp(`<${tagName}[^>]+${attr}=["']([^"']+)["']`, 'i');
    const m = xml.match(regex);
    return m ? m[1] : '';
  } catch (e) { return ''; }
}

function stripHTML(str) {
  if (!str) return '';
  try {
    return str
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (e) { return ''; }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders,
    },
  });
}