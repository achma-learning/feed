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
  { id: 'map-politique', cat: 'map', name: 'MAP Politique', url: 'https://www.mapnews.ma/ar/actualites/politique/rss', color: '#0d9488' },
  { id: 'map-economie', cat: 'map', name: 'MAP Economie', url: 'https://www.mapnews.ma/ar/actualites/economie/rss', color: '#0d9488' },
  { id: 'map-social', cat: 'map', name: 'MAP Social', url: 'https://www.mapnews.ma/ar/actualites/social/rss', color: '#0d9488' },
  { id: 'map-culture', cat: 'map', name: 'MAP Culture', url: 'https://www.mapnews.ma/ar/actualites/culture/rss', color: '#0891b2' },
  { id: 'map-sport', cat: 'map', name: 'MAP Sport', url: 'https://www.mapnews.ma/ar/actualites/sport/rss', color: '#0891b2' },
  { id: 'map-monde', cat: 'map', name: 'MAP Monde', url: 'https://www.mapnews.ma/ar/actualites/monde/rss', color: '#0891b2' },
  { id: 'map-general', cat: 'map', name: 'MAP Général', url: 'https://www.mapnews.ma/ar/actualites/general/rss', color: '#0891b2' },
  { id: 'map-regional', cat: 'map', name: 'MAP Régional', url: 'https://www.mapnews.ma/ar/actualites/regional/rss', color: '#0d9488' },
  { id: 'newatlas-science', cat: 'newatlas', name: 'New Atlas Science', url: 'https://newatlas.com/science/feed/', color: '#ea580c' },
  { id: 'newatlas-energy', cat: 'newatlas', name: 'New Atlas Energy', url: 'https://newatlas.com/energy/feed/', color: '#d97706' },
  { id: 'newatlas-medical', cat: 'newatlas', name: 'New Atlas Medical', url: 'https://newatlas.com/medical/feed/', color: '#db2777' },
  { id: 'health-france', cat: 'health-world', name: 'Santé France', url: 'https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtWnlLQUFQAQ?hl=fr&gl=FR&ceid=FR:fr', color: '#1d4ed8' },
  { id: 'mit', cat: 'mit', name: 'MIT News', url: 'https://news.mit.edu/rss/feed', color: '#475569' },
  { id: 'has-actualites', cat: 'has', name: 'HAS Actualités', url: 'https://www.has-sante.fr/jcms/fc_2874902/fr/actualites?rss=true', color: '#7c3aed' },
  { id: 'has-presse', cat: 'has', name: 'HAS Presse', url: 'https://www.has-sante.fr/jcms/p_3029290/fr/actualites-presse?rss=true', color: '#7c3aed' },
  { id: 'vidal-medicaments', cat: 'vidal', name: 'Vidal Médicaments', url: 'https://www.vidal.fr/actualites/medicaments-et-produits-de-sante.xml', color: '#0369a1' },
  { id: 'vidal-diagnostic', cat: 'vidal', name: 'Vidal Diagnostic', url: 'https://www.vidal.fr/actualites/diagnostic-et-therapeutique.xml', color: '#0369a1' },
  { id: 'vidal-sante-publique', cat: 'vidal', name: 'Vidal Santé Publique', url: 'https://www.vidal.fr/actualites/sante-publique.xml', color: '#0284c7' },
  { id: 'vidal-innovation', cat: 'vidal', name: 'Vidal Innovation', url: 'https://www.vidal.fr/actualites/technologie-et-innovation.xml', color: '#0284c7' },
];

// ── HTML Scrape Sources (no RSS available) ──
const SCRAPE_SOURCES = [
  {
    id: 'sante-gov-activites', cat: 'sante-gov', name: 'Min. Santé Activités',
    url: 'https://www.sante.gov.ma/Pages/activites.aspx', color: '#15803d',
  },
  {
    id: 'sante-gov-actualites', cat: 'sante-gov', name: 'Min. Santé Actualités',
    url: 'https://www.sante.gov.ma/Pages/toutes_actualites.aspx', color: '#15803d',
  },
  {
    id: 'ammps-actualites', cat: 'sante-gov', name: 'AMMPS Actualités',
    url: 'https://ammps.sante.gov.ma/actualites', color: '#059669',
  },
  {
    id: 'hcp-publications', cat: 'hcp', name: 'HCP Publications',
    url: 'https://www.hcp.ma/downloads/', color: '#b45309',
  },
];

// Revue FAR config
const FAR_BASE = 'https://revue.far.ma';
const FAR_PAGES = [1, 2, 3];


// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case '/api/feeds':
          return await handleFeeds(request, ctx);

        case '/api/prayer':
          return await handlePrayer(request, ctx, url);

        case '/health':
          return jsonResponse({ status: 'ok', time: new Date().toISOString() });

        default:
          return jsonResponse({
            name: 'Feed Aggregator API',
            endpoints: ['/api/feeds', '/api/prayer?ville=104', '/health'],
          });
      }
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};


// ═══════════════════════════════════════════════════════════════
// /api/feeds — All news feeds + scraped sources + FAR
// ═══════════════════════════════════════════════════════════════

async function handleFeeds(request, ctx) {
  // Check cache (5 min TTL)
  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/feeds', request.url).toString());

  const cached = await cache.match(cacheKey);
  if (cached) {
    const resp = new Response(cached.body, cached);
    resp.headers.set('Access-Control-Allow-Origin', '*');
    resp.headers.set('X-Cache', 'HIT');
    return resp;
  }

  // Fetch everything in parallel
  const [rssResults, farResults, scrapeResults] = await Promise.allSettled([
    fetchAllRSS(),
    scrapeFarRevues(),
    scrapeAllHTML(),
  ]);

  const rss = rssResults.status === 'fulfilled' ? rssResults.value : { articles: [], feedResults: {} };
  const far = farResults.status === 'fulfilled' ? farResults.value : [];
  const scraped = scrapeResults.status === 'fulfilled' ? scrapeResults.value : { articles: [], feedResults: {} };

  const data = {
    articles: [...rss.articles, ...scraped.articles],
    far,
    feedResults: { ...rss.feedResults, ...scraped.feedResults, 'far-revue': { ok: far.length > 0, count: far.length } },
    timestamp: new Date().toISOString(),
  };

  const response = jsonResponse(data, 200, {
    'Cache-Control': 'public, max-age=300',
    'X-Cache': 'MISS',
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}


// ═══════════════════════════════════════════════════════════════
// /api/prayer — Prayer times from Habous.gov.ma
// ═══════════════════════════════════════════════════════════════

async function handlePrayer(request, ctx, url) {
  const ville = url.searchParams.get('ville') || '104';

  // Cache per city (1 hour)
  const cache = caches.default;
  const cacheKey = new Request(new URL(`/api/prayer?ville=${ville}`, request.url).toString());

  const cached = await cache.match(cacheKey);
  if (cached) {
    const resp = new Response(cached.body, cached);
    resp.headers.set('Access-Control-Allow-Origin', '*');
    resp.headers.set('X-Cache', 'HIT');
    return resp;
  }

  let data;
  try {
    const habousUrl = `https://www.habous.gov.ma/prieres/horaire-api.php?ville=${ville}`;
    const resp = await fetchWithTimeout(habousUrl, 10000);
    const html = await resp.text();
    data = parseHabousPrayer(html);
    data.source = 'habous';
  } catch (e) {
    data = { error: 'Habous API failed: ' + e.message, source: 'none' };
  }

  const response = jsonResponse(data, 200, {
    'Cache-Control': 'public, max-age=3600',
    'X-Cache': 'MISS',
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
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
      const error = r.status === 'rejected' ? r.reason?.message : 'No articles parsed';
      feedResults[feed.id] = { ok: false, count: 0, error };
    }
  });

  return { articles, feedResults };
}

async function fetchSingleRSS(feed) {
  const resp = await fetchWithTimeout(feed.url, 15000);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const xml = await resp.text();

  // Validate it looks like XML/RSS
  if (!xml.includes('<') || (!xml.includes('<rss') && !xml.includes('<feed') && !xml.includes('<item') && !xml.includes('<entry'))) {
    // For HAS/Vidal: the URL might return HTML instead of RSS.
    // Try to detect and fall back to scraping.
    if (feed.cat === 'has') return scrapeHAS(feed, xml);
    if (feed.cat === 'vidal') return scrapeVidal(feed, xml);
    throw new Error('Response is not RSS/Atom XML');
  }

  return parseRSS(xml, feed);
}


// ═══════════════════════════════════════════════════════════════
// RSS PARSER (regex-based, no DOM needed in Workers)
// ═══════════════════════════════════════════════════════════════

function parseRSS(xml, feed) {
  const articles = [];

  // Try RSS 2.0 <item> elements
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const article = parseRSSItem(item, feed);
    if (article) articles.push(article);
  }

  // Try Atom <entry> if no RSS items found
  if (articles.length === 0) {
    const entryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];
      const article = parseAtomEntry(entry, feed);
      if (article) articles.push(article);
    }
  }

  return articles;
}

function parseRSSItem(item, feed) {
  const title = extractCDATA(item, 'title');
  const link = extractTag(item, 'link') || extractAttr(item, 'link', 'href');
  const pubDate = extractTag(item, 'pubDate') || extractTag(item, 'dc:date');
  const desc = extractCDATA(item, 'description');

  if (!title) return null;

  let image = '';
  // enclosure
  const enc = item.match(/<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i)
    || item.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image/i);
  if (enc) image = enc[1];
  // media:thumbnail
  if (!image) { const m = item.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i); if (m) image = m[1]; }
  // media:content with image type
  if (!image) { const m = item.match(/<media:content[^>]+(?:type=["']image|medium=["']image)[^>]+url=["']([^"']+)["']/i); if (m) image = m[1]; }
  if (!image) { const m = item.match(/<media:content[^>]+url=["']([^"']+)["'][^>]+(?:type=["']image|medium=["']image)/i); if (m) image = m[1]; }
  // img in description
  if (!image) { const m = desc.match(/<img[^>]+src=["']([^"']+)["']/i); if (m) image = m[1]; }

  return {
    title: stripHTML(title),
    link: link || '',
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
  // Atom links use <link href="..." />
  const link = extractAttr(entry, 'link[rel="alternate"]', 'href')
    || extractAttr(entry, 'link', 'href');
  const updated = extractTag(entry, 'updated') || extractTag(entry, 'published');
  const summary = extractCDATA(entry, 'summary') || extractCDATA(entry, 'content');

  if (!title) return null;

  let image = '';
  const m = (summary || '').match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) image = m[1];

  return {
    title: stripHTML(title),
    link: link || '',
    pubDate: updated || new Date().toISOString(),
    image,
    source: feed.name,
    sourceId: feed.id,
    cat: feed.cat,
    color: feed.color,
    description: stripHTML(summary || '').slice(0, 200),
  };
}


// ═══════════════════════════════════════════════════════════════
// HTML SCRAPERS — Sites without RSS
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
      feedResults[src.id] = { ok: false, count: 0, error: r.reason?.message || 'No articles' };
    }
  });

  return { articles, feedResults };
}

async function scrapeSingleHTML(src) {
  const resp = await fetchWithTimeout(src.url, 15000);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();

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

// ── HAS fallback scraper (when RSS URL returns HTML) ──
function scrapeHAS(feed, html) {
  const articles = [];
  // HAS uses JCMS — look for article links in the actualites page
  const pattern = /<a[^>]+href=["'](\/jcms\/[^"']+)["'][^>]*class=["'][^"']*publication-title[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    articles.push({
      title: stripHTML(m[2]).trim(),
      link: 'https://www.has-sante.fr' + m[1],
      pubDate: new Date().toISOString(),
      image: '',
      source: feed.name, sourceId: feed.id, cat: feed.cat, color: feed.color,
      description: '',
    });
  }

  // Broader fallback: look for any structured article-like links
  if (articles.length === 0) {
    const linkPattern = /<a[^>]+href=["'](\/jcms\/[^"']+\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const seen = new Set();
    while ((m = linkPattern.exec(html)) !== null) {
      const title = stripHTML(m[2]).trim();
      const link = 'https://www.has-sante.fr' + m[1];
      if (title.length > 20 && !seen.has(link)) {
        seen.add(link);
        articles.push({
          title, link,
          pubDate: new Date().toISOString(),
          image: '',
          source: feed.name, sourceId: feed.id, cat: feed.cat, color: feed.color,
          description: '',
        });
      }
    }
  }

  return articles;
}

// ── Vidal fallback scraper ──
function scrapeVidal(feed, html) {
  const articles = [];
  // Vidal article cards typically have structured links
  const pattern = /<a[^>]+href=["'](\/actualites\/[^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const title = stripHTML(m[2]).trim();
    const link = 'https://www.vidal.fr' + m[1];
    if (title.length > 15 && !seen.has(link)) {
      seen.add(link);

      // Try to find an image near this article
      let image = '';
      const imgPattern = new RegExp(`<img[^>]+src=["']([^"']+)[^>]+[^>]*>`, 'i');
      const imgMatch = html.slice(Math.max(0, m.index - 500), m.index).match(imgPattern);
      if (imgMatch) image = imgMatch[1].startsWith('http') ? imgMatch[1] : 'https://www.vidal.fr' + imgMatch[1];

      articles.push({
        title, link, image,
        pubDate: new Date().toISOString(),
        source: feed.name, sourceId: feed.id, cat: feed.cat, color: feed.color,
        description: '',
      });
    }
  }
  return articles;
}

// ── sante.gov.ma scraper ──
function scrapeSanteGov(html, src) {
  const articles = [];
  // SharePoint-based site — articles in list items
  const pattern = /<a[^>]+href=["']([^"']*(?:activite|actualite)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const title = stripHTML(m[2]).trim();
    let link = m[1];
    if (!link.startsWith('http')) link = 'https://www.sante.gov.ma' + (link.startsWith('/') ? '' : '/') + link;
    if (title.length > 10 && !seen.has(link)) {
      seen.add(link);
      articles.push({
        title, link, image: '',
        pubDate: new Date().toISOString(),
        source: src.name, sourceId: src.id, cat: src.cat, color: src.color,
        description: '',
      });
    }
  }
  return articles;
}

// ── AMMPS scraper ──
function scrapeAMMPS(html, src) {
  const articles = [];
  const pattern = /<a[^>]+href=["']([^"']*(?:\/actualites\/|\/alertes\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const title = stripHTML(m[2]).trim();
    let link = m[1];
    if (!link.startsWith('http')) link = 'https://ammps.sante.gov.ma' + (link.startsWith('/') ? '' : '/') + link;
    if (title.length > 10 && !seen.has(link)) {
      seen.add(link);
      articles.push({
        title, link, image: '',
        pubDate: new Date().toISOString(),
        source: src.name, sourceId: src.id, cat: src.cat, color: src.color,
        description: '',
      });
    }
  }
  return articles;
}

// ── HCP scraper ──
function scrapeHCP(html, src) {
  const articles = [];
  // HCP uses a download/publication listing
  const pattern = /<a[^>]+href=["']([^"']+\.pdf|[^"']*downloads[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const title = stripHTML(m[2]).trim();
    let link = m[1];
    if (!link.startsWith('http')) link = 'https://www.hcp.ma' + (link.startsWith('/') ? '' : '/') + link;
    if (title.length > 10 && !seen.has(link)) {
      seen.add(link);
      articles.push({
        title, link, image: '',
        pubDate: new Date().toISOString(),
        source: src.name, sourceId: src.id, cat: src.cat, color: src.color,
        description: '',
      });
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

  // Match card blocks — FAR uses .card.card-hover-shadow
  // We look for link + img + title patterns within card structures
  const cardPattern = /<div[^>]*class=["'][^"']*card[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let cardMatch;
  while ((cardMatch = cardPattern.exec(html)) !== null) {
    const block = cardMatch[1];

    // Extract link (editon pages)
    const linkMatch = block.match(/<a[^>]+href=["']([^"']*editon[^"']*)["']/i);
    if (!linkMatch) continue;

    let link = linkMatch[1];
    if (link && !link.startsWith('http')) {
      link = FAR_BASE + (link.startsWith('/') ? '' : '/') + link;
    }

    // Extract image
    let image = '';
    const imgMatch = block.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) {
      image = imgMatch[1];
      if (image && !image.startsWith('http')) {
        image = FAR_BASE + (image.startsWith('/') ? '' : '/') + image;
      }
    }

    // Extract title
    let title = '';
    const titleMatch = block.match(/<[^>]*class=["'][^"']*card-title[^"']*["'][^>]*>([\s\S]*?)<\//i);
    if (titleMatch) title = stripHTML(titleMatch[1]).trim();
    if (!title) {
      // Fallback: use link text
      const aTextMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
      if (aTextMatch) title = stripHTML(aTextMatch[1]).trim();
    }

    if (title && link) {
      revues.push({ title, link, image, source: 'Revue FAR', cat: 'far' });
    }
  }

  // Broader fallback: find all links to /editon/ pages
  if (revues.length === 0) {
    const linkRegex = /<a[^>]+href=["']([^"']*editon[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const seen = new Set();
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      let link = m[1];
      if (!link.startsWith('http')) link = FAR_BASE + (link.startsWith('/') ? '' : '/') + link;
      const title = stripHTML(m[2]).trim();
      if (title && !seen.has(link)) {
        seen.add(link);
        // Look for nearby image
        let image = '';
        const nearbyImg = html.slice(Math.max(0, m.index - 300), m.index + 300).match(/<img[^>]+src=["']([^"']+)["']/i);
        if (nearbyImg) {
          image = nearbyImg[1];
          if (!image.startsWith('http')) image = FAR_BASE + (image.startsWith('/') ? '' : '/') + image;
        }
        revues.push({ title, link, image, source: 'Revue FAR', cat: 'far' });
      }
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
    const regex = new RegExp(p.ar + '[^\\d]*(\\d{1,2}:\\d{2})');
    const match = html.match(regex);
    if (match) times[p.key] = match[1];
  }
  // Hijri date
  const hijriMatch = html.match(/(\u0627\u0644[\u0627-\u064a]+\s+\d+\s+[\u0627-\u064a]+\s+\d+\s*\u0647\u0640?)/);
  const hijriDate = hijriMatch ? hijriMatch[1].trim() : '';
  const gregMatch = html.match(/\u0627\u0644\u0645\u0648\u0627\u0641\u0642\s*([\d\s\u0627-\u064a]+\u0645)/);
  const gregDate = gregMatch ? gregMatch[1].trim() : '';

  return { times, hijriDate, gregDate };
}


// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
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
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(regex);
  return m ? m[1].trim() : '';
}

function extractCDATA(xml, tag) {
  // Handle CDATA sections: <tag><![CDATA[content]]></tag>
  const regex = new RegExp(`<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${tag}>`, 'i');
  const m = xml.match(regex);
  if (!m) return '';
  return (m[1] || m[2] || '').trim();
}

function extractAttr(xml, tag, attr) {
  // Extract attribute from a tag, handling self-closing tags
  const tagName = tag.split('[')[0]; // strip [attr=val] selectors
  const regex = new RegExp(`<${tagName}[^>]+${attr}=["']([^"']+)["']`, 'i');
  const m = xml.match(regex);
  return m ? m[1] : '';
}

function stripHTML(str) {
  if (!str) return '';
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
