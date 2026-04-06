function createAccount(id, handle, label, description) {
    return {
        id,
        handle,
        label,
        description
    };
}

const ACCOUNT_DEFINITIONS = {
    '961news': createAccount('961news', '961NEWS', '961 News', 'Lebanese breaking news feed.'),
    'alarabiya_brk': createAccount('alarabiya_brk', 'AlArabiya_Brk', 'Al Arabiya Breaking', 'Regional breaking news coverage.'),
    aljazeera: createAccount('aljazeera', 'AlJazeera', 'Al Jazeera', 'Major regional and international news.'),
    almayadeenlive: createAccount('almayadeenlive', 'AlMayadeenLive', 'Al Mayadeen', 'Regional live news coverage.'),
    annahar: createAccount('annahar', 'Annahar', 'Annahar', 'Lebanese newspaper and breaking news.'),
    avichayadraee: createAccount('avichayadraee', 'AvichayAdraee', 'Avichay Adraee (IDF)', 'Official regional military spokesman.'),
    eqalerts: createAccount('eqalerts', 'EQAlerts', 'Earthquake Alerts', 'Automated earthquake alert account.'),
    lastquake: createAccount('lastquake', 'LastQuake', 'LastQuake (EMSC)', 'Seismic detection and alert feed.'),
    lbci_news: createAccount('lbci_news', 'LBCI_NEWS', 'LBCI News', 'Lebanese broadcaster news account.'),
    lebanon24: createAccount('lebanon24', 'lebanon24', 'Lebanon 24', 'Lebanese 24/7 news coverage.'),
    lebanondebate: createAccount('lebanondebate', 'LebanonDebate', 'Lebanon Debate', 'Lebanese news and analysis.'),
    lebisf: createAccount('lebisf', 'lebISF', 'Lebanese ISF', 'Official Internal Security Forces account.'),
    mtv_lebanon: createAccount('mtv_lebanon', 'mtv_lebanon', 'MTV Lebanon', 'MTV Lebanon general account.'),
    mtvlebanonnews: createAccount('mtvlebanonnews', 'MTVLebanonNews', 'MTV Lebanon News', 'MTV Lebanon news desk account.'),
    naharnetnews: createAccount('naharnetnews', 'NaharnetNews', 'Naharnet', 'Lebanese news outlet.'),
    redcrosslebanon: createAccount('redcrosslebanon', 'RedCrossLebanon', 'Red Cross Lebanon', 'Official emergency response updates.'),
    sentdefender: createAccount('sentdefender', 'sentdefender', 'Sentdefender', 'Regional security monitoring account.'),
    tmclebanon: createAccount('tmclebanon', 'tmclebanon', 'TMC Lebanon', 'Traffic and incident updates.')
};

const GLOBAL_TWITTER_ACCOUNT_IDS = [
    '961news',
    'alarabiya_brk',
    'aljazeera',
    'almayadeenlive',
    'annahar',
    'avichayadraee',
    'eqalerts',
    'lastquake',
    'lbci_news',
    'lebanon24',
    'lebanondebate',
    'lebisf',
    'mtv_lebanon',
    'mtvlebanonnews',
    'naharnetnews',
    'redcrosslebanon',
    'sentdefender',
    'tmclebanon'
];

const SOURCE_ACCOUNT_IDS = {
    twitter: GLOBAL_TWITTER_ACCOUNT_IDS,
    twitter_x: GLOBAL_TWITTER_ACCOUNT_IDS,
    intel_twitter: GLOBAL_TWITTER_ACCOUNT_IDS,
    twitter_search: GLOBAL_TWITTER_ACCOUNT_IDS
};

function normalizeTwitterAccountId(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

function getTwitterAccountCatalog(sourceId) {
    return (SOURCE_ACCOUNT_IDS[sourceId] || [])
        .map((accountId) => ACCOUNT_DEFINITIONS[accountId])
        .filter(Boolean)
        .map((account) => ({
            ...account,
            default_enabled: true
        }));
}

function getDefaultTwitterAccountIds(sourceId) {
    return getTwitterAccountCatalog(sourceId).map((account) => account.id);
}

function getTwitterAccountsByIds(sourceId, accountIds) {
    const catalog = getTwitterAccountCatalog(sourceId);
    if (!Array.isArray(accountIds)) {
        return catalog;
    }

    const accountMap = new Map(catalog.map((account) => [account.id, account]));
    const selectedIds = [...new Set(accountIds.map(normalizeTwitterAccountId).filter(Boolean))];

    return selectedIds
        .map((accountId) => accountMap.get(accountId))
        .filter(Boolean);
}

function getTwitterHandlesByIds(sourceId, accountIds) {
    return getTwitterAccountsByIds(sourceId, accountIds).map((account) => account.handle);
}

module.exports = {
    getDefaultTwitterAccountIds,
    getTwitterAccountCatalog,
    getTwitterAccountsByIds,
    getTwitterHandlesByIds,
    normalizeTwitterAccountId
};
