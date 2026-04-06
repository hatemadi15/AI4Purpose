const axios = require('axios');

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const SERPAPI_API_URL = 'https://serpapi.com/search.json';
const REVERSE_IMAGE_SEARCH_CACHE_TTL_MS = Math.max(
    60 * 1000,
    parseInt(process.env.REVERSE_IMAGE_SEARCH_CACHE_TTL_MS || `${24 * 60 * 60 * 1000}`, 10)
);
const reverseImageSearchCache = new Map();

function createReverseImageSearchResult(overrides = {}) {
    return {
        performed: false,
        status: 'not_needed',
        likely_old: false,
        confidence: 'low',
        summary: '',
        earliest_known_use: null,
        matches: [],
        notes: [],
        ...overrides
    };
}

function shouldRunReverseImageSearch(metadataResult, imageAnalysis = null) {
    const metadataFlags = metadataResult?.metadata_flags || [];
    const metadataMissing = !metadataResult?.metadata_available || metadataFlags.includes('social_copy_metadata_missing');

    if (!metadataMissing) {
        return false;
    }

    if (!imageAnalysis || imageAnalysis.is_relevant !== true) {
        return false;
    }

    if (imageAnalysis.evidence_type === 'unrelated' || imageAnalysis.verification_value === 'none') {
        return false;
    }

    return true;
}

function parsePerplexityJson(content) {
    let normalized = content || '{}';
    if (normalized.includes('```json')) {
        normalized = normalized.split('```json')[1].split('```')[0].trim();
    } else if (normalized.includes('```')) {
        normalized = normalized.split('```')[1].split('```')[0].trim();
    }

    return JSON.parse(normalized);
}

function normalizeMatch(match = {}) {
    return {
        title: match.title || 'Untitled match',
        url: match.url || match.link || null,
        published_at: match.published_at || null,
        reason: match.reason || match.snippet || ''
    };
}

function normalizeCachePart(value) {
    if (value == null) {
        return '';
    }

    return String(value).trim().toLowerCase();
}

function buildReverseImageSearchCacheKey({ imageArtifact, eventDetails, imageAnalysis }) {
    return [
        normalizeCachePart(imageArtifact?.url),
        normalizeCachePart(imageArtifact?.context?.tweet_created_at),
        normalizeCachePart(eventDetails?.type),
        normalizeCachePart(eventDetails?.region),
        normalizeCachePart(eventDetails?.lat),
        normalizeCachePart(eventDetails?.lon),
        normalizeCachePart(imageAnalysis?.evidence_type)
    ].join('|');
}

function getCachedReverseImageSearch(cacheKey) {
    if (!cacheKey) {
        return null;
    }

    const cached = reverseImageSearchCache.get(cacheKey);
    if (!cached) {
        return null;
    }

    if (Date.now() - cached.storedAt > REVERSE_IMAGE_SEARCH_CACHE_TTL_MS) {
        reverseImageSearchCache.delete(cacheKey);
        return null;
    }

    return cached.result;
}

function setCachedReverseImageSearch(cacheKey, result) {
    if (!cacheKey) {
        return;
    }

    reverseImageSearchCache.set(cacheKey, {
        storedAt: Date.now(),
        result
    });
}

function parseHeaderAgeSignal(headerTitle = '') {
    const normalized = String(headerTitle || '').toLowerCase();
    if (!normalized) {
        return null;
    }

    if (normalized.includes('years old') || normalized.includes('year old')) {
        return {
            likely_old: true,
            confidence: 'high'
        };
    }

    if (normalized.includes('older') || normalized.includes('old')) {
        return {
            likely_old: true,
            confidence: 'medium'
        };
    }

    return null;
}

function extractAboutThisImageSummary(aboutThisImage) {
    const headerTitle = aboutThisImage?.header?.title || '';
    const sections = Array.isArray(aboutThisImage?.sections) ? aboutThisImage.sections : [];
    const notes = [];

    if (headerTitle) {
        notes.push(headerTitle);
    }

    for (const section of sections.slice(0, 2)) {
        if (section?.title) {
            notes.push(section.title);
        }
    }

    return notes;
}

function normalizeSerpApiResult(data = {}) {
    const aboutThisImage = data.about_this_image || null;
    const exactMatches = Array.isArray(data.exact_matches) ? data.exact_matches.map(normalizeMatch) : [];
    const visualMatches = Array.isArray(data.visual_matches) ? data.visual_matches.map(normalizeMatch) : [];
    const topMatches = [...exactMatches, ...visualMatches].filter((match) => match.url).slice(0, 5);
    const headerTitle = aboutThisImage?.header?.title || '';
    const ageSignal = parseHeaderAgeSignal(headerTitle);
    const notes = extractAboutThisImageSummary(aboutThisImage);
    const summary = headerTitle
        || (topMatches.length > 0
            ? `Google Lens found ${topMatches.length} web match${topMatches.length === 1 ? '' : 'es'} for this image.`
            : 'Google Lens did not return clear older-use matches for this image.');

    return createReverseImageSearchResult({
        performed: true,
        status: 'searched',
        likely_old: Boolean(ageSignal?.likely_old),
        confidence: ageSignal?.confidence || (topMatches.length > 0 ? 'medium' : 'low'),
        summary,
        earliest_known_use: null,
        matches: topMatches,
        notes
    });
}

async function reverseImageSearchWithSerpApi({ imageArtifact }) {
    const response = await axios.get(SERPAPI_API_URL, {
        params: {
            api_key: process.env.SERPAPI_API_KEY,
            engine: 'google_lens',
            url: imageArtifact.url,
            type: 'all',
            no_cache: 'false',
            hl: 'en',
            country: 'us'
        },
        timeout: 30000
    });

    return normalizeSerpApiResult(response.data || {});
}

async function reverseImageSearch({ imageArtifact, eventDetails, imageAnalysis }) {
    if (!imageArtifact?.url) {
        return createReverseImageSearchResult({
            status: 'not_needed',
            notes: ['Reverse image search skipped because no image URL was available.']
        });
    }

    if (!process.env.SERPAPI_API_KEY && !process.env.PERPLEXITY_API_KEY) {
        return createReverseImageSearchResult({
            status: 'unavailable',
            notes: ['Reverse image search unavailable because neither SERPAPI_API_KEY nor PERPLEXITY_API_KEY is configured.']
        });
    }

    const cacheKey = buildReverseImageSearchCacheKey({ imageArtifact, eventDetails, imageAnalysis });
    const cachedResult = getCachedReverseImageSearch(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    if (process.env.SERPAPI_API_KEY) {
        try {
            const serpApiResult = await reverseImageSearchWithSerpApi({ imageArtifact, eventDetails, imageAnalysis });
            setCachedReverseImageSearch(cacheKey, serpApiResult);
            return serpApiResult;
        } catch (error) {
            if (!process.env.PERPLEXITY_API_KEY) {
                return createReverseImageSearchResult({
                    performed: false,
                    status: 'error',
                    notes: [`SerpApi reverse image search failed: ${error.message}`]
                });
            }
        }
    }

    const prompt = `You are an OSINT reverse image researcher.

Determine whether the image below appears to be OLD or reused from an earlier event.

CURRENT INCIDENT:
- Event Type: ${eventDetails?.type || 'Unknown'}
- Location: ${eventDetails?.region || 'Unknown'}
- Coordinates: ${eventDetails?.lat || 'N/A'}, ${eventDetails?.lon || 'N/A'}
- Claimed Description: ${eventDetails?.description?.slice(0, 220) || 'N/A'}

IMAGE CONTEXT:
- Image URL: ${imageArtifact.url}
- Source Username: ${imageArtifact.context?.username || 'unknown'}
- Source Timestamp: ${imageArtifact.context?.tweet_created_at || 'unknown'}
- Gemini Description: ${imageAnalysis?.content_description || 'N/A'}
- Gemini Evidence Type: ${imageAnalysis?.evidence_type || 'N/A'}

TASK:
Search the web for signs that this same image, or a clearly matching image, appeared before the current incident.
Prefer exact URL matches, archived posts, earlier news articles, or prior incident reports.
If you cannot find strong evidence, say so explicitly.

Return strict JSON:
{
  "likely_old": true/false,
  "confidence": "low|medium|high",
  "summary": "Short conclusion",
  "earliest_known_use": "ISO timestamp or null",
  "matches": [
    {
      "title": "match title",
      "url": "https://...",
      "published_at": "ISO timestamp or null",
      "reason": "why this looks like an earlier use"
    }
  ],
  "notes": ["short note 1", "short note 2"]
}`;

    try {
        const response = await axios.post(PERPLEXITY_API_URL, {
            model: 'sonar',
            messages: [
                {
                    role: 'system',
                    content: 'You are a cautious reverse-image OSINT analyst. Return only valid JSON and avoid claiming a match unless there is evidence.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        const rawContent = response.data?.choices?.[0]?.message?.content || '{}';
        const parsed = parsePerplexityJson(rawContent);

        const normalizedResult = createReverseImageSearchResult({
            performed: true,
            status: 'searched',
            likely_old: Boolean(parsed.likely_old),
            confidence: parsed.confidence || 'low',
            summary: parsed.summary || '',
            earliest_known_use: parsed.earliest_known_use || null,
            matches: Array.isArray(parsed.matches) ? parsed.matches.map(normalizeMatch) : [],
            notes: Array.isArray(parsed.notes) ? parsed.notes : []
        });

        setCachedReverseImageSearch(cacheKey, normalizedResult);

        return normalizedResult;
    } catch (error) {
        return createReverseImageSearchResult({
            performed: false,
            status: 'error',
            notes: [`Reverse image search failed: ${error.message}`]
        });
    }
}

module.exports = {
    createReverseImageSearchResult,
    reverseImageSearch,
    shouldRunReverseImageSearch
};
