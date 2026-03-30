const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getSourceConfig,
    resolveSourceSelection
} = require('../config/sourceCatalog');

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

test.afterEach(() => {
    applyEnv();
});

test('defaults use all available sources when default env vars are unset', () => {
    applyEnv();

    const config = getSourceConfig();
    const detectionDefaults = config.detection.default_source_ids;
    const verificationDefaults = config.verification.default_source_ids;

    assert.deepEqual(
        detectionDefaults,
        ['usgs', 'emsc', 'ministry_info', 'google_news', 'mtv_lebanon', 'al_jadeed', 'lbci', 'nna_lebanon']
    );
    assert.deepEqual(verificationDefaults, ['usgs']);
    assert.equal(config.detection.providers.find((provider) => provider.id === 'openweather').available, false);
    assert.equal(config.verification.providers.find((provider) => provider.id === 'perplexity').available, false);
});

test('configured defaults are intersected with availability', () => {
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

test('selection resolution filters unknown and unavailable sources', () => {
    applyEnv();

    const selection = resolveSourceSelection('detection', ['usgs', 'openweather', 'bogus']);

    assert.deepEqual(selection.requested, ['usgs', 'openweather', 'bogus']);
    assert.deepEqual(selection.resolved, ['usgs']);
    assert.deepEqual(selection.ignored_unavailable, ['openweather']);
    assert.deepEqual(selection.ignored_unknown, ['bogus']);
    assert.ok(selection.skipped_disabled.some((provider) => provider.id === 'google_news'));
});
