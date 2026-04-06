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
    applyEnv({
        OPENWEATHER_API_KEY: null,
        TOMORROW_IO_API_KEY: null,
        NEWSAPI_AI_KEY: null,
        TWITTER_API_KEY: null,
        TWITTER_API_SECRET: null,
        TWITTER_BEARER_TOKEN: null,
        PERPLEXITY_API_KEY: null,
        ENABLED_DETECTION_SOURCES: null,
        ENABLED_VERIFICATION_SOURCES: null
    });

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
    assert.equal(
        config.verification.providers.find((provider) => provider.id === 'twitter_search').source_options?.[0]?.options?.length > 0,
        true
    );
});

test('configured defaults are intersected with availability', () => {
    applyEnv({
        OPENWEATHER_API_KEY: 'weather-key',
        PERPLEXITY_API_KEY: 'perplexity-key',
        TWITTER_API_KEY: 'twitter-key',
        TWITTER_API_SECRET: 'twitter-secret',
        ENABLED_DETECTION_SOURCES: 'usgs,openweather,twitter_x,unknown',
        ENABLED_VERIFICATION_SOURCES: 'twitter_search,openweather,perplexity'
    });

    const config = getSourceConfig();

    assert.deepEqual(config.detection.default_source_ids, ['usgs', 'openweather', 'twitter_x']);
    assert.deepEqual(config.verification.default_source_ids, ['twitter_search', 'openweather', 'perplexity']);
});

test('selection resolution filters unknown and unavailable sources', () => {
    applyEnv({
        OPENWEATHER_API_KEY: null,
        TOMORROW_IO_API_KEY: null,
        NEWSAPI_AI_KEY: null,
        TWITTER_API_KEY: null,
        TWITTER_API_SECRET: null,
        TWITTER_BEARER_TOKEN: null,
        PERPLEXITY_API_KEY: null
    });

    const selection = resolveSourceSelection('detection', ['usgs', 'openweather', 'bogus']);

    assert.deepEqual(selection.requested, ['usgs', 'openweather', 'bogus']);
    assert.deepEqual(selection.resolved, ['usgs']);
    assert.deepEqual(selection.ignored_unavailable, ['openweather']);
    assert.deepEqual(selection.ignored_unknown, ['bogus']);
    assert.ok(selection.skipped_disabled.some((provider) => provider.id === 'google_news'));
});

test('selection resolution filters unknown source options and keeps resolved account metadata', () => {
    applyEnv({
        TWITTER_API_KEY: 'twitter-key',
        TWITTER_API_SECRET: 'twitter-secret'
    });

    const selection = resolveSourceSelection(
        'verification',
        ['twitter_search'],
        {
            twitter_search: {
                twitter_accounts: ['eqalerts', 'bogus', 'lbci_news']
            }
        }
    );

    const twitterAccounts = selection.resolved_source_options.twitter_search.twitter_accounts;

    assert.deepEqual(twitterAccounts.resolved, ['eqalerts', 'lbci_news']);
    assert.deepEqual(twitterAccounts.ignored_unknown, ['bogus']);
    assert.deepEqual(
        twitterAccounts.resolved_details.map((account) => account.handle),
        ['EQAlerts', 'LBCI_NEWS']
    );
});
