const express = require('express');
const router = express.Router();
const { detectCrisis, DETECTION_RUNNERS } = require('../services/detectionService');
const { verifyEvent } = require('../services/perplexityService');
const { generateAlertOptions } = require('../services/geminiService');
const { findAffectedUsers, calculateCost } = require('../services/geoService');
const { fetchIntelTwitter, aggregateIntel, fetchMinistryAlerts } = require('../services/intelService');
const { NEWS_SCRAPER_REGISTRY, scrapeAllNews } = require('../services/newsScraperService');
const { getSourceConfig, resolveSourceSelection } = require('../config/sourceCatalog');
const Alert = require('../models/Alert');
const IntelFinding = require('../models/IntelFinding');
const {
    attachUploadedMediaToFinding,
    collectUploadedFiles,
    copyFindingMediaToAlert,
    createImageUploadMiddleware,
    createRemoteMediaEvidence,
    extractImageCandidates,
    getMediaCountsForFindings,
    linkFindingImageSources,
    listFindingMedia,
    parseMaybeJson,
    serializeMediaEvidence
} = require('../services/mediaService');

const uploadImages = createImageUploadMiddleware();

// Default region coordinates
const REGION_COORDS = {
    Lebanon: { lat: 33.8938, lon: 35.5018 },
    Turkey: { lat: 39.9334, lon: 32.8597 },
    Italy: { lat: 41.9028, lon: 12.4964 },
    Palestine: { lat: 31.9522, lon: 35.2332 }
};

const SEVERITY_PRIORITY = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    UNCONFIRMED: 1
};

function getFindingTimestamp(finding) {
    const candidate = finding?.posted_at || finding?.updated_at || finding?.created_at;
    const timestamp = candidate ? new Date(candidate).getTime() : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortFindingsForHistory(findings) {
    return [...findings].sort((left, right) => {
        const severityDelta = (SEVERITY_PRIORITY[right.severity] || 0) - (SEVERITY_PRIORITY[left.severity] || 0);
        if (severityDelta !== 0) {
            return severityDelta;
        }

        return getFindingTimestamp(right) - getFindingTimestamp(left);
    });
}

// Helper function to save findings to database
async function saveFindings(findings, region) {
    const processed = [];
    let newCount = 0;

    for (const finding of findings) {
        try {
            const findingId = finding.id || `${finding.source_type}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const defaults = {
                finding_id: findingId,
                type: finding.type || 'NEWS',
                source: finding.source,
                source_type: finding.source_type,
                source_handle: finding.source_handle,
                title: finding.title,
                text: finding.text || finding.description,
                description: finding.description,
                url: finding.url,
                language: finding.language,
                region: region,
                severity: finding.severity || 'UNCONFIRMED',
                posted_at: finding.posted_at ? new Date(finding.posted_at) : null,
                fetched_at: new Date(),
                location: finding.location,
                metrics: finding.metrics,
                raw_data: finding.raw
            };

            const [record, created] = await IntelFinding.findOrCreate({
                where: { finding_id: findingId },
                defaults
            });

            if (!created) {
                await record.update({
                    ...defaults,
                    alert_created: record.alert_created
                });
            }

            await linkFindingImageSources(record, finding);

            if (created) {
                newCount += 1;
            }

            processed.push({ findingId, record, created });
        } catch (err) {
            console.error('Failed to save finding:', err.message);
        }
    }
    return {
        newCount,
        processed
    };
}

async function findIntelFindingByRouteId(routeId) {
    if (!routeId) {
        return null;
    }

    if (/^\d+$/.test(String(routeId))) {
        const byPrimaryKey = await IntelFinding.findByPk(routeId);
        if (byPrimaryKey) {
            return byPrimaryKey;
        }
    }

    return IntelFinding.findOne({
        where: { finding_id: String(routeId) }
    });
}

async function getStoredFindings({ region, limit = 100, includeAlertCreated = false }) {
    const where = {};
    if (region) {
        where.region = region;
    }
    if (!includeAlertCreated) {
        where.alert_created = false;
    }

    const findings = await IntelFinding.findAll({
        where,
        order: [['posted_at', 'DESC'], ['updated_at', 'DESC']],
        limit
    });
    const mediaCounts = await getMediaCountsForFindings(findings.map((finding) => finding.id));

    return sortFindingsForHistory(findings.map((finding) => ({
        ...finding.toJSON(),
        media_count: mediaCounts[finding.id] || 0
    })));
}

// GET /api/detect/findings - Get saved intel findings
router.get('/detect/findings', async (req, res) => {
    try {
        const { region, limit = 100, include_alert_created } = req.query;
        const findings = await getStoredFindings({
            region,
            limit: parseInt(limit, 10),
            includeAlertCreated: include_alert_created === 'true'
        });

        res.json({
            success: true,
            count: findings.length,
            findings
        });
    } catch (error) {
        console.error('Get findings error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/detect/findings/:id/media', async (req, res) => {
    try {
        const finding = await findIntelFindingByRouteId(req.params.id);
        if (!finding) {
            return res.status(404).json({ success: false, error: 'Finding not found' });
        }

        const media = await listFindingMedia(finding.id);
        res.json({
            success: true,
            finding_id: finding.finding_id,
            media: media.map(serializeMediaEvidence)
        });
    } catch (error) {
        console.error('Get finding media error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/detect/findings/:id/media', uploadImages, async (req, res) => {
    try {
        const finding = await findIntelFindingByRouteId(req.params.id);
        if (!finding) {
            return res.status(404).json({ success: false, error: 'Finding not found' });
        }

        const files = collectUploadedFiles(req);
        if (files.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one image is required' });
        }

        const created = await attachUploadedMediaToFinding(finding.id, files);
        const media = await listFindingMedia(finding.id);

        res.json({
            success: true,
            created: created.map(serializeMediaEvidence),
            media: media.map(serializeMediaEvidence)
        });
    } catch (error) {
        console.error('Upload finding media error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/source-config', async (req, res) => {
    try {
        res.json({
            success: true,
            ...getSourceConfig()
        });
    } catch (error) {
        console.error('Get source config error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/detect - Gather intel and return ALL findings for analyst review
router.post('/detect', async (req, res) => {
    const { region = 'Lebanon', source_ids } = req.body || {};
    const io = req.app.get('io');
    const sourceSelection = resolveSourceSelection('detection', source_ids);

    try {
        io.emit('detection_status', { step: 0, message: 'Loading persisted findings history...', progress: 5 });

        io.emit('detection_status', {
            step: 1,
            message: `Gathering intelligence from ${sourceSelection.resolved.length} configured sources...`,
            progress: 10
        });

        const detectionSourceIds = sourceSelection.resolved.filter((id) => DETECTION_RUNNERS[id]);
        const scraperSourceIds = sourceSelection.resolved.filter((id) => NEWS_SCRAPER_REGISTRY[id]);
        const shouldRunIntelTwitter = sourceSelection.resolved.includes('intel_twitter');
        const shouldRunMinistry = sourceSelection.resolved.includes('ministry_info');

        const [detectionData, twitterIntel, ministryIntel, scrapedNews] = await Promise.all([
            detectCrisis(region, detectionSourceIds),
            shouldRunIntelTwitter ? fetchIntelTwitter(region) : Promise.resolve(null),
            shouldRunMinistry ? fetchMinistryAlerts(region) : Promise.resolve(null),
            scraperSourceIds.length > 0 ? scrapeAllNews(region, scraperSourceIds) : Promise.resolve(null)
        ]);

        const sourceResults = {
            ...detectionData.resultsBySourceId,
            ...(twitterIntel ? { intel_twitter: twitterIntel } : {}),
            ...(ministryIntel ? { ministry_info: ministryIntel } : {}),
            ...(scrapedNews?.resultsBySourceId || {})
        };

        io.emit('detection_status', { step: 2, message: 'Aggregating intelligence findings...', progress: 40 });

        const aggregatedIntel = aggregateIntel({
            region,
            sourceResults
        });

        // Step 3: Save findings to database
        io.emit('detection_status', { step: 3, message: 'Saving findings to database...', progress: 60 });
        const savedFindings = await saveFindings(aggregatedIntel.findings, region);
        console.log(`Saved ${savedFindings.newCount} new findings to database`);

        const processedMap = new Map(savedFindings.processed.map((entry) => [entry.findingId, entry.record]));
        const latestVisibleFindings = aggregatedIntel.findings
            .filter((finding) => {
                const findingId = finding.id || null;
                const persistedRecord = findingId ? processedMap.get(findingId) : null;
                return !persistedRecord?.alert_created;
            })
            .map((finding) => ({
                ...finding,
                media_count: extractImageCandidates(finding).length
            }));
        const visibleHistory = await getStoredFindings({
            region,
            limit: 200
        });

        // Step 4: Generate recommendations
        io.emit('detection_status', { step: 4, message: 'Generating recommendations...', progress: 80 });
        const recommendations = generateRecommendations(latestVisibleFindings, region);

        // Step 5: Complete - emit findings for dashboard display
        io.emit('detection_status', {
            step: 5,
            message: `Found ${latestVisibleFindings.length} visible intel items (${savedFindings.newCount} new persisted)`,
            progress: 100,
            complete: true
        });

        // Emit intel findings to dashboard
        io.emit('intel_findings', {
            region,
            timestamp: new Date().toISOString(),
            findings: visibleHistory,
            latest_findings: latestVisibleFindings,
            summary: aggregatedIntel.summary,
            recommendations,
            sources: aggregatedIntel.sources,
            source_selection: sourceSelection
        });

        res.json({
            success: true,
            message: `Found ${latestVisibleFindings.length} visible intelligence items`,
            region,
            findings: visibleHistory,
            latest_findings: latestVisibleFindings,
            recommendations,
            summary: aggregatedIntel.summary,
            source_selection: sourceSelection
        });

    } catch (error) {
        console.error('Detection error:', error);
        io.emit('detection_status', { step: 0, message: `Error: ${error.message}`, progress: 0, error: true });
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/detect/create-alert - Create alert from a specific finding
router.post('/detect/create-alert', async (req, res) => {
    const {
        finding: findingInput,           // The intel finding to create alert from
        region = 'Lebanon',
        severity = 'MEDIUM',
        affected_radius_km = 30
    } = req.body;
    const io = req.app.get('io');

    try {
        const finding = parseMaybeJson(findingInput, findingInput);
        if (!finding) {
            return res.status(400).json({ success: false, error: 'Finding is required' });
        }

        const persistedFinding = await findIntelFindingByRouteId(finding.finding_id || finding.id);

        // Get coordinates
        const coords = finding.location || REGION_COORDS[region] || REGION_COORDS.Lebanon;
        const lat = coords.lat || REGION_COORDS[region].lat;
        const lon = coords.lon || REGION_COORDS[region].lon;

        // Step 1: Verify with intelligence
        io.emit('detection_status', { step: 1, message: 'Verifying intelligence...', progress: 20 });

        const eventData = {
            primaryEvent: {
                type: finding.type || 'UNCONFIRMED_INCIDENT',
                lat,
                lon,
                source: finding
            },
            region
        };

        let verificationAnalysis = await verifyEvent(eventData);
        const intelConfirmedAt = new Date();

        // Step 2: Generate alert drafts
        io.emit('detection_status', { step: 2, message: 'Generating alert drafts...', progress: 50 });
        const alertDrafts = await generateAlertOptions(eventData.primaryEvent, verificationAnalysis);

        // Step 3: Find affected users
        io.emit('detection_status', { step: 3, message: 'Identifying affected population...', progress: 75 });
        const affectedUsers = await findAffectedUsers(lat, lon, affected_radius_km, severity);
        const costEstimate = calculateCost(affectedUsers.total);

        // Step 4: Create alert
        io.emit('detection_status', { step: 4, message: 'Creating alert for review...', progress: 90 });

        const alert = await Alert.create({
            event_type: finding.type || verificationAnalysis.event_type || 'UNCONFIRMED_INCIDENT',
            lat,
            lon,
            affected_radius_km,
            severity: verificationAnalysis.severity_assessment || severity,
            perplexity_analysis: verificationAnalysis,
            gemini_analysis: alertDrafts,
            alert_messages: alertDrafts.messages,
            status: 'PENDING_REVIEW',
            affected_users_count: affectedUsers.counts,
            estimated_cost_usd: costEstimate.total_cost,
            detection_data: { finding, region },
            region,
            intel_posted_at: finding.posted_at ? new Date(finding.posted_at) : null,
            intel_confirmed_at: intelConfirmedAt,
            intel_sources: [{ name: finding.source, type: finding.source_type, url: finding.url }],
            all_intel_findings: { finding }
        });

        if (persistedFinding) {
            await copyFindingMediaToAlert(persistedFinding.id, alert.id);
            await persistedFinding.update({ alert_created: true });

            const updatedVisibleHistory = await getStoredFindings({
                region,
                limit: 200
            });

            io.emit('intel_findings_updated', {
                region,
                findings: updatedVisibleHistory,
                removed_finding_id: persistedFinding.finding_id
            });
        } else {
            for (const imageUrl of extractImageCandidates(finding)) {
                await createRemoteMediaEvidence({
                    alertId: alert.id,
                    origin: 'news',
                    sourceUrl: imageUrl
                });
            }
        }

        // Emit new alert
        io.emit('detection_status', { step: 5, message: 'Alert created', progress: 100, complete: true });
        io.emit('new_alert_for_review', {
            alert: alert.toJSON(),
            affectedUsersPreview: affectedUsers.counts
        });

        res.json({
            success: true,
            alertId: alert.id,
            finding_id: persistedFinding?.finding_id || finding.finding_id || finding.id || null,
            message: 'Alert created from finding',
            summary: {
                eventType: alert.event_type,
                severity: alert.severity,
                affectedUsers: affectedUsers.counts
            }
        });

    } catch (error) {
        console.error('Create alert error:', error);
        io.emit('detection_status', { step: 0, message: `Error: ${error.message}`, progress: 0, error: true });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Generate recommendations based on findings
 */
function generateRecommendations(findings, region) {
    const recommendations = [];

    // Group findings by type
    const byType = {};
    for (const finding of findings) {
        const type = finding.type || 'UNCONFIRMED';
        if (!byType[type]) byType[type] = [];
        byType[type].push(finding);
    }

    // Generate recommendations for each type
    for (const [type, items] of Object.entries(byType)) {
        if (items.length >= 1) {
            const mostRecent = items[0]; // Already sorted by time
            const severity = items.length >= 3 ? 'HIGH' : items.length >= 2 ? 'MEDIUM' : 'LOW';

            recommendations.push({
                id: `rec-${Date.now()}-${type}`,
                event_type: type,
                severity,
                title: `${type.replace(/_/g, ' ')} reported`,
                description: mostRecent.title || mostRecent.description,
                source_count: items.length,
                sources: items.map(i => i.source),
                primary_finding: mostRecent,
                suggested_action: items.length >= 2 ? 'CREATE_ALERT' : 'MONITOR',
                region
            });
        }
    }

    // Sort by source count (most corroborated first)
    recommendations.sort((a, b) => b.source_count - a.source_count);

    return recommendations;
}

module.exports = router;
