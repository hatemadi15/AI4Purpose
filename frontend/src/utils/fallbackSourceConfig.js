const TWITTER_ACCOUNT_OPTIONS = [
    { id: '961news', label: '961 News', handle: '961NEWS', description: 'Lebanese breaking news feed.', default_enabled: true },
    { id: 'alarabiya_brk', label: 'Al Arabiya Breaking', handle: 'AlArabiya_Brk', description: 'Regional breaking news coverage.', default_enabled: true },
    { id: 'aljazeera', label: 'Al Jazeera', handle: 'AlJazeera', description: 'Major regional and international news.', default_enabled: true },
    { id: 'almayadeenlive', label: 'Al Mayadeen', handle: 'AlMayadeenLive', description: 'Regional live news coverage.', default_enabled: true },
    { id: 'annahar', label: 'Annahar', handle: 'Annahar', description: 'Lebanese newspaper and breaking news.', default_enabled: true },
    { id: 'avichayadraee', label: 'Avichay Adraee (IDF)', handle: 'AvichayAdraee', description: 'Official regional military spokesman.', default_enabled: true },
    { id: 'eqalerts', label: 'Earthquake Alerts', handle: 'EQAlerts', description: 'Automated earthquake alert account.', default_enabled: true },
    { id: 'lastquake', label: 'LastQuake (EMSC)', handle: 'LastQuake', description: 'Seismic detection and alert feed.', default_enabled: true },
    { id: 'lbci_news', label: 'LBCI News', handle: 'LBCI_NEWS', description: 'Lebanese broadcaster news account.', default_enabled: true },
    { id: 'lebanon24', label: 'Lebanon 24', handle: 'lebanon24', description: 'Lebanese 24/7 news coverage.', default_enabled: true },
    { id: 'lebanondebate', label: 'Lebanon Debate', handle: 'LebanonDebate', description: 'Lebanese news and analysis.', default_enabled: true },
    { id: 'lebisf', label: 'Lebanese ISF', handle: 'lebISF', description: 'Official Internal Security Forces account.', default_enabled: true },
    { id: 'mtv_lebanon', label: 'MTV Lebanon', handle: 'mtv_lebanon', description: 'MTV Lebanon general account.', default_enabled: true },
    { id: 'mtvlebanonnews', label: 'MTV Lebanon News', handle: 'MTVLebanonNews', description: 'MTV Lebanon news desk account.', default_enabled: true },
    { id: 'naharnetnews', label: 'Naharnet', handle: 'NaharnetNews', description: 'Lebanese news outlet.', default_enabled: true },
    { id: 'redcrosslebanon', label: 'Red Cross Lebanon', handle: 'RedCrossLebanon', description: 'Official emergency response updates.', default_enabled: true },
    { id: 'sentdefender', label: 'Sentdefender', handle: 'sentdefender', description: 'Regional security monitoring account.', default_enabled: true },
    { id: 'tmclebanon', label: 'TMC Lebanon', handle: 'tmclebanon', description: 'Traffic and incident updates.', default_enabled: true }
];

function createTwitterSourceOptionGroup() {
    return [{
        id: 'twitter_accounts',
        label: 'Twitter Accounts',
        type: 'multi_select',
        helper_text: 'Choose which Twitter accounts to query when Twitter is enabled.',
        default_selected_ids: TWITTER_ACCOUNT_OPTIONS.map((option) => option.id),
        options: TWITTER_ACCOUNT_OPTIONS
    }];
}

export const FALLBACK_SOURCE_CONFIG = {
    detection: {
        providers: [
            { id: 'usgs', label: 'USGS', available: true, default_enabled: true },
            { id: 'emsc', label: 'EMSC', available: true, default_enabled: true },
            { id: 'openweather', label: 'OpenWeatherMap', available: true, default_enabled: true },
            { id: 'tomorrow_io', label: 'Tomorrow.io', available: true, default_enabled: true },
            { id: 'newsapi_ai', label: 'NewsAPI.ai', available: true, default_enabled: true },
            { id: 'twitter_x', label: 'Twitter/X', available: true, default_enabled: false, source_options: createTwitterSourceOptionGroup() },
            { id: 'intel_twitter', label: 'Intel Twitter', available: true, default_enabled: false, source_options: createTwitterSourceOptionGroup() },
            { id: 'ministry_info', label: 'Ministry Info', available: true, default_enabled: true },
            { id: 'google_news', label: 'Google News', available: true, default_enabled: true },
            { id: 'mtv_lebanon', label: 'MTV Lebanon', available: true, default_enabled: true },
            { id: 'al_jadeed', label: 'Al Jadeed', available: true, default_enabled: true },
            { id: 'lbci', label: 'LBCI', available: true, default_enabled: true },
            { id: 'nna_lebanon', label: 'NNA Lebanon', available: true, default_enabled: true }
        ]
    },
    verification: {
        providers: [
            { id: 'twitter_search', label: 'Twitter Search', available: true, default_enabled: false, source_options: createTwitterSourceOptionGroup() },
            { id: 'newsapi_ai', label: 'NewsAPI.ai', available: true, default_enabled: true },
            { id: 'openweather', label: 'OpenWeatherMap', available: true, default_enabled: true },
            { id: 'usgs', label: 'USGS', available: true, default_enabled: true },
            { id: 'perplexity', label: 'Perplexity', available: false, default_enabled: false, reason_unavailable: 'Loading backend availability...' }
        ]
    }
};
