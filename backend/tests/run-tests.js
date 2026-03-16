const assert = require('node:assert/strict');
const path = require('node:path');

const { getSourceConfig, resolveSourceSelection } = require('../config/sourceCatalog');
const { BACKEND_ROOT, REPO_ROOT, resolveSqliteOptions, resolveSqliteStoragePath } = require('../config/runtime');
const { runDetectionSources, summarizeDetectionResults } = require('../services/detectionService');
const { aggregateIntel } = require('../services/intelService');
const { calculateVerificationOutcome, runVerificationSources } = require('../services/verificationService');

const ORIGINAL_ENV = { ...process.env };
const RELEVANT_ENV_KEYS = [
    'OPENWEATHER_API_KEY',
    'TOMORROW_IO_API_KEY',
    'NEWSAPI_AI_KEY',
    'TWITTER_API_KEY',
    'TWITTER_API_SECRET',
    'TWITTER_BEARER_TOKEN',
    'PERPLEXITY_API_KEY',
    'ENABLED_DETECTION_SOURCES',
    'ENABLED_VERIFICATION_SOURCES'
];

function applyEnv(overrides = {}) {
    for (const key of RELEVANT_ENV_KEYS) {
        if (Object.prototype.hasOwnProperty.call(ORIGINAL_ENV, key)) {
            process.env[key] = ORIGINAL_ENV[key];
        } else {
            delete process.env[key];
        }
    }

    for (const [key, value] of Object.entries(overrides)) {
        if (value == null) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
}

function createEarthquakeFeature({ magnitude = 4.8, place = 'Near Beirut', time = Date.now() } = {}) {
    return {
        type: 'Feature',
        properties: {
            mag: magnitude,
            place,
            time,
            net: 'us'
        },
        geometry: {
            coordinates: [35.5, 33.9, 12]
        }
    };
}

async function runCase(name, fn) {
    try {
        await fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        console.error(error);
        process.exitCode = 1;
    } finally {
        applyEnv();
    }
}

async function main() {
    await runCase('source config defaults use available sources', async () => {
        applyEnv();
        const config = getSourceConfig();

        assert.deepEqual(
            config.detection.default_source_ids,
            ['usgs', 'emsc', 'ministry_info', 'google_news', 'mtv_lebanon', 'al_jadeed', 'lbci', 'nna_lebanon']
        );
        assert.deepEqual(config.verification.default_source_ids, ['usgs']);
        assert.equal(config.detection.providers.find((provider) => provider.id === 'openweather').available, false);
    });

    await runCase('source config respects env-configured defaults', async () => {
        applyEnv({
            OPENWEATHER_API_KEY: 'weather-key',
            PERPLEXITY_API_KEY: 'perplexity-key',
            ENABLED_DETECTION_SOURCES: 'usgs,openweather,unknown',
            ENABLED_VERIFICATION_SOURCES: 'openweather,perplexity'
        });
        const config = getSourceConfig();

        assert.deepEqual(config.detection.default_source_ids, ['usgs', 'openweather']);
        assert.deepEqual(config.verification.default_source_ids, ['openweather', 'perplexity']);
    });

    await runCase('source selection filters unknown and unavailable providers', async () => {
        applyEnv();
        const selection = resolveSourceSelection('detection', ['usgs', 'openweather', 'bogus']);

        assert.deepEqual(selection.resolved, ['usgs']);
        assert.deepEqual(selection.ignored_unavailable, ['openweather']);
        assert.deepEqual(selection.ignored_unknown, ['bogus']);
    });

    await runCase('sqlite paths resolve consistently from backend config', async () => {
        assert.equal(
            resolveSqliteStoragePath(path.join('data', 'medalert.sqlite')),
            path.join(BACKEND_ROOT, 'data', 'medalert.sqlite')
        );

        assert.equal(
            resolveSqliteStoragePath(path.join('backend', 'data', 'medalert.sqlite')),
            path.join(REPO_ROOT, 'backend', 'data', 'medalert.sqlite')
        );

        assert.deepEqual(
            resolveSqliteOptions({ databaseUrl: 'sqlite:data/medalert.sqlite' }),
            {
                dialect: 'sqlite',
                storage: path.join(BACKEND_ROOT, 'data', 'medalert.sqlite'),
                logging: false
            }
        );
    });

    await runCase('runDetectionSources only executes selected providers', async () => {
        const calls = [];
        const runnerMap = {
            usgs: {
                label: 'USGS',
                execute: async () => {
                    calls.push('usgs');
                    return { source: 'USGS', success: true, data: [], count: 0 };
                }
            },
            newsapi_ai: {
                label: 'NewsAPI.ai',
                execute: async () => {
                    calls.push('newsapi_ai');
                    return { source: 'NewsAPI.ai', success: true, data: [], count: 0 };
                }
            },
            twitter_x: {
                label: 'Twitter/X',
                execute: async () => {
                    calls.push('twitter_x');
                    return { source: 'Twitter/X', success: true, data: [], count: 0 };
                }
            }
        };

        const results = await runDetectionSources('Lebanon', ['usgs', 'newsapi_ai'], runnerMap);

        assert.deepEqual(calls.sort(), ['newsapi_ai', 'usgs']);
        assert.deepEqual(Object.keys(results).sort(), ['newsapi_ai', 'usgs']);
    });

    await runCase('summarizeDetectionResults works with partial source maps', async () => {
        const summary = summarizeDetectionResults('Lebanon', {
            usgs: {
                success: true,
                data: [createEarthquakeFeature()],
                count: 1
            }
        });

        assert.equal(summary.summary.earthquakeCount, 1);
        assert.equal(summary.summary.weatherAlertCount, 0);
        assert.equal(summary.summary.hasEvent, true);
        assert.equal(summary.primaryEvent.type, 'EARTHQUAKE');
    });

    await runCase('aggregateIntel handles sparse source result maps', async () => {
        const now = new Date().toISOString();
        const aggregated = aggregateIntel({
            region: 'Lebanon',
            sourceResults: {
                usgs: {
                    success: true,
                    data: [createEarthquakeFeature()],
                    count: 1
                },
                google_news: {
                    success: true,
                    findings: [{
                        id: 'google_1',
                        source: 'Google News (Demo)',
                        source_type: 'web_scraper',
                        title: 'Earthquake reported near Beirut',
                        description: 'Demo article',
                        url: 'https://example.com/article',
                        posted_at: now,
                        fetched_at: now,
                        language: 'en'
                    }],
                    count: 1
                }
            }
        });

        assert.equal(aggregated.total_findings, 2);
        assert.equal(aggregated.summary.web_scraper, 1);
        assert.equal(aggregated.findings.filter((finding) => finding.source_type === 'seismic_sensor').length, 1);
    });

    await runCase('runVerificationSources skips Twitter and media analysis when Twitter is disabled', async () => {
        const calls = [];
        const result = await runVerificationSources({
            alertId: 1,
            io: null,
            eventDetails: { type: 'EARTHQUAKE', region: 'Lebanon', lat: 33.9, lon: 35.5, description: 'Test event' },
            searchKeywords: {},
            sourceSelection: { resolved: ['newsapi_ai', 'perplexity'] },
            deps: {
                searchTwitter: async () => {
                    calls.push('twitter');
                    return { texts: ['tweet'], metadata: [], image_urls: ['https://example.com/image.jpg'], sources: {} };
                },
                searchNews: async () => {
                    calls.push('news');
                    return [{ title: 'Test article' }];
                },
                checkWeatherVerification: async () => {
                    calls.push('weather');
                    return { confirmed: false };
                },
                checkSeismicVerification: async () => {
                    calls.push('usgs');
                    return { confirmed: true };
                },
                perplexitySearch: async () => {
                    calls.push('perplexity');
                    return { independent_confirmation_found: false, total_sources_found: 0, corroborating_sources: 0 };
                },
                analyzeMedia: async () => {
                    calls.push('media');
                    return { analyzed: true, images: [], summary: {} };
                }
            }
        });

        assert.deepEqual(calls.sort(), ['news', 'perplexity']);
        assert.deepEqual(result.twitterData.texts, []);
        assert.equal(result.mediaAnalysis.analyzed, false);
    });

    await runCase('calculateVerificationOutcome excludes disabled sources from denominator and score inputs', async () => {
        const outcome = calculateVerificationOutcome({
            enabledSourceIds: ['openweather'],
            twitterData: {
                texts: ['tweet-1', 'tweet-2'],
                metadata: [],
                image_urls: [],
                sources: {}
            },
            newsData: [{ title: 'Article 1' }, { title: 'Article 2' }],
            scientificData: {
                weather: { confirmed: true, source: 'OpenWeatherMap' },
                seismic: { confirmed: true, source: 'USGS' }
            },
            perplexityData: {
                independent_confirmation_found: true,
                total_sources_found: 3,
                corroborating_sources: 2
            },
            mediaAnalysis: {
                analyzed: true,
                images: [],
                summary: { high_value_evidence: 2 }
            },
            geminiResult: {
                sources_analysis: [],
                semantic_match_score: 10
            }
        });

        assert.equal(outcome.totalSources, 1);
        assert.equal(outcome.confirmedSources, 1);
        assert.equal(outcome.perplexityTotal, 0);
        assert.equal(outcome.twitterFound, 0);
        assert.equal(outcome.mediaBonus, 0);
        assert.equal(outcome.finalScore, 25);
    });

    if (process.exitCode) {
        process.exit(process.exitCode);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
