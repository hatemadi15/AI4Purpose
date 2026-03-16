const { loadBackendEnv } = require('./runtime');

loadBackendEnv();

const DEFAULT_ENV_VARS = {
    detection: 'ENABLED_DETECTION_SOURCES',
    verification: 'ENABLED_VERIFICATION_SOURCES'
};

function hasValue(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function hasTwitterCredentials() {
    return Boolean(
        hasValue(process.env.TWITTER_BEARER_TOKEN) ||
        (hasValue(process.env.TWITTER_API_KEY) && hasValue(process.env.TWITTER_API_SECRET))
    );
}

function checkEnvVar(name) {
    return hasValue(process.env[name])
        ? { available: true }
        : { available: false, reason_unavailable: `Missing ${name}` };
}

function checkTwitterAvailability() {
    return hasTwitterCredentials()
        ? { available: true }
        : {
            available: false,
            reason_unavailable: 'Missing TWITTER_BEARER_TOKEN or TWITTER_API_KEY/TWITTER_API_SECRET'
        };
}

const SOURCE_CATALOG = {
    detection: [
        { id: 'usgs', label: 'USGS', getAvailability: () => ({ available: true }) },
        { id: 'emsc', label: 'EMSC', getAvailability: () => ({ available: true }) },
        { id: 'openweather', label: 'OpenWeatherMap', getAvailability: () => checkEnvVar('OPENWEATHER_API_KEY') },
        { id: 'tomorrow_io', label: 'Tomorrow.io', getAvailability: () => checkEnvVar('TOMORROW_IO_API_KEY') },
        { id: 'newsapi_ai', label: 'NewsAPI.ai', getAvailability: () => checkEnvVar('NEWSAPI_AI_KEY') },
        { id: 'twitter_x', label: 'Twitter/X', getAvailability: () => checkTwitterAvailability() },
        { id: 'intel_twitter', label: 'Intel Twitter', getAvailability: () => checkTwitterAvailability() },
        { id: 'ministry_info', label: 'Ministry Info', getAvailability: () => ({ available: true }) },
        { id: 'google_news', label: 'Google News', getAvailability: () => ({ available: true }) },
        { id: 'mtv_lebanon', label: 'MTV Lebanon', getAvailability: () => ({ available: true }) },
        { id: 'al_jadeed', label: 'Al Jadeed', getAvailability: () => ({ available: true }) },
        { id: 'lbci', label: 'LBCI', getAvailability: () => ({ available: true }) },
        { id: 'nna_lebanon', label: 'NNA Lebanon', getAvailability: () => ({ available: true }) }
    ],
    verification: [
        { id: 'twitter_search', label: 'Twitter Search', getAvailability: () => checkTwitterAvailability() },
        { id: 'newsapi_ai', label: 'NewsAPI.ai', getAvailability: () => checkEnvVar('NEWSAPI_AI_KEY') },
        { id: 'openweather', label: 'OpenWeatherMap', getAvailability: () => checkEnvVar('OPENWEATHER_API_KEY') },
        { id: 'usgs', label: 'USGS', getAvailability: () => ({ available: true }) },
        { id: 'perplexity', label: 'Perplexity', getAvailability: () => checkEnvVar('PERPLEXITY_API_KEY') }
    ]
};

function normalizeSourceId(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

function parseSourceList(rawValue) {
    if (!hasValue(rawValue)) {
        return [];
    }

    const seen = new Set();
    const result = [];

    for (const item of rawValue.split(',')) {
        const id = normalizeSourceId(item);
        if (!id || seen.has(id)) {
            continue;
        }
        seen.add(id);
        result.push(id);
    }

    return result;
}

function getStageCatalog(stage) {
    const catalog = SOURCE_CATALOG[stage];
    if (!catalog) {
        throw new Error(`Unknown source catalog stage: ${stage}`);
    }
    return catalog;
}

function getStageProviders(stage) {
    return getStageCatalog(stage).map((provider) => {
        const availability = provider.getAvailability();
        return {
            id: provider.id,
            label: provider.label,
            available: availability.available,
            reason_unavailable: availability.reason_unavailable || null
        };
    });
}

function getDefaultSourceIds(stage, providers = getStageProviders(stage)) {
    const envVar = DEFAULT_ENV_VARS[stage];
    const envValue = process.env[envVar];
    const availableProviders = providers.filter((provider) => provider.available);

    if (!hasValue(envValue)) {
        return availableProviders.map((provider) => provider.id);
    }

    const requestedIds = parseSourceList(envValue);
    const availableIds = new Set(availableProviders.map((provider) => provider.id));

    return requestedIds.filter((id) => availableIds.has(id));
}

function buildStageConfig(stage) {
    const providers = getStageProviders(stage);
    const defaultSourceIds = new Set(getDefaultSourceIds(stage, providers));

    return {
        default_source_ids: [...defaultSourceIds],
        providers: providers.map((provider) => ({
            id: provider.id,
            label: provider.label,
            available: provider.available,
            default_enabled: provider.available && defaultSourceIds.has(provider.id),
            ...(provider.reason_unavailable ? { reason_unavailable: provider.reason_unavailable } : {})
        }))
    };
}

function getSourceConfig() {
    return {
        detection: buildStageConfig('detection'),
        verification: buildStageConfig('verification')
    };
}

function resolveSourceSelection(stage, requestedIds) {
    const stageConfig = buildStageConfig(stage);
    const providerMap = new Map(stageConfig.providers.map((provider) => [provider.id, provider]));
    const usedDefaults = !Array.isArray(requestedIds);
    const normalizedRequested = Array.isArray(requestedIds)
        ? [...new Set(requestedIds.map(normalizeSourceId).filter(Boolean))]
        : null;
    const requestedOrDefault = normalizedRequested || stageConfig.default_source_ids;
    const ignoredUnknown = [];
    const ignoredUnavailable = [];
    const resolved = [];

    for (const id of requestedOrDefault) {
        const provider = providerMap.get(id);
        if (!provider) {
            ignoredUnknown.push(id);
            continue;
        }
        if (!provider.available) {
            ignoredUnavailable.push(id);
            continue;
        }
        resolved.push(id);
    }

    const resolvedSet = new Set(resolved);

    return {
        requested: normalizedRequested,
        resolved,
        ignored_unknown: ignoredUnknown,
        ignored_unavailable: ignoredUnavailable,
        resolved_details: resolved.map((id) => {
            const provider = providerMap.get(id);
            return { id: provider.id, label: provider.label };
        }),
        skipped_disabled: stageConfig.providers
            .filter((provider) => provider.available && !resolvedSet.has(provider.id))
            .map((provider) => ({ id: provider.id, label: provider.label })),
        used_defaults: usedDefaults
    };
}

module.exports = {
    DEFAULT_ENV_VARS,
    SOURCE_CATALOG,
    getDefaultSourceIds,
    getSourceConfig,
    getStageProviders,
    normalizeSourceId,
    parseSourceList,
    resolveSourceSelection
};
