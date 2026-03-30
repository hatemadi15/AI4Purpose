const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TEST_DB_PATH = path.join(os.tmpdir(), 'medalert-run-tests.sqlite');
fs.rmSync(TEST_DB_PATH, { force: true });
process.env.DATABASE_URL = `sqlite:${TEST_DB_PATH}`;

const { getSourceConfig, resolveSourceSelection } = require('../config/sourceCatalog');
const { BACKEND_ROOT, REPO_ROOT, resolveSqliteOptions, resolveSqliteStoragePath } = require('../config/runtime');
const { sequelize, Alert, IntelFinding, MediaEvidence } = require('../models');
const { runDetectionSources, summarizeDetectionResults } = require('../services/detectionService');
const { aggregateIntel } = require('../services/intelService');
const { calculateVerificationOutcome, runVerificationSources } = require('../services/verificationService');
const {
    attachUploadedMediaToFinding,
    copyFindingMediaToAlert,
    createRemoteMediaEvidence,
    extractImageCandidates,
    purgeExpiredMediaEvidence,
    syncAlertRemoteMedia
} = require('../services/mediaService');
const { createApp, createRealtimeServer } = require('../server');

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
        delete process.env[key];
    }

    for (const [key, value] of Object.entries(overrides)) {
        if (value == null) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
}

async function resetTestDatabase() {
    await sequelize.sync({ force: true });
}

async function withHttpServer(run) {
    const app = createApp();
    const { server, io } = createRealtimeServer(app);

    await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
        await run(baseUrl);
    } finally {
        io.close();
        await new Promise((resolve) => server.close(resolve));
    }
}

function createImageFormData({ fieldName = 'images[]', filename = 'evidence.png', type = 'image/png', body = 'fake-image' } = {}) {
    const formData = new FormData();
    formData.append(fieldName, new Blob([body], { type }), filename);
    return formData;
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

async function createTestAlert(overrides = {}) {
    return Alert.create({
        event_type: 'EARTHQUAKE',
        lat: 33.8938,
        lon: 35.5018,
        affected_radius_km: 30,
        severity: 'MEDIUM',
        alert_messages: {},
        affected_users_count: { critical: 0, warning: 0, watch: 0 },
        region: 'Lebanon',
        ...overrides
    });
}

async function createTestFinding(overrides = {}) {
    return IntelFinding.create({
        finding_id: `finding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'NEWS',
        source: 'Test Source',
        source_type: 'news',
        title: 'Test finding',
        region: 'Lebanon',
        ...overrides
    });
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
        assert.equal(outcome.mediaBonus, 20);
        assert.equal(outcome.finalScore, 45);
    });

    await runCase('extractImageCandidates normalizes supported image fields', async () => {
        const images = extractImageCandidates({
            image: ' https://example.com/news.jpg ',
            image_url: 'http://example.com/secondary.png',
            preview_image_url: 'ftp://ignore.me/image.png',
            raw_data: {
                image: 'https://example.com/raw.webp'
            }
        });

        assert.deepEqual(images, [
            'https://example.com/news.jpg',
            'http://example.com/secondary.png',
            'https://example.com/raw.webp'
        ]);
    });

    await runCase('syncAlertRemoteMedia stores twitter and news media against alerts', async () => {
        await resetTestDatabase();
        const alert = await createTestAlert();

        await syncAlertRemoteMedia({
            alertId: alert.id,
            twitterImageUrls: ['https://example.com/twitter-photo.jpg'],
            newsImageUrls: ['https://example.com/news-photo.jpg']
        });

        const media = await MediaEvidence.findAll({
            where: { alert_id: alert.id },
            order: [['origin', 'ASC']]
        });

        assert.equal(media.length, 2);
        assert.deepEqual(media.map((record) => record.origin), ['news', 'twitter']);
    });

    await runCase('copyFindingMediaToAlert carries existing finding evidence forward', async () => {
        await resetTestDatabase();
        const finding = await createTestFinding();
        const alert = await createTestAlert();

        await createRemoteMediaEvidence({
            intelFindingId: finding.id,
            origin: 'news',
            sourceUrl: 'https://example.com/copied-image.jpg'
        });

        const copied = await copyFindingMediaToAlert(finding.id, alert.id);
        const alertMedia = await MediaEvidence.findAll({ where: { alert_id: alert.id } });

        assert.equal(copied.length, 1);
        assert.equal(alertMedia.length, 1);
        assert.equal(alertMedia[0].source_url, 'https://example.com/copied-image.jpg');
    });

    await runCase('purgeExpiredMediaEvidence removes expired uploaded files and marks records expired', async () => {
        await resetTestDatabase();
        const alert = await createTestAlert();
        const expiredFilePath = path.join(BACKEND_ROOT, 'data', 'media-temp', `expired-${Date.now()}.png`);

        fs.mkdirSync(path.dirname(expiredFilePath), { recursive: true });
        fs.writeFileSync(expiredFilePath, 'expired-file');

        const record = await MediaEvidence.create({
            alert_id: alert.id,
            origin: 'analyst_upload',
            storage_path: path.relative(BACKEND_ROOT, expiredFilePath),
            mime_type: 'image/png',
            file_size_bytes: 12,
            sha256: 'expired-file',
            expires_at: new Date(Date.now() - 1000)
        });

        const purgedCount = await purgeExpiredMediaEvidence();
        await record.reload();

        assert.equal(purgedCount, 1);
        assert.equal(fs.existsSync(expiredFilePath), false);
        assert.equal(record.analysis_status, 'EXPIRED');
        assert.equal(record.storage_path, null);
    });

    await runCase('findings history persists and excludes alert-created items by default', async () => {
        await resetTestDatabase();

        const persistedFinding = await createTestFinding({
            finding_id: 'finding-history-visible',
            title: 'Persisted visible finding',
            region: 'Lebanon',
            severity: 'HIGH',
            posted_at: new Date('2026-03-28T10:00:00.000Z')
        });

        await createTestFinding({
            finding_id: 'finding-history-alerted',
            title: 'Persisted alerted finding',
            region: 'Lebanon',
            severity: 'CRITICAL',
            alert_created: true
        });

        await createRemoteMediaEvidence({
            intelFindingId: persistedFinding.id,
            origin: 'news',
            sourceUrl: 'https://example.com/persisted-visible.jpg'
        });

        await withHttpServer(async (baseUrl) => {
            const defaultResponse = await fetch(`${baseUrl}/api/detect/findings?region=Lebanon`);
            assert.equal(defaultResponse.status, 200);
            const defaultJson = await defaultResponse.json();

            assert.equal(defaultJson.findings.length, 1);
            assert.equal(defaultJson.findings[0].finding_id, 'finding-history-visible');
            assert.equal(defaultJson.findings[0].media_count, 1);

            await createTestFinding({
                finding_id: 'finding-history-new-search',
                title: 'Persisted after another search',
                region: 'Lebanon',
                severity: 'LOW',
                posted_at: new Date('2026-03-28T12:00:00.000Z')
            });

            const updatedResponse = await fetch(`${baseUrl}/api/detect/findings?region=Lebanon`);
            assert.equal(updatedResponse.status, 200);
            const updatedJson = await updatedResponse.json();

            assert.deepEqual(
                updatedJson.findings.map((finding) => finding.finding_id),
                ['finding-history-visible', 'finding-history-new-search']
            );

            const includeAlertCreatedResponse = await fetch(`${baseUrl}/api/detect/findings?region=Lebanon&include_alert_created=true`);
            assert.equal(includeAlertCreatedResponse.status, 200);
            const includeAlertCreatedJson = await includeAlertCreatedResponse.json();

            assert.deepEqual(
                includeAlertCreatedJson.findings.map((finding) => finding.finding_id).sort(),
                ['finding-history-alerted', 'finding-history-new-search', 'finding-history-visible']
            );
        });
    });

    await runCase('finding media routes upload, preview, list, and delete evidence', async () => {
        await resetTestDatabase();
        const finding = await createTestFinding({ finding_id: 'finding-route-media' });

        await withHttpServer(async (baseUrl) => {
            const uploadResponse = await fetch(`${baseUrl}/api/detect/findings/${finding.finding_id}/media`, {
                method: 'POST',
                body: createImageFormData()
            });

            assert.equal(uploadResponse.status, 200);
            const uploadJson = await uploadResponse.json();
            assert.equal(uploadJson.media.length, 1);

            const mediaId = uploadJson.media[0].id;

            const contentResponse = await fetch(`${baseUrl}/api/media/${mediaId}/content`);
            assert.equal(contentResponse.status, 200);
            assert.equal(contentResponse.headers.get('content-type'), 'image/png');

            const listResponse = await fetch(`${baseUrl}/api/detect/findings/${finding.finding_id}/media`);
            const listJson = await listResponse.json();
            assert.equal(listJson.media.length, 1);

            const deleteResponse = await fetch(`${baseUrl}/api/media/${mediaId}`, { method: 'DELETE' });
            assert.equal(deleteResponse.status, 200);

            const afterDeleteResponse = await fetch(`${baseUrl}/api/detect/findings/${finding.finding_id}/media`);
            const afterDeleteJson = await afterDeleteResponse.json();
            assert.equal(afterDeleteJson.media.length, 0);
        });
    });

    await runCase('manual alert route accepts multipart images and stores analyst uploads', async () => {
        await resetTestDatabase();

        await withHttpServer(async (baseUrl) => {
            const formData = createImageFormData();
            formData.append('event_type', 'SECURITY_INCIDENT');
            formData.append('lat', '33.8938');
            formData.append('lon', '35.5018');
            formData.append('affected_radius_km', '30');
            formData.append('severity', 'HIGH');
            formData.append('message', 'Shelter in place until further notice.');
            formData.append('analyst_name', 'Route Test');
            formData.append('intel_sources', JSON.stringify(['Analyst camera']));

            const createResponse = await fetch(`${baseUrl}/api/alerts/manual`, {
                method: 'POST',
                body: formData
            });

            assert.equal(createResponse.status, 200);
            const createJson = await createResponse.json();
            assert.ok(createJson.alertId);

            const mediaResponse = await fetch(`${baseUrl}/api/alerts/${createJson.alertId}/media`);
            const mediaJson = await mediaResponse.json();
            assert.equal(mediaJson.media.length, 1);
            assert.equal(mediaJson.media[0].origin, 'analyst_upload');
        });
    });

    if (process.exitCode) {
        process.exit(process.exitCode);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
