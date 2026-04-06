const axios = require('axios');
const { getTwitterAccountsByIds } = require('../config/twitterAccounts');
require('dotenv').config();

const DETECTION_WINDOW_HOURS = parseInt(process.env.DETECTION_WINDOW_HOURS || '6', 10);
const DETECTION_WINDOW_MS = DETECTION_WINDOW_HOURS * 60 * 60 * 1000;

function isWithinDetectionWindow(timestamp) {
    if (!timestamp) return false;
    const time = new Date(timestamp).getTime();
    if (Number.isNaN(time)) return false;
    return (Date.now() - time) <= DETECTION_WINDOW_MS;
}

// Region coordinates for detection
const REGIONS = {
    Lebanon: { lat: 33.8938, lon: 35.5018, bbox: [33.0, 35.0, 34.7, 36.6] },
    Turkey: { lat: 39.9334, lon: 32.8597, bbox: [36.0, 26.0, 42.0, 45.0] },
    Italy: { lat: 41.9028, lon: 12.4964, bbox: [35.5, 6.6, 47.1, 18.5] },
    Palestine: { lat: 31.9522, lon: 35.2332, bbox: [31.2, 34.2, 33.3, 35.9] }
};

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
        console.error('Twitter bearer token error:', error.message);
        return null;
    }
}

// Fetch USGS Earthquake data
async function fetchUSGS(region) {
    try {
        const coords = REGIONS[region];
        // Lowered minmagnitude to 2.5 to capture minor tremors for situational awareness
        const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=2.5&minlatitude=${coords.bbox[0]}&maxlatitude=${coords.bbox[2]}&minlongitude=${coords.bbox[1]}&maxlongitude=${coords.bbox[3]}&limit=5&orderby=time`;
        const response = await axios.get(url, { timeout: 10000 });
        return {
            source: 'USGS',
            success: true,
            data: response.data.features || [],
            count: response.data.features?.length || 0
        };
    } catch (error) {
        console.error('USGS fetch error:', error.message);
        return { source: 'USGS', success: false, error: error.message, data: [] };
    }
}

// Fetch EMSC Earthquake data
async function fetchEMSC(region) {
    try {
        const coords = REGIONS[region];
        // Lowered minmag to 2.5
        const url = `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minmag=2.5&minlat=${coords.bbox[0]}&maxlat=${coords.bbox[2]}&minlon=${coords.bbox[1]}&maxlon=${coords.bbox[3]}&limit=5&orderby=time`;
        const response = await axios.get(url, { timeout: 10000 });
        return {
            source: 'EMSC',
            success: true,
            data: response.data.features || [],
            count: response.data.features?.length || 0
        };
    } catch (error) {
        console.error('EMSC fetch error:', error.message);
        return { source: 'EMSC', success: false, error: error.message, data: [] };
    }
}

// Fetch OpenWeatherMap alerts
async function fetchOpenWeather(region) {
    try {
        const coords = REGIONS[region];
        const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${coords.lat}&lon=${coords.lon}&exclude=minutely,hourly&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`;
        const response = await axios.get(url, { timeout: 10000 });

        const alerts = response.data.alerts || [];
        const current = response.data.current;

        // Always add current weather as a finding (situational awareness)
        if (current) {
            alerts.push({
                event: 'Current Weather',
                headline: `${current.weather[0]?.main}, ${Math.round(current.temp)}°C`,
                description: `Current conditions: ${current.weather[0]?.description}. Temp: ${current.temp}°C, Humidity: ${current.humidity}%, Wind: ${current.wind_speed}m/s.`,
                severity: 'LOW',
                onset: new Date().toISOString()
            });
        }

        return {
            source: 'OpenWeatherMap',
            success: true,
            data: alerts,
            current: response.data.current,
            count: alerts.length
        };
    } catch (error) {
        console.error('OpenWeatherMap fetch error:', error.message);
        return { source: 'OpenWeatherMap', success: false, error: error.message, data: [] };
    }
}

// Fetch Tomorrow.io weather data (Forecast/Realtime via Timelines)
async function fetchTomorrow(region) {
    try {
        const coords = REGIONS[region];
        console.log(`Fetching Tomorrow.io Forecast for ${region} (${coords.lat},${coords.lon})`);

        // Use forecast endpoint as requested by user
        const response = await axios.get('https://api.tomorrow.io/v4/weather/forecast', {
            params: {
                location: `${coords.lat},${coords.lon}`,
                apikey: process.env.TOMORROW_IO_API_KEY,
                units: 'metric'
            },
            timeout: 10000
        });

        const timelines = response.data.timelines;
        // Use minutely or hourly data for "current" status
        const dataPoint = (timelines?.minutely?.[0]?.values) || (timelines?.hourly?.[0]?.values) || {};

        const alerts = [];

        // Always return a "Current Weather" finding if no severe alerts
        const currentCondition = {
            type: 'WEATHER_REPORT',
            severity: 'LOW',
            description: `Current conditions in ${region}: ${dataPoint.temperature}°C, Humidity: ${dataPoint.humidity}%, Wind: ${dataPoint.windSpeed}m/s`,
            temp: dataPoint.temperature,
            headline: `Current Weather: ${dataPoint.temperature}°C`
        };

        // Check for extreme conditions
        if (dataPoint.temperature > 35) {
            alerts.push({
                type: 'HEATWAVE',
                severity: 'HIGH',
                description: `Extreme heat detected: ${dataPoint.temperature}°C`,
                headline: 'Heatwave Warning'
            });
        }
        if (dataPoint.precipitationIntensity > 10) {
            alerts.push({
                type: 'FLOOD_RISK',
                severity: 'HIGH',
                description: `Heavy rain: ${dataPoint.precipitationIntensity}mm/hr`,
                headline: 'Flood Risk Warning'
            });
        }
        if (dataPoint.windSpeed > 20) {
            alerts.push({
                type: 'HIGH_WIND',
                severity: 'MEDIUM',
                description: `High winds: ${dataPoint.windSpeed}m/s`,
                headline: 'High Wind Alert'
            });
        }

        // If we have alerts, return them. If not, return the current condition report.
        const finalData = alerts.length > 0 ? alerts : [currentCondition];

        return {
            source: 'Tomorrow.io',
            success: true,
            data: finalData,
            count: finalData.length,
            raw: true
        };

    } catch (error) {
        console.error('Tomorrow.io fetch error:', error.message);

        // DEMO FALLBACK: If API fails (e.g. 403 or limit reached), return persistent demo data
        // This ensures the user *always* sees weather data for testing purposes as requested.
        const demoData = [
            {
                type: 'HEATWAVE',
                severity: 'HIGH',
                description: `(DEMO) Extreme heat detected: 38°C - API Fallback`,
                headline: 'Heatwave Warning'
            },
            {
                type: 'WEATHER_REPORT',
                severity: 'LOW',
                description: `(DEMO) Current conditions: 38°C, Humidity: 45%`,
                temp: 38,
                headline: `Current Weather: 38°C`
            }
        ];

        return {
            source: 'Tomorrow.io',
            success: true,
            demo: true,
            data: demoData,
            count: demoData.length,
            raw: true
        };
    }
}

// Import helper to get keywords
const { getRegionKeywords } = require('./intelService');

// Fetch NewsAPI.ai (Event Registry)
async function fetchNewsAPI(region) {
    try {
        const keywords = getRegionKeywords(region);
        // Join top 5 keywords with OR to avoid query too long limits, but ensure main regional terms are covered
        const keywordQuery = keywords.slice(0, 5).join(' OR ');

        console.log(`Fetching news for ${region} with keywords: ${keywordQuery}`);

        const url = 'https://eventregistry.org/api/v1/article/getArticles';
        const dateStart = new Date(Date.now() - DETECTION_WINDOW_MS).toISOString().split('T')[0];
        const response = await axios.post(url, {
            apiKey: process.env.NEWSAPI_AI_KEY,
            keyword: keywordQuery,
            articlesSortBy: 'date',
            articlesCount: 30,
            dateStart
        }, { timeout: 15000 });

        const articles = response.data.articles?.results || [];
        const recentArticles = articles.filter(a =>
            isWithinDetectionWindow(a.dateTime || a.publishedAt || a.dateTimePub)
        );
        console.log(`NewsAPI returned ${articles.length} articles (${recentArticles.length} within ${DETECTION_WINDOW_HOURS}h) for ${region}`);
        return {
            source: 'NewsAPI.ai',
            success: true,
            data: recentArticles,
            count: recentArticles.length
        };
    } catch (error) {
        console.error('NewsAPI.ai fetch error:', error.message);
        return { source: 'NewsAPI.ai', success: false, error: error.message, data: [] };
    }
}

// Fetch Twitter/X crisis mentions (using v2 API)
async function fetchTwitter(region, sourceOptions = {}) {
    try {
        // Twitter API v2 requires OAuth 2.0 Bearer Token
        const accounts = getTwitterAccountsByIds('twitter', sourceOptions.twitter_accounts?.resolved)
            .map((account) => account.handle);
        if (accounts.length === 0) {
            return { source: 'Twitter/X', success: true, data: [], count: 0, accounts_searched: [] };
        }
        const query = `(earthquake OR tsunami OR flood OR fire OR explosion) (from:${accounts.join(' OR from:')}) -is:retweet -is:reply`;

        const startTime = new Date(Date.now() - DETECTION_WINDOW_MS).toISOString();
        const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=10&start_time=${encodeURIComponent(startTime)}&tweet.fields=created_at,author_id,text,referenced_tweets`;

        const apiKey = process.env.TWITTER_API_KEY;
        const apiSecret = process.env.TWITTER_API_SECRET;
        const bearerToken = process.env.TWITTER_BEARER_TOKEN;

        let token = bearerToken;
        if (!token && apiKey && apiSecret) {
            token = await getTwitterBearerToken(apiKey, apiSecret);
        }

        if (!token) {
            return { source: 'Twitter/X', success: false, error: 'Twitter API credentials not configured', data: [] };
        }

        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            timeout: 10000
        });

        const tweets = (response.data.data || [])
            .filter(t => !t.referenced_tweets?.some(ref => ref.type === 'retweeted'))
            .filter(t => isWithinDetectionWindow(t.created_at));

        return {
            source: 'Twitter/X',
            success: true,
            data: tweets,
            count: tweets.length,
            accounts_searched: accounts
        };
    } catch (error) {
        console.error('Twitter fetch error:', error.message);
        // Return empty for demo - Twitter API might not be configured
        return { source: 'Twitter/X', success: false, error: error.message, data: [] };
    }
}

// Generate demo data for each source when APIs fail or are not configured
function generateDemoSourceData(source, region) {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const regionCoords = REGIONS[region] || REGIONS.Lebanon;

    switch (source) {
        case 'USGS':
            return {
                source: 'USGS',
                success: true,
                demo: true,
                data: [{
                    type: 'Feature',
                    properties: {
                        mag: 4.2,
                        place: `25km SW of ${region}`,
                        time: twoHoursAgo.getTime(),
                        net: 'us',
                        title: `M 4.2 - 25km SW of ${region}`
                    },
                    geometry: {
                        coordinates: [regionCoords.lon - 0.3, regionCoords.lat - 0.2, 15]
                    }
                }],
                count: 1
            };
        case 'EMSC':
            return {
                source: 'EMSC',
                success: true,
                demo: true,
                data: [{
                    type: 'Feature',
                    properties: {
                        magnitude: 3.8,
                        place: `Near ${region} coast`,
                        time: fourHoursAgo.getTime(),
                        title: `M 3.8 - Near ${region}`
                    },
                    geometry: {
                        coordinates: [regionCoords.lon + 0.2, regionCoords.lat + 0.1, 10]
                    }
                }],
                count: 1
            };
        case 'OpenWeatherMap':
            return {
                source: 'OpenWeatherMap',
                success: true,
                demo: true,
                data: [{
                    event: 'Heat Advisory',
                    headline: `Heat Advisory for ${region} region`,
                    severity: 'MEDIUM',
                    description: 'Temperatures may reach 38°C. Stay hydrated.',
                    onset: fourHoursAgo.toISOString()
                }],
                count: 1
            };
        case 'Tomorrow.io':
            return {
                source: 'Tomorrow.io',
                success: true,
                demo: true,
                data: [{
                    type: 'SEVERE_WIND',
                    severity: 'MEDIUM',
                    speed: 65,
                    description: 'Strong winds expected'
                }],
                count: 1
            };
        case 'NewsAPI.ai':
            return {
                source: 'NewsAPI.ai',
                success: true,
                demo: true,
                data: [{
                    title: `Breaking: Security situation escalating in ${region}`,
                    body: `Reports of increased military activity in the ${region} region. Authorities urging civilians to stay alert.`,
                    dateTime: twoHoursAgo.toISOString(),
                    source: { name: 'Regional News' },
                    url: 'https://example.com/news'
                }, {
                    title: `Emergency services responding to incident in ${region}`,
                    body: `Multiple emergency units dispatched following reports of explosions.`,
                    dateTime: fourHoursAgo.toISOString(),
                    source: { name: 'Breaking Alert' },
                    url: 'https://example.com/alert'
                }],
                count: 2
            };
        case 'Twitter/X':
            return {
                source: 'Twitter/X',
                success: true,
                demo: true,
                data: [{
                    id: `demo-tw-${Date.now()}`,
                    text: `BREAKING: Reports of sirens sounding in ${region}. Residents advised to seek shelter. #${region}Emergency`,
                    created_at: twoHoursAgo.toISOString(),
                    author_id: 'demo'
                }],
                count: 1
            };
        default:
            return { source, success: true, demo: true, data: [], count: 0 };
    }
}

const DETECTION_RUNNERS = {
    usgs: { label: 'USGS', execute: fetchUSGS },
    emsc: { label: 'EMSC', execute: fetchEMSC },
    openweather: { label: 'OpenWeatherMap', execute: fetchOpenWeather },
    tomorrow_io: { label: 'Tomorrow.io', execute: fetchTomorrow },
    newsapi_ai: { label: 'NewsAPI.ai', execute: fetchNewsAPI },
    twitter_x: { label: 'Twitter/X', execute: fetchTwitter }
};

async function runDetectionSources(region, sourceIds, runnerMap = DETECTION_RUNNERS, sourceOptionsById = {}) {
    const selectedSourceIds = [...new Set((sourceIds || []).filter((id) => runnerMap[id]))];
    const results = await Promise.all(selectedSourceIds.map(async (sourceId) => {
        const runner = runnerMap[sourceId];

        try {
            const result = await runner.execute(region, sourceOptionsById[sourceId] || {});
            console.log(`${runner.label}: ${result.success ? `${result.count || 0} items` : result.error}`);
            return [sourceId, result];
        } catch (error) {
            console.error(`${runner.label} failed:`, error.message);
            return [sourceId, {
                source: runner.label,
                success: false,
                error: error.message || 'Unknown error',
                data: [],
                count: 0
            }];
        }
    }));

    return Object.fromEntries(results);
}

function summarizeDetectionResults(region, resultsBySourceId) {
    const regionCoords = REGIONS[region] || REGIONS.Lebanon;
    const earthquakes = [
        ...(resultsBySourceId.usgs?.data || []),
        ...(resultsBySourceId.emsc?.data || [])
    ];
    const weatherAlerts = [
        ...(resultsBySourceId.openweather?.data || []),
        ...(resultsBySourceId.tomorrow_io?.data || [])
    ];
    const newsArticles = resultsBySourceId.newsapi_ai?.data || [];
    const socialMentions = resultsBySourceId.twitter_x?.data || [];

    let primaryEvent = null;

    if (earthquakes.length > 0) {
        const strongest = earthquakes.reduce((max, eq) => {
            const magnitude = eq.properties?.mag || eq.properties?.magnitude || 0;
            const maxMagnitude = max.properties?.mag || max.properties?.magnitude || 0;
            return magnitude > maxMagnitude ? eq : max;
        }, earthquakes[0]);

        primaryEvent = {
            type: 'EARTHQUAKE',
            magnitude: strongest.properties?.mag || strongest.properties?.magnitude,
            lat: strongest.geometry?.coordinates?.[1] || regionCoords.lat,
            lon: strongest.geometry?.coordinates?.[0] || regionCoords.lon,
            time: strongest.properties?.time || Date.now(),
            depth: strongest.geometry?.coordinates?.[2] || 10,
            source: strongest
        };
    } else if (weatherAlerts.length > 0) {
        const alert = weatherAlerts[0];
        primaryEvent = {
            type: alert.event || alert.type || 'WEATHER_ALERT',
            lat: regionCoords.lat,
            lon: regionCoords.lon,
            severity: alert.severity || 'MEDIUM',
            description: alert.description || alert.headline,
            source: alert
        };
    } else if (newsArticles.length > 0) {
        const article = newsArticles[0];
        const title = (article.title || '').toLowerCase();
        let eventType = 'UNCONFIRMED_INCIDENT';

        if (title.includes('earthquake')) eventType = 'EARTHQUAKE';
        else if (title.includes('flood')) eventType = 'FLOOD';
        else if (title.includes('fire')) eventType = 'WILDFIRE';
        else if (title.includes('explosion')) eventType = 'EXPLOSION';

        primaryEvent = {
            type: eventType,
            lat: regionCoords.lat,
            lon: regionCoords.lon,
            source: article,
            headline: article.title
        };
    }

    return {
        primaryEvent,
        summary: {
            earthquakeCount: earthquakes.length,
            weatherAlertCount: weatherAlerts.length,
            newsCount: newsArticles.length,
            socialCount: socialMentions.length,
            hasEvent: primaryEvent !== null
        }
    };
}

async function detectCrisis(region, sourceIds = Object.keys(DETECTION_RUNNERS), sourceOptionsById = {}) {
    console.log(`Starting crisis detection for region: ${region}`);
    const resultsBySourceId = await runDetectionSources(region, sourceIds, DETECTION_RUNNERS, sourceOptionsById);
    const { primaryEvent, summary } = summarizeDetectionResults(region, resultsBySourceId);

    return {
        region,
        timestamp: new Date().toISOString(),
        resultsBySourceId,
        primaryEvent,
        summary
    };
}

module.exports = {
    detectCrisis,
    DETECTION_RUNNERS,
    fetchUSGS,
    fetchEMSC,
    fetchOpenWeather,
    fetchTomorrow,
    fetchNewsAPI,
    fetchTwitter,
    REGIONS,
    runDetectionSources,
    summarizeDetectionResults
};
