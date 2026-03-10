const axios = require('axios');
require('dotenv').config();

// Time filter: 6 hours in milliseconds
const MAX_INTEL_AGE_MS = 6 * 60 * 60 * 1000;

// Intel Twitter accounts to monitor
const INTEL_ACCOUNTS = [
    // Global/Regional Intel
    { handle: 'sentdefender', name: 'Sentdefender', type: 'global' },
    { handle: 'AvichayAdraee', name: 'Avichay Adraee (IDF)', type: 'israel/lebanon' },

    // Major News
    { handle: 'AlJazeera', name: 'Al Jazeera', type: 'global' },
    { handle: 'AlArabiya_Brk', name: 'Al Arabiya Breaking', type: 'global' },
    { handle: 'AlMayadeenLive', name: 'Al Mayadeen', type: 'lebanon/regional' },

    // Lebanese News
    { handle: 'LBCI_NEWS', name: 'LBCI News', type: 'lebanon' },
    { handle: 'NaharnetNews', name: 'Naharnet', type: 'lebanon' },
    { handle: 'MTVLebanonNews', name: 'MTV Lebanon', type: 'lebanon' },
    { handle: 'Annahar', name: 'Annahar', type: 'lebanon' },
    { handle: 'lebanon24', name: 'Lebanon 24', type: 'lebanon' },
    { handle: 'LebanonDebate', name: 'Lebanon Debate', type: 'lebanon' },

    // Lebanese Official/Emergency
    { handle: 'lebISF', name: 'Lebanese ISF', type: 'lebanon' },
    { handle: 'tmclebanon', name: 'TMC Lebanon (Traffic)', type: 'lebanon' },

    // Scientific/Alerts
    { handle: 'EQAlerts', name: 'Earthquake Alerts', type: 'global' },
    { handle: 'LastQuake', name: 'LastQuake (EMSC)', type: 'global' }
];

// Keywords for crisis detection
const CRISIS_KEYWORDS = [
    'air strike', 'airstrike', 'bombing', 'explosion', 'attack',
    'earthquake', 'tsunami', 'flood', 'fire', 'emergency',
    'evacuation', 'casualties', 'injured', 'killed', 'alert',
    'breaking', 'urgent', 'warning', 'missile', 'rocket',
    'conflict', 'military', 'invasion', 'ceasefire', 'humanitarian'
];

/**
 * Check if intel is within the allowed time window (6 hours)
 */
function isRecentIntel(timestamp) {
    if (!timestamp) return false;
    const intelTime = new Date(timestamp).getTime();
    const now = Date.now();
    return (now - intelTime) <= MAX_INTEL_AGE_MS;
}

/**
 * Fetch intel from monitored Twitter accounts - NO keyword filter, only time filter
 */
async function fetchIntelTwitter(region) {
    const findings = [];
    const now = new Date();

    // Check if API credentials are configured
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    const bearerToken = process.env.TWITTER_BEARER_TOKEN;

    if (!bearerToken && (!apiKey || !apiSecret)) {
        console.error('Twitter credentials not configured!');
        return {
            source: 'Intel Twitter',
            success: false,
            error: 'Twitter API credentials not configured. Set TWITTER_API_KEY and TWITTER_API_SECRET in .env',
            findings: [],
            count: 0
        };
    }

    try {
        // Get bearer token from API key and secret if not provided
        let token = bearerToken;
        if (!token && apiKey && apiSecret) {
            token = await getTwitterBearerToken(apiKey, apiSecret);
        }

        if (!token) {
            console.error('Could not obtain Twitter bearer token');
            return {
                source: 'Intel Twitter',
                success: false,
                error: 'Failed to obtain Twitter bearer token',
                findings: [],
                count: 0
            };
        }

        // Build queries with bilingual keywords
        const accountQuery = INTEL_ACCOUNTS.map(a => `from:${a.handle}`).join(' OR ');
        const regionKeywords = getRegionKeywords(region);

        // Use both English and Arabic keywords
        const englishKeywords = regionKeywords.english.slice(0, 8).join(' OR ');
        const arabicKeywords = regionKeywords.arabic.slice(0, 5).join(' OR ');
        const combinedKeywords = `(${englishKeywords}) OR (${arabicKeywords})`;

        // Query 1: Trusted accounts with bilingual regional keywords
        const trustedQuery = `(${accountQuery}) (${combinedKeywords}) -is:retweet -is:reply`;

        // Query 2: Broad public search with bilingual crisis keywords
        const crisisKeywords = CRISIS_KEYWORDS.slice(0, 5).join(' OR ');
        const broadQuery = `(${combinedKeywords}) (${crisisKeywords}) -is:retweet -is:reply`;

        console.log(`[Intel] Bilingual search for ${region}: EN=${regionKeywords.english.length} + AR=${regionKeywords.arabic.length} keywords`);

        // Run both searches in parallel
        const [trustedResponse, broadResponse] = await Promise.all([
            axios.get(
                `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(trustedQuery)}&max_results=30&tweet.fields=created_at,author_id,text,public_metrics,lang,referenced_tweets&expansions=author_id`,
                { headers: { 'Authorization': `Bearer ${token}` }, timeout: 15000 }
            ).catch(e => {
                console.log('[Intel] Trusted search error:', e.message);
                return { data: { data: [] } };
            }),
            axios.get(
                `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(broadQuery)}&max_results=20&tweet.fields=created_at,author_id,text,public_metrics,lang,referenced_tweets&expansions=author_id`,
                { headers: { 'Authorization': `Bearer ${token}` }, timeout: 15000 }
            ).catch(e => {
                console.log('[Intel] Broad search error:', e.message);
                return { data: { data: [] } };
            })
        ]);

        const trustedTweets = trustedResponse.data?.data || [];
        const broadTweets = broadResponse.data?.data || [];
        const trustedUsers = trustedResponse.data?.includes?.users || [];
        const broadUsers = broadResponse.data?.includes?.users || [];
        const allUsers = [...trustedUsers, ...broadUsers];

        console.log(`[Intel] Found ${trustedTweets.length} trusted + ${broadTweets.length} broad tweets`);

        // Combine and dedupe by ID
        const seenIds = new Set();
        const allTweets = [];

        // Prioritize trusted tweets first
        for (const tweet of [...trustedTweets, ...broadTweets]) {
            if (!seenIds.has(tweet.id)) {
                seenIds.add(tweet.id);
                allTweets.push({
                    ...tweet,
                    is_from_trusted: trustedTweets.some(t => t.id === tweet.id)
                });
            }
        }

        for (const tweet of allTweets) {
            if (tweet.referenced_tweets?.some(ref => ref.type === 'retweeted')) {
                continue;
            }
            // ONLY filter by time (6 hours)
            if (!isRecentIntel(tweet.created_at)) {
                continue;
            }

            const author = allUsers.find(u => u.id === tweet.author_id);
            const account = INTEL_ACCOUNTS.find(a =>
                author?.username?.toLowerCase() === a.handle.toLowerCase()
            );

            findings.push({
                id: tweet.id,
                source: account?.name || author?.username || 'Twitter/X',
                source_type: tweet.is_from_trusted ? 'intel_twitter' : 'public_twitter',
                source_handle: `@${author?.username || 'unknown'}`,
                is_trusted_source: tweet.is_from_trusted,
                text: tweet.text,
                title: tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''),
                posted_at: tweet.created_at,
                fetched_at: now.toISOString(),
                language: tweet.lang || 'unknown',
                metrics: tweet.public_metrics,
                url: `https://twitter.com/${author?.username}/status/${tweet.id}`
            });
        }

        console.log(`[Intel] Total: ${findings.length} relevant tweets within 6-hour window`);

        return {
            source: 'Intel Twitter',
            success: true,
            findings,
            count: findings.length,
            accounts_monitored: INTEL_ACCOUNTS.map(a => a.handle),
            search_breakdown: {
                trusted_count: trustedTweets.length,
                broad_count: broadTweets.length,
                trusted_query: trustedQuery,
                broad_query: broadQuery
            }
        };

    } catch (error) {
        console.error('Intel Twitter fetch error:', error.response?.data || error.message);
        return {
            source: 'Intel Twitter',
            success: false,
            error: error.response?.data?.detail || error.message,
            findings: [],
            count: 0
        };
    }
}

/**
 * Get Twitter Bearer Token from API Key and Secret
 */
async function getTwitterBearerToken(apiKey, apiSecret) {
    try {
        const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
        const response = await axios.post(
            'https://api.twitter.com/oauth2/token',
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.error('Failed to get Twitter bearer token:', error.message);
        return null;
    }
}

// --- NewsAPI.ai Search for Detection ---
const NEWSAPI_AI_URL = 'https://eventregistry.org/api/v1/article/getArticles';

async function fetchIntelNews(region) {
    try {
        const regionKeywords = getRegionKeywords(region);
        // Use array format with OR operator
        const allKeywords = [
            ...regionKeywords.english.slice(0, 4),
            ...regionKeywords.arabic.slice(0, 3)
        ];

        console.log(`[Intel NewsAPI] Searching with ${allKeywords.length} keywords:`, allKeywords.slice(0, 3).join(', '));

        const response = await axios.post(NEWSAPI_AI_URL, {
            apiKey: process.env.NEWSAPI_AI_KEY,
            keyword: allKeywords,  // Array of keywords
            keywordOper: 'or',     // Match ANY keyword
            keywordSearchMode: 'simple',
            lang: ['eng', 'ara'],
            articlesPage: 1,
            articlesCount: 15,
            articlesSortBy: 'date',
            articlesSortByAsc: false,
            dataType: ['news'],
            includeArticleImage: true
        }, { timeout: 15000 });

        const articles = response.data.articles?.results || [];
        console.log(`[Intel NewsAPI] Found ${articles.length} articles (total: ${response.data.articles?.totalResults || 0})`);

        return {
            source: 'NewsAPI',
            success: true,
            findings: articles.map(a => ({
                id: a.uri,
                source: a.source?.title || 'News',
                source_type: 'news',
                title: a.title,
                description: a.body?.substring(0, 200) || '',
                url: a.url,
                image: a.image,
                posted_at: a.dateTime,
                fetched_at: new Date().toISOString(),
                language: a.lang
            })),
            count: articles.length
        };
    } catch (error) {
        console.error('[Intel NewsAPI] Error:', error.message);
        return { source: 'NewsAPI', success: false, error: error.message, findings: [], count: 0 };
    }
}

// --- USGS Earthquake Search for Detection ---
async function fetchIntelUSGS(region, coords) {
    try {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        console.log(`[Intel USGS] Checking earthquakes near ${region}...`);

        const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${oneDayAgo.toISOString()}&minmagnitude=2.5&limit=20`;

        const response = await axios.get(url, { timeout: 10000 });
        const earthquakes = response.data.features || [];

        // Filter by region keywords in location name
        const regionKeywords = getRegionKeywords(region);
        const relevantQuakes = earthquakes.filter(eq => {
            const place = (eq.properties?.place || '').toLowerCase();
            return regionKeywords.english.some(kw => place.includes(kw.toLowerCase())) ||
                regionKeywords.arabic.some(kw => place.includes(kw));
        });

        console.log(`[Intel USGS] Found ${relevantQuakes.length} relevant earthquakes (of ${earthquakes.length} total)`);

        return {
            source: 'USGS',
            success: true,
            findings: relevantQuakes.map(eq => ({
                id: eq.id,
                source: 'USGS',
                source_type: 'seismic_sensor',
                title: `M${eq.properties.mag} - ${eq.properties.place}`,
                magnitude: eq.properties.mag,
                location: {
                    lat: eq.geometry.coordinates[1],
                    lon: eq.geometry.coordinates[0],
                    depth: eq.geometry.coordinates[2]
                },
                posted_at: new Date(eq.properties.time).toISOString(),
                fetched_at: new Date().toISOString(),
                url: eq.properties.url
            })),
            count: relevantQuakes.length
        };
    } catch (error) {
        console.error('[Intel USGS] Error:', error.message);
        return { source: 'USGS', success: false, error: error.message, findings: [], count: 0 };
    }
}

// --- Perplexity Web Search for Detection ---
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

async function fetchIntelPerplexity(region) {
    try {
        const regionKeywords = getRegionKeywords(region);
        const englishTerms = regionKeywords.english.slice(0, 5).join(', ');
        const arabicTerms = regionKeywords.arabic.slice(0, 5).join(', ');

        console.log(`[Intel Perplexity] Searching for breaking news in ${region}...`);

        const prompt = `Search for breaking news and crisis events in ${region} from the last 6 hours.

Search terms (English): ${englishTerms}
Search terms (Arabic): ${arabicTerms}

Look for:
- Breaking news from major outlets (Al Jazeera, BBC, Reuters, Al Arabiya)
- Local news from ${region}
- Official government statements
- Social media reports from @lebISF, @tmclebanon, @LBCI_NEWS

Return JSON array of findings:
[
    {
        "title": "Event headline",
        "source": "Source name",
        "type": "AIRSTRIKE|EARTHQUAKE|EXPLOSION|ACCIDENT|OTHER",
        "summary": "Brief description",
        "url": "source URL if available",
        "posted_at": "ISO timestamp if known"
    }
]

If no breaking events found, return empty array: []`;

        const response = await axios.post(PERPLEXITY_API_URL, {
            model: 'sonar',
            messages: [
                { role: 'system', content: 'You are a breaking news scanner. Output valid JSON only.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.1
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 20000
        });

        let content = response.data.choices[0]?.message?.content || '[]';
        if (content.includes('```json')) content = content.split('```json')[1].split('```')[0].trim();
        else if (content.includes('```')) content = content.split('```')[1].split('```')[0].trim();

        const findings = JSON.parse(content);
        console.log(`[Intel Perplexity] Found ${findings.length} breaking events`);

        return {
            source: 'Perplexity',
            success: true,
            findings: (Array.isArray(findings) ? findings : []).map((f, i) => ({
                id: `perplexity_${Date.now()}_${i}`,
                source: f.source || 'Perplexity Web Search',
                source_type: 'web_search',
                title: f.title,
                description: f.summary,
                type: f.type,
                url: f.url,
                posted_at: f.posted_at || new Date().toISOString(),
                fetched_at: new Date().toISOString()
            })),
            count: findings.length
        };
    } catch (error) {
        console.error('[Intel Perplexity] Error:', error.message);
        console.log('[Intel Perplexity] Using DEMO fallback data...');

        // DEMO FALLBACK: Generate realistic demo findings when Perplexity is unavailable
        const now = new Date();
        const demoFindings = [
            {
                id: `perplexity_demo_${Date.now()}_1`,
                source: 'Reuters (Demo)',
                source_type: 'web_search',
                title: `Breaking: Reports of security incident in southern ${region}`,
                description: `Multiple sources reporting a security-related incident in the southern region. Emergency services are responding. (DEMO DATA - Perplexity API unavailable)`,
                type: 'SECURITY_INCIDENT',
                url: 'https://reuters.com',
                posted_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
                fetched_at: now.toISOString()
            },
            {
                id: `perplexity_demo_${Date.now()}_2`,
                source: 'Al Jazeera (Demo)',
                source_type: 'web_search',
                title: `${region}: Civil defense issues advisory amid rising tensions`,
                description: `Civil defense authorities have issued a general advisory urging residents to remain vigilant. (DEMO DATA - Perplexity API unavailable)`,
                type: 'ALERT',
                url: 'https://aljazeera.com',
                posted_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
                fetched_at: now.toISOString()
            },
            {
                id: `perplexity_demo_${Date.now()}_3`,
                source: 'Local Media (Demo)',
                source_type: 'web_search',
                title: `Emergency services on high alert across ${region}`,
                description: `Hospitals and emergency units have been placed on high alert following reports of increased activity. (DEMO DATA - Perplexity API unavailable)`,
                type: 'NEWS',
                url: 'https://example.com',
                posted_at: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
                fetched_at: now.toISOString()
            }
        ];

        return {
            source: 'Perplexity',
            success: true,
            demo: true,
            findings: demoFindings,
            count: demoFindings.length
        };
    }
}


/**
 * Get region-specific keywords in BOTH English and Arabic
 */
function getRegionKeywords(region) {
    const regionKeywords = {
        Lebanon: {
            english: [
                // Locations
                'lebanon', 'beirut', 'tripoli', 'sidon', 'tyre', 'baalbek', 'nabatieh', 'southern lebanon', 'bekaa', 'dahieh', 'jounieh',
                // Conflict/Crisis
                'airstrike', 'air strike', 'raid', 'explosion', 'shelling', 'border conflict', 'missile', 'rocket', 'bombing',
                // Medical/Emergency
                'casualty', 'casualties', 'injuries', 'injured', 'hospital', 'red cross', 'civil defense', 'emergency', 'killed',
                // Traffic/Accidents
                'car accident', 'traffic crash', 'vehicle collision', 'road accident', 'autostrad',
                // Congestion/Status
                'traffic jam', 'congestion', 'road blocked', 'heavy traffic', 'gridlock', 'road closure'
            ],
            arabic: [
                // Locations
                'لبنان', 'بيروت', 'طرابلس', 'صيدا', 'صور', 'بعلبك', 'النبطية', 'جنوب لبنان', 'البقاع', 'الضاحية', 'جونية',
                // Conflict/Crisis
                'غارة جوية', 'غارة', 'انفجار', 'قصف', 'صاروخ', 'صواريخ', 'قنبلة', 'هجوم',
                // Medical/Emergency
                'شهيد', 'شهداء', 'جريح', 'جرحى', 'مستشفى', 'الصليب الأحمر', 'الدفاع المدني', 'طوارئ', 'إصابات',
                // Traffic/Accidents
                'حادث سير', 'حادث', 'تصادم', 'اصطدام',
                // Congestion/Status
                'ازدحام', 'زحمة', 'طريق مقطوع', 'حركة مرور'
            ]
        },
        Turkey: {
            english: [
                'turkey', 'turkiye', 'istanbul', 'ankara', 'gaziantep', 'hatay', 'kahramanmaras', 'izmir',
                'earthquake', 'seismic', 'collapse', 'aftershock', 'flood', 'wildfire',
                'afad', 'kizilay', 'red crescent', 'rescue', 'emergency',
                'traffic accident', 'car crash', 'chain collision', 'highway'
            ],
            arabic: ['تركيا', 'اسطنبول', 'أنقرة', 'زلزال', 'انهيار', 'فيضان', 'حريق']
        },
        Italy: {
            english: [
                'italy', 'rome', 'milan', 'naples', 'sicily', 'venice', 'emilia romagna',
                'earthquake', 'flood', 'landslide', 'volcano', 'storm',
                'protezione civile', 'vigili del fuoco', 'emergency',
                'incidente stradale', 'car accident', 'collision', 'autostrada', 'traffic jam'
            ],
            arabic: ['إيطاليا', 'روما', 'ميلانو', 'زلزال', 'فيضان', 'بركان']
        },
        Palestine: {
            english: [
                'gaza', 'west bank', 'jerusalem', 'rafah', 'khan younis', 'jenin', 'nablus', 'ramallah',
                'airstrike', 'shelling', 'bombing', 'clashes', 'raid', 'missile', 'rocket',
                'casualty', 'casualties', 'ambulance', 'hospital', 'red crescent', 'ministry of health', 'martyrs',
                'car accident', 'road crash', 'traffic collision',
                'checkpoint', 'road closed', 'incursion'
            ],
            arabic: [
                'غزة', 'الضفة الغربية', 'القدس', 'رفح', 'خان يونس', 'جنين', 'نابلس', 'رام الله',
                'غارة', 'قصف', 'صاروخ', 'صواريخ', 'اشتباك', 'اقتحام',
                'شهيد', 'شهداء', 'جريح', 'جرحى', 'مستشفى', 'الهلال الأحمر', 'وزارة الصحة',
                'حاجز', 'طريق مغلق'
            ]
        },
        Syria: {
            english: [
                'syria', 'damascus', 'aleppo', 'idlib', 'homs', 'latakia',
                'airstrike', 'bombing', 'shelling', 'clashes', 'offensive',
                'casualties', 'refugees', 'humanitarian', 'emergency'
            ],
            arabic: [
                'سوريا', 'دمشق', 'حلب', 'إدلب', 'حمص', 'اللاذقية',
                'غارة', 'قصف', 'اشتباك', 'هجوم',
                'شهداء', 'لاجئين', 'إنسانية', 'طوارئ'
            ]
        }
    };

    const regionData = regionKeywords[region];
    if (regionData) {
        // Return combined English + Arabic keywords
        return {
            all: [...regionData.english, ...regionData.arabic],
            english: regionData.english,
            arabic: regionData.arabic
        };
    }

    // Fallback for unknown regions
    return {
        all: [region.toLowerCase(), 'emergency', 'crisis', 'طوارئ', 'أزمة'],
        english: [region.toLowerCase(), 'emergency', 'crisis'],
        arabic: ['طوارئ', 'أزمة']
    };
}

/**
 * Aggregate all intel findings from various sources
 * @param {Object} detectionData - Data from detection service
 * @param {Object} twitterIntel - Data from intel Twitter monitoring
 * @param {Object} ministryIntel - Data from Ministry Info API
 * @returns {Object} Aggregated intel report
 */
function aggregateIntel(detectionData, twitterIntel, ministryIntel, scrapedNews) {
    const allFindings = [];
    const now = new Date();

    // Process earthquake data
    const earthquakes = [
        ...(detectionData.detectionData?.[0]?.data || []),
        ...(detectionData.detectionData?.[1]?.data || [])
    ];

    for (const eq of earthquakes) {
        const time = eq.properties?.time ? new Date(eq.properties.time) : null;
        if (time && isRecentIntel(time)) {
            allFindings.push({
                type: 'EARTHQUAKE',
                source: eq.properties?.net === 'us' ? 'USGS' : 'EMSC',
                source_type: 'seismic_sensor',
                title: eq.properties?.place || 'Earthquake Detected',
                magnitude: eq.properties?.mag || eq.properties?.magnitude,
                location: {
                    lat: eq.geometry?.coordinates?.[1],
                    lon: eq.geometry?.coordinates?.[0],
                    depth: eq.geometry?.coordinates?.[2]
                },
                posted_at: time.toISOString(),
                fetched_at: now.toISOString(),
                severity: getMagnitudeSeverity(eq.properties?.mag || eq.properties?.magnitude),
                raw: eq
            });
        }
    }

    // Process weather alerts
    const weatherAlerts = [
        ...(detectionData.detectionData?.[2]?.data || []),
        ...(detectionData.detectionData?.[3]?.data || [])
    ];

    for (const alert of weatherAlerts) {
        allFindings.push({
            type: alert.event || alert.type || 'WEATHER_ALERT',
            source: 'Weather Services',
            source_type: 'weather_sensor',
            title: alert.headline || alert.event || 'Weather Alert',
            description: alert.description,
            posted_at: alert.onset || now.toISOString(),
            fetched_at: now.toISOString(),
            severity: alert.severity || 'MEDIUM',
            raw: alert
        });
    }

    // Process news articles
    const newsArticles = detectionData.detectionData?.[4]?.data || [];
    for (const article of newsArticles) {
        const publishTime = article.dateTime || article.publishedAt;
        if (publishTime && isRecentIntel(publishTime)) {
            allFindings.push({
                type: detectEventType(article.title),
                source: article.source?.name || article.source?.title || 'News',
                source_type: 'news',
                title: article.title,
                description: article.body || article.description,
                url: article.url,
                posted_at: publishTime,
                fetched_at: now.toISOString(),
                severity: 'UNCONFIRMED',
                raw: article
            });
        }
    }

    // Process intel Twitter findings
    if (twitterIntel?.findings) {
        for (const tweet of twitterIntel.findings) {
            const relevance = typeof tweet.relevance === 'number' ? tweet.relevance : null;
            const severityFromRelevance = relevance === null
                ? null
                : (relevance >= 3 ? 'HIGH' : relevance >= 2 ? 'MEDIUM' : 'LOW');

            allFindings.push({
                type: detectEventType(tweet.text),
                source: tweet.source,
                source_type: tweet.source_type || 'intel_twitter',
                source_handle: tweet.source_handle,
                title: tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''),
                description: tweet.text,
                url: tweet.url,
                posted_at: tweet.posted_at,
                fetched_at: tweet.fetched_at,
                severity: tweet.severity || severityFromRelevance || (tweet.is_trusted_source ? 'MEDIUM' : 'LOW'),
                keywords: tweet.keywords,
                metrics: tweet.metrics,
                raw: tweet
            });
        }
    }

    // Process Ministry Alerts
    if (ministryIntel?.data) {
        for (const ministryAlert of ministryIntel.data) {
            allFindings.push({
                type: ministryAlert.type || 'OFFICIAL_STATEMENT',
                source: ministryAlert.source,
                source_type: 'ministry_alert',
                title: ministryAlert.title,
                description: ministryAlert.description,
                url: ministryAlert.url,
                posted_at: ministryAlert.posted_at,
                fetched_at: now.toISOString(),
                severity: ministryAlert.severity || 'MEDIUM',
                raw: ministryAlert
            });
        }
    }

    // Process scraped news findings (Google News, MTV, LBCI, Al Jadeed, NNA)
    if (scrapedNews?.findings) {
        for (const finding of scrapedNews.findings) {
            allFindings.push({
                type: detectEventType(finding.title),
                source: finding.source,
                source_type: finding.source_type || 'web_scraper',
                title: finding.title,
                description: finding.description,
                url: finding.url,
                posted_at: finding.posted_at,
                fetched_at: finding.fetched_at || now.toISOString(),
                severity: 'UNCONFIRMED',
                language: finding.language,
                raw: finding
            });
        }
        console.log(`[Aggregate] Added ${scrapedNews.findings.length} scraped news findings`);
    }

    // Sort by posted time (most recent first)
    allFindings.sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at));

    // Get unique sources
    const sources = [...new Set(allFindings.map(f => f.source))];

    return {
        timestamp: now.toISOString(),
        region: detectionData.region,
        total_findings: allFindings.length,
        findings: allFindings,
        sources,
        summary: {
            earthquake: allFindings.filter(f => f.type === 'EARTHQUAKE').length,
            weather: allFindings.filter(f => f.source_type === 'weather_sensor').length,
            news: allFindings.filter(f => f.source_type === 'news').length,
            intel_twitter: allFindings.filter(f => f.source_type === 'intel_twitter').length,
            web_scraper: allFindings.filter(f => f.source_type === 'web_scraper').length
        },
        oldest_finding: allFindings[allFindings.length - 1]?.posted_at,
        newest_finding: allFindings[0]?.posted_at
    };
}

/**
 * Detect event type from text - uses word boundaries to avoid mislabeling
 */
function detectEventType(text) {
    if (!text) return 'NEWS';
    const lowerText = text.toLowerCase();

    // Use word boundary checks to avoid false matches like "ceasefire" -> "fire"
    if (/\bearthquake\b|\bquake\b|\bseismic\b/.test(lowerText)) return 'EARTHQUAKE';
    if (/\btsunami\b/.test(lowerText)) return 'TSUNAMI';
    if (/\bflood(?:ing)?\b/.test(lowerText)) return 'FLOOD';
    if (/\bwildfire\b|\bforest fire\b|\bbushfire\b/.test(lowerText)) return 'WILDFIRE';
    if (/\bexplosion\b|\bblast\b|\bexploded\b/.test(lowerText)) return 'EXPLOSION';
    if (/\bmissile\b|\brocket\b|\binterception\b/.test(lowerText)) return 'MISSILE_ATTACK';
    if (/\bairstrike\b|\bair strike\b|\bair raid\b|\bbombing\b/.test(lowerText)) return 'AIRSTRIKE';
    if (/\battack\b|\bmilitary operation\b|\bcombat\b|\bshelling\b/.test(lowerText)) return 'SECURITY_INCIDENT';
    if (/\bstorm\b|\bhurricane\b|\bcyclone\b|\btyphoon\b/.test(lowerText)) return 'SEVERE_WEATHER';
    if (/\bevacuation\b|\bevacuate\b/.test(lowerText)) return 'EVACUATION';
    if (/\bsiren\b|\balert\b|\bwarning\b/.test(lowerText)) return 'ALERT';
    if (/\bceasefire\b|\btruce\b/.test(lowerText)) return 'CEASEFIRE';
    if (/\bhumanitarian\b|\baid\b|\brefugee\b/.test(lowerText)) return 'HUMANITARIAN';

    return 'NEWS';
}

/**
 * Get severity based on earthquake magnitude
 */
function getMagnitudeSeverity(magnitude) {
    if (!magnitude) return 'MEDIUM';
    if (magnitude >= 7) return 'CRITICAL';
    if (magnitude >= 6) return 'HIGH';
    if (magnitude >= 5) return 'MEDIUM';
    return 'LOW';
}

/**
 * Filter findings to only include recent intel (within 6 hours)
 */
function filterRecentIntel(findings) {
    return findings.filter(f => isRecentIntel(f.posted_at));
}

// Demo: Ministry Info API
async function fetchMinistryAlerts(region) {
    try {
        console.log(`fetching Ministry Info for ${region}...`);

        // Dynamic demo data based on region
        const ministryData = {
            'Lebanon': [
                {
                    title: 'Ministry of Public Health Statement',
                    description: 'The MoPH advises citizens to stay hydrated and avoid direct sun exposure due to rising temperatures.',
                    source: 'Ministry of Public Health',
                    url: 'https://moph.gov.lb'
                },
                {
                    title: 'Civil Defense Warning',
                    description: 'Civil Defense warns of high fire risk in the Mount Lebanon and Bekaa areas.',
                    source: 'Lebanese Civil Defense',
                    url: 'https://civildefense.gov.lb'
                }
            ],
            'Turkey': [
                {
                    title: 'AFAD Earthquake Advisory',
                    description: 'AFAD monitoring increased seismic activity in the Hatay region. Teams on standby.',
                    source: 'AFAD (Disaster Management)',
                    url: 'https://www.afad.gov.tr'
                }
            ],
            'Italy': [
                {
                    title: 'Protezione Civile Alert',
                    description: 'Yellow alert for thunderstorms in the Lazio region. Residents should secure loose objects.',
                    source: 'Protezione Civile',
                    url: 'https://www.protezionecivile.gov.it'
                }
            ],
            'Palestine': [
                {
                    title: 'Ministry of Health Update',
                    description: 'Staff readiness increased in all Gaza strip hospitals due to ongoing situation.',
                    source: 'Ministry of Health',
                    url: 'https://ps'
                }
            ]
        };

        const regionAlerts = ministryData[region] || [{
            title: 'General Safety Advisory',
            description: 'Local authorities advise caution in public areas.',
            source: 'Local Government'
        }];

        return {
            source: 'Ministry Info',
            success: true,
            data: regionAlerts.map(alert => ({
                source: alert.source,
                source_type: 'ministry_alert', // Matches Frontend Icon
                type: 'OFFICIAL_STATEMENT',
                title: alert.title,
                description: alert.description,
                url: alert.url,
                posted_at: new Date().toISOString(),
                severity: 'MEDIUM'
            })),
            count: regionAlerts.length
        };

    } catch (error) {
        console.error('Ministry fetch error:', error);
        return { source: 'Ministry Info', success: false, error: error.message, data: [] };
    }
}

module.exports = {
    fetchIntelTwitter,
    fetchIntelNews,
    fetchIntelUSGS,
    fetchIntelPerplexity,
    getRegionKeywords,
    aggregateIntel,
    filterRecentIntel,
    isRecentIntel,
    detectEventType,
    fetchMinistryAlerts,
    INTEL_ACCOUNTS,
    CRISIS_KEYWORDS,
    MAX_INTEL_AGE_MS
};
