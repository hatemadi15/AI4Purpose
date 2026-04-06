const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const {
    createReverseImageSearchResult,
    reverseImageSearch,
    shouldRunReverseImageSearch
} = require('../services/reverseImageSearchService');

function withEnv(key, value, fn) {
    const original = process.env[key];

    if (value == null) {
        delete process.env[key];
    } else {
        process.env[key] = value;
    }

    return Promise.resolve()
        .then(fn)
        .finally(() => {
            if (original == null) {
                delete process.env[key];
            } else {
                process.env[key] = original;
            }
        });
}

test('shouldRunReverseImageSearch returns true when metadata is unavailable', () => {
    assert.equal(shouldRunReverseImageSearch({
        metadata_available: false,
        metadata_flags: []
    }, {
        is_relevant: true,
        evidence_type: 'damage',
        verification_value: 'high'
    }), true);
});

test('shouldRunReverseImageSearch returns true for stripped social-copy metadata', () => {
    assert.equal(shouldRunReverseImageSearch({
        metadata_available: true,
        metadata_flags: ['social_copy_metadata_missing']
    }, {
        is_relevant: true,
        evidence_type: 'smoke',
        verification_value: 'medium'
    }), true);
});

test('shouldRunReverseImageSearch returns false when metadata is present without social-copy stripping', () => {
    assert.equal(shouldRunReverseImageSearch({
        metadata_available: true,
        metadata_flags: ['metadata_present_no_conflict']
    }, {
        is_relevant: true,
        evidence_type: 'damage',
        verification_value: 'high'
    }), false);
});

test('shouldRunReverseImageSearch returns false for irrelevant images even when metadata is missing', () => {
    assert.equal(shouldRunReverseImageSearch({
        metadata_available: false,
        metadata_flags: ['social_copy_metadata_missing']
    }, {
        is_relevant: false,
        evidence_type: 'unrelated',
        verification_value: 'none'
    }), false);
});

test('reverseImageSearch returns not_needed when no URL is available', async () => {
    const result = await reverseImageSearch({
        imageArtifact: { url: null },
        eventDetails: {},
        imageAnalysis: {}
    });

    assert.deepEqual(result, createReverseImageSearchResult({
        status: 'not_needed',
        notes: ['Reverse image search skipped because no image URL was available.']
    }));
});

test('reverseImageSearch returns unavailable when PERPLEXITY_API_KEY is missing', async () => {
    await withEnv('SERPAPI_API_KEY', null, async () => withEnv('PERPLEXITY_API_KEY', null, async () => {
        const result = await reverseImageSearch({
            imageArtifact: {
                url: 'https://example.com/image.jpg',
                context: {}
            },
            eventDetails: {},
            imageAnalysis: {}
        });

        assert.equal(result.status, 'unavailable');
        assert.equal(result.performed, false);
        assert.match(result.notes[0], /SERPAPI_API_KEY|PERPLEXITY_API_KEY/i);
    }));
});

test('reverseImageSearch normalizes a successful SerpApi response', async () => {
    const originalGet = axios.get;

    await withEnv('SERPAPI_API_KEY', 'test-key', async () => {
        axios.get = async () => ({
            data: {
                about_this_image: {
                    header: {
                        title: 'Similar images are at least 10 years old.'
                    },
                    sections: [
                        { title: 'The image has circulated in older reporting.' }
                    ]
                },
                exact_matches: [{
                    title: 'Archived article',
                    link: 'https://example.com/archive',
                    snippet: 'Same building facade and smoke pattern.'
                }]
            }
        });

        const result = await reverseImageSearch({
            imageArtifact: {
                url: 'https://example.com/image.jpg',
                context: {
                    username: 'citizenreport',
                    tweet_created_at: '2026-04-05T09:20:00.000Z'
                }
            },
            eventDetails: {
                type: 'EXPLOSION',
                region: 'Beirut',
                description: 'Explosion reported near the port.'
            },
            imageAnalysis: {
                content_description: 'Smoke above a waterfront district',
                evidence_type: 'smoke'
            }
        });

        assert.equal(result.performed, true);
        assert.equal(result.status, 'searched');
        assert.equal(result.likely_old, true);
        assert.equal(result.confidence, 'high');
        assert.match(result.summary, /10 years old/i);
        assert.deepEqual(result.matches, [{
            title: 'Archived article',
            url: 'https://example.com/archive',
            published_at: null,
            reason: 'Same building facade and smoke pattern.'
        }]);
        assert.ok(result.notes.some((note) => /older reporting/i.test(note)));
    }).finally(() => {
        axios.get = originalGet;
    });
});

test('reverseImageSearch caches repeated lookups for the same image context', async () => {
    const originalGet = axios.get;
    let callCount = 0;

    await withEnv('SERPAPI_API_KEY', 'test-key', async () => {
        axios.get = async () => {
            callCount += 1;
            return {
                data: {
                    visual_matches: [{
                        title: 'Mirror article',
                        link: 'https://example.com/mirror',
                        snippet: 'Mirrored publication.'
                    }]
                }
            };
        };

        const request = {
            imageArtifact: {
                url: 'https://example.com/image.jpg',
                context: {
                    username: 'citizenreport',
                    tweet_created_at: '2026-04-05T09:20:00.000Z'
                }
            },
            eventDetails: {
                type: 'EXPLOSION',
                region: 'Beirut',
                lat: 33.9,
                lon: 35.5
            },
            imageAnalysis: {
                is_relevant: true,
                evidence_type: 'smoke',
                verification_value: 'high'
            }
        };

        const firstResult = await reverseImageSearch(request);
        const secondResult = await reverseImageSearch(request);

        assert.equal(callCount, 1);
        assert.deepEqual(secondResult, firstResult);
    }).finally(() => {
        axios.get = originalGet;
    });
});
