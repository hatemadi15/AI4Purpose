const test = require('node:test');
const assert = require('node:assert/strict');

const {
    calculateVerificationOutcome,
    runVerificationSources
} = require('../services/verificationService');

test('runVerificationSources only executes enabled providers and skips media when Twitter is disabled', async () => {
    const calls = [];
    const sourceSelection = {
        resolved: ['newsapi_ai', 'perplexity']
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
    assert.equal(outcome.mediaBonus, 0);
    assert.equal(outcome.finalScore, 25);
});
