const test = require('node:test');
const assert = require('node:assert/strict');

const {
    calculateVerificationOutcome,
    runVerificationSources
} = require('../services/verificationService');

test('runVerificationSources only executes enabled providers and skips media when Twitter is disabled', async () => {
    const calls = [];
    const sourceSelection = {
        resolved: ['newsapi_ai', 'perplexity'],
        resolved_source_options: {}
    };

    const result = await runVerificationSources({
        alertId: 1,
        io: null,
        eventDetails: { type: 'EARTHQUAKE', region: 'Lebanon', lat: 33.9, lon: 35.5, description: 'Test event' },
        searchKeywords: {},
        sourceSelection,
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

test('runVerificationSources forwards selected Twitter account options', async () => {
    const receivedOptions = [];
    const sourceSelection = {
        resolved: ['twitter_search'],
        resolved_source_options: {
            twitter_search: {
                twitter_accounts: {
                    resolved: ['eqalerts', 'lbci_news']
                }
            }
        }
    };

    await runVerificationSources({
        alertId: 1,
        io: null,
        eventDetails: { type: 'EARTHQUAKE', region: 'Lebanon', lat: 33.9, lon: 35.5, description: 'Test event' },
        searchKeywords: {},
        sourceSelection,
        deps: {
            searchTwitter: async (_eventDetails, _searchKeywords, sourceOptions) => {
                receivedOptions.push(sourceOptions);
                return { texts: [], metadata: [], image_urls: [], sources: {} };
            },
            searchNews: async () => [],
            checkWeatherVerification: async () => null,
            checkSeismicVerification: async () => null,
            perplexitySearch: async () => ({ independent_confirmation_found: false, total_sources_found: 0, corroborating_sources: 0 }),
            analyzeMedia: async () => ({ analyzed: false, images: [], summary: {} })
        }
    });

    assert.deepEqual(receivedOptions, [{ twitter_accounts: { resolved: ['eqalerts', 'lbci_news'] } }]);
});

test('runVerificationSources preserves metadata-rich media analysis output', async () => {
    const result = await runVerificationSources({
        alertId: 1,
        io: null,
        eventDetails: { type: 'EARTHQUAKE', region: 'Lebanon', lat: 33.9, lon: 35.5, description: 'Test event' },
        searchKeywords: {},
        sourceSelection: {
            resolved: ['twitter_search'],
            resolved_source_options: {}
        },
        deps: {
            searchTwitter: async () => ({
                texts: [],
                metadata: [],
                image_artifacts: [{ source_kind: 'twitter_url', url: 'https://example.com/image.jpg', context: {} }],
                image_urls: ['https://example.com/image.jpg'],
                sources: {}
            }),
            searchNews: async () => [],
            checkWeatherVerification: async () => null,
            checkSeismicVerification: async () => null,
            perplexitySearch: async () => ({ independent_confirmation_found: false, total_sources_found: 0, corroborating_sources: 0 }),
            analyzeMedia: async () => ({
                analyzed: true,
                summary: {
                    total_analyzed: 1,
                    relevant_images: 1,
                    high_value_evidence: 1,
                    metadata_available_count: 1,
                    metadata_warning_count: 1,
                    reverse_search_performed_count: 1,
                    reverse_search_warning_count: 1
                },
                images: [{
                    url: 'https://example.com/image.jpg',
                    metadata: { has_exif: true },
                    metadata_flags: ['editing_software_tag'],
                    metadata_notes: ['Metadata references editing software: Adobe Photoshop.'],
                    metadata_available: true,
                    metadata_warning: true,
                    reverse_image_search: {
                        performed: true,
                        status: 'searched',
                        likely_old: true,
                        confidence: 'high',
                        summary: 'This image appears in older reporting.',
                        earliest_known_use: '2024-10-12T08:00:00.000Z',
                        matches: [{
                            title: 'Archived article',
                            url: 'https://example.com/archive',
                            published_at: '2024-10-12T08:00:00.000Z',
                            reason: 'Same building facade and smoke pattern.'
                        }],
                        notes: ['Earlier reporting predates the claimed incident.']
                    }
                }]
            })
        }
    });

    assert.equal(result.mediaAnalysis.summary.metadata_available_count, 1);
    assert.equal(result.mediaAnalysis.summary.metadata_warning_count, 1);
    assert.equal(result.mediaAnalysis.summary.reverse_search_performed_count, 1);
    assert.equal(result.mediaAnalysis.summary.reverse_search_warning_count, 1);
    assert.deepEqual(result.mediaAnalysis.images[0].metadata_flags, ['editing_software_tag']);
    assert.equal(result.mediaAnalysis.images[0].reverse_image_search.likely_old, true);
});

test('calculateVerificationOutcome excludes disabled sources from denominator and score inputs', () => {
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
    assert.equal(outcome.baseScore, 10);
    assert.equal(outcome.baseScoreSource, 'semantic_score');
    assert.equal(outcome.scientificBonus, 15);
    assert.equal(outcome.perplexityBonus, 0);
    assert.equal(outcome.mediaBonus, 20);
    assert.equal(outcome.finalScore, 45);
});
