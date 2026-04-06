const test = require('node:test');
const assert = require('node:assert/strict');

const {
    runDetectionSources,
    summarizeDetectionResults
} = require('../services/detectionService');
const { aggregateIntel } = require('../services/intelService');

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

test('runDetectionSources only executes the selected providers', async () => {
    const calls = [];
    const receivedOptions = [];
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
            execute: async (_region, sourceOptions) => {
                calls.push('twitter_x');
                receivedOptions.push(sourceOptions);
                return { source: 'Twitter/X', success: true, data: [], count: 0 };
            }
        }
    };

    const results = await runDetectionSources(
        'Lebanon',
        ['usgs', 'newsapi_ai', 'twitter_x'],
        runnerMap,
        {
            twitter_x: {
                twitter_accounts: {
                    resolved: ['lbci_news']
                }
            }
        }
    );

    assert.deepEqual(calls.sort(), ['newsapi_ai', 'twitter_x', 'usgs']);
    assert.deepEqual(Object.keys(results).sort(), ['newsapi_ai', 'twitter_x', 'usgs']);
    assert.deepEqual(receivedOptions, [{ twitter_accounts: { resolved: ['lbci_news'] } }]);
});

test('summarizeDetectionResults works with partial source maps', () => {
    const now = Date.now();
    const summary = summarizeDetectionResults('Lebanon', {
        usgs: {
            success: true,
            data: [createEarthquakeFeature({ time: now })],
            count: 1
        }
    });

    assert.equal(summary.summary.earthquakeCount, 1);
    assert.equal(summary.summary.weatherAlertCount, 0);
    assert.equal(summary.summary.hasEvent, true);
    assert.equal(summary.primaryEvent.type, 'EARTHQUAKE');
});

test('aggregateIntel tolerates missing source families and still emits findings', () => {
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
