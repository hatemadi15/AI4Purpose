const axios = require('axios');
const cheerio = require('cheerio');

const SCRAPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a timestamp is within the last N minutes
 */
function isWithinWindow(timestamp, windowMs = SCRAPE_WINDOW_MS) {
    if (!timestamp) return false;
    const time = new Date(timestamp).getTime();
    if (Number.isNaN(time)) return false;
    return (Date.now() - time) <= windowMs;
}

/**
 * Parse Google News RSS XML and extract articles
 */
function parseGoogleRSS(xml) {
    const $ = cheerio.load(xml, { xmlMode: true });
    const articles = [];

    $('item').each((i, el) => {
        const $el = $(el);
        const rawTitle = $el.find('title').text().trim();
        const link = $el.find('link').text().trim();
        const pubDate = $el.find('pubDate').text().trim();
        const sourceEl = $el.find('source');
        const sourceName = sourceEl.text().trim() || 'Unknown';
        const sourceUrl = sourceEl.attr('url') || '';

        // Google News appends " - Source Name" to titles
        let title = rawTitle;
        if (title.includes(' - ') && sourceName) {
            title = title.replace(` - ${sourceName}`, '').trim();
        }

        articles.push({
            title,
            url: link,
            source: sourceName,
            source_url: sourceUrl,
            posted_at: pubDate ? new Date(pubDate).toISOString() : null,
            description: title
        });
    });

    return articles;
}

/**
 * Fetch Google News RSS for a query
 */
async function fetchGoogleNewsRSS(query, lang = 'en', country = 'LB') {
    const ceid = `${country}:${lang}`;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}&gl=${country}&ceid=${ceid}`;

    const response = await axios.get(url, {
        timeout: 15000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml'
        }
    });

    return parseGoogleRSS(response.data);
}

// ─── 1. Google News General Scraper ──────────────────────────────────────────

async function scrapeGoogleNews(region = 'Lebanon') {
    const source = 'Google News';
    try {
        const queries = [
            `${region} crisis OR emergency OR airstrike when:1d`,
            `${region} breaking news when:1d`,
            `لبنان عاجل أخبار`
        ];

        const allArticles = [];

        for (const query of queries) {
            try {
                const articles = await fetchGoogleNewsRSS(query);
                allArticles.push(...articles);
            } catch (err) {
                console.error(`[Scraper] Google query "${query}" failed:`, err.message);
            }
        }

        // Dedupe by title
        const seen = new Set();
        const unique = allArticles.filter(a => {
            const key = a.title.toLowerCase().substring(0, 50);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Filter to last 5 minutes where possible; fallback to most recent
        const recentArticles = unique.filter(a => isWithinWindow(a.posted_at));
        const finalArticles = recentArticles.length > 0 ? recentArticles : unique.slice(0, 10);

        console.log(`[Scraper] Google News: ${unique.length} total, ${recentArticles.length} within 5min, returning ${finalArticles.length}`);

        return {
            source,
            success: true,
            findings: finalArticles.map(a => ({
                id: `google_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                source: `Google News (${a.source})`,
                source_type: 'web_scraper',
                title: a.title,
                description: a.description,
                url: a.url,
                posted_at: a.posted_at || new Date().toISOString(),
                fetched_at: new Date().toISOString(),
                language: 'en'
            })),
            count: finalArticles.length
        };
    } catch (error) {
        console.error(`[Scraper] ${source} error:`, error.message);
        return { source, success: false, error: error.message, findings: [], count: 0 };
    }
}

// ─── 2. MTV Lebanon Scraper (via Google News) ────────────────────────────────

async function scrapeMTV() {
    const source = 'MTV Lebanon';
    try {
        const articles = await fetchGoogleNewsRSS('site:mtv.com.lb OR source:"MTV Lebanon" Lebanon when:1d');
        const filtered = articles.length > 0 ? articles : (await fetchGoogleNewsRSS('MTV Lebanon news when:1d'));

        const recentArticles = filtered.filter(a => isWithinWindow(a.posted_at));
        const finalArticles = recentArticles.length > 0 ? recentArticles : filtered.slice(0, 5);

        console.log(`[Scraper] MTV: ${filtered.length} total, ${recentArticles.length} within 5min, returning ${finalArticles.length}`);

        return {
            source,
            success: true,
            findings: finalArticles.map(a => ({
                id: `mtv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                source: a.source || source,
                source_type: 'web_scraper',
                title: a.title,
                description: a.description,
                url: a.url,
                posted_at: a.posted_at || new Date().toISOString(),
                fetched_at: new Date().toISOString(),
                language: 'en'
            })),
            count: finalArticles.length
        };
    } catch (error) {
        console.error(`[Scraper] ${source} error:`, error.message);
        return { source, success: false, error: error.message, findings: [], count: 0 };
    }
}

// ─── 3. Al Jadeed Scraper (via Google News) ──────────────────────────────────

async function scrapeAlJadeed() {
    const source = 'Al Jadeed';
    try {
        const articles = await fetchGoogleNewsRSS('site:aljadeed.tv OR source:"Al Jadeed" Lebanon when:1d');
        const filtered = articles.length > 0 ? articles : (await fetchGoogleNewsRSS('Al Jadeed الجديد Lebanon when:1d'));

        const recentArticles = filtered.filter(a => isWithinWindow(a.posted_at));
        const finalArticles = recentArticles.length > 0 ? recentArticles : filtered.slice(0, 5);

        console.log(`[Scraper] Al Jadeed: ${filtered.length} total, ${recentArticles.length} within 5min, returning ${finalArticles.length}`);

        return {
            source,
            success: true,
            findings: finalArticles.map(a => ({
                id: `aljadeed_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                source: a.source || source,
                source_type: 'web_scraper',
                title: a.title,
                description: a.description,
                url: a.url,
                posted_at: a.posted_at || new Date().toISOString(),
                fetched_at: new Date().toISOString(),
                language: 'ar'
            })),
            count: finalArticles.length
        };
    } catch (error) {
        console.error(`[Scraper] ${source} error:`, error.message);
        return { source, success: false, error: error.message, findings: [], count: 0 };
    }
}

// ─── 4. LBCI Scraper (via Google News) ───────────────────────────────────────

async function scrapeLBCI() {
    const source = 'LBCI';
    try {
        const articles = await fetchGoogleNewsRSS('site:lbcgroup.tv OR source:"LBCI" OR source:"LBCI Lebanon" Lebanon when:1d');
        const filtered = articles.length > 0 ? articles : (await fetchGoogleNewsRSS('LBCI Lebanon news when:1d'));

        const recentArticles = filtered.filter(a => isWithinWindow(a.posted_at));
        const finalArticles = recentArticles.length > 0 ? recentArticles : filtered.slice(0, 5);

        console.log(`[Scraper] LBCI: ${filtered.length} total, ${recentArticles.length} within 5min, returning ${finalArticles.length}`);

        return {
            source,
            success: true,
            findings: finalArticles.map(a => ({
                id: `lbci_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                source: a.source || source,
                source_type: 'web_scraper',
                title: a.title,
                description: a.description,
                url: a.url,
                posted_at: a.posted_at || new Date().toISOString(),
                fetched_at: new Date().toISOString(),
                language: 'en'
            })),
            count: finalArticles.length
        };
    } catch (error) {
        console.error(`[Scraper] ${source} error:`, error.message);
        return { source, success: false, error: error.message, findings: [], count: 0 };
    }
}

// ─── 5. NNA (National News Agency) Scraper (via Google News) ─────────────────

async function scrapeNNA() {
    const source = 'NNA Lebanon';
    try {
        const articles = await fetchGoogleNewsRSS('site:nna-leb.gov.lb OR source:"NNA" OR source:"National News Agency" Lebanon when:1d');
        const filtered = articles.length > 0 ? articles : (await fetchGoogleNewsRSS('NNA Lebanon National News Agency when:1d'));

        const recentArticles = filtered.filter(a => isWithinWindow(a.posted_at));
        const finalArticles = recentArticles.length > 0 ? recentArticles : filtered.slice(0, 5);

        console.log(`[Scraper] NNA: ${filtered.length} total, ${recentArticles.length} within 5min, returning ${finalArticles.length}`);

        return {
            source,
            success: true,
            findings: finalArticles.map(a => ({
                id: `nna_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                source: a.source || source,
                source_type: 'web_scraper',
                title: a.title,
                description: a.description,
                url: a.url,
                posted_at: a.posted_at || new Date().toISOString(),
                fetched_at: new Date().toISOString(),
                language: 'en'
            })),
            count: finalArticles.length
        };
    } catch (error) {
        console.error(`[Scraper] ${source} error:`, error.message);
        return { source, success: false, error: error.message, findings: [], count: 0 };
    }
}

const NEWS_SCRAPER_REGISTRY = {
    google_news: { label: 'Google News', execute: (region) => scrapeGoogleNews(region) },
    mtv_lebanon: { label: 'MTV Lebanon', execute: () => scrapeMTV() },
    al_jadeed: { label: 'Al Jadeed', execute: () => scrapeAlJadeed() },
    lbci: { label: 'LBCI', execute: () => scrapeLBCI() },
    nna_lebanon: { label: 'NNA Lebanon', execute: () => scrapeNNA() }
};

// ─── Master: Scrape All News Sources ─────────────────────────────────────────

async function scrapeAllNews(region = 'Lebanon', sourceIds = Object.keys(NEWS_SCRAPER_REGISTRY), runnerMap = NEWS_SCRAPER_REGISTRY) {
    console.log(`\n[Scraper] ═══════════════════════════════════════════════════════`);
    console.log(`[Scraper] Starting scrape of all Lebanese news sources...`);
    console.log(`[Scraper] Region: ${region} | Window: last 5 minutes`);
    console.log(`[Scraper] ═══════════════════════════════════════════════════════\n`);

    const startTime = Date.now();
    const selectedSourceIds = [...new Set((sourceIds || []).filter((id) => runnerMap[id]))];
    const results = await Promise.allSettled(selectedSourceIds.map((sourceId) => runnerMap[sourceId].execute(region)));
    const allFindings = [];
    const sourceResults = [];
    const resultsBySourceId = {};

    results.forEach((result, index) => {
        const sourceId = selectedSourceIds[index];
        const name = runnerMap[sourceId].label;
        if (result.status === 'fulfilled' && result.value.success) {
            const r = result.value;
            console.log(`[Scraper] ✅ ${name}: ${r.count} articles found`);
            allFindings.push(...r.findings);
            sourceResults.push({ id: sourceId, source: name, success: true, count: r.count });
            resultsBySourceId[sourceId] = r;
        } else {
            const error = result.status === 'rejected' ? result.reason?.message : result.value?.error;
            console.log(`[Scraper] ❌ ${name}: failed - ${error}`);
            sourceResults.push({ id: sourceId, source: name, success: false, error });
            resultsBySourceId[sourceId] = {
                source: name,
                success: false,
                error,
                findings: [],
                count: 0
            };
        }
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[Scraper] ═══════════════════════════════════════════════════════`);
    console.log(`[Scraper] Scraping complete in ${elapsed}s`);
    console.log(`[Scraper] Total articles: ${allFindings.length} from ${sourceResults.filter(s => s.success).length}/${selectedSourceIds.length} sources`);
    console.log(`[Scraper] ═══════════════════════════════════════════════════════\n`);

    return {
        source: 'News Scrapers',
        success: true,
        findings: allFindings,
        count: allFindings.length,
        sources: sourceResults,
        elapsed_seconds: parseFloat(elapsed),
        resultsBySourceId
    };
}

module.exports = {
    NEWS_SCRAPER_REGISTRY,
    scrapeAllNews,
    scrapeGoogleNews,
    scrapeMTV,
    scrapeAlJadeed,
    scrapeLBCI,
    scrapeNNA
};
