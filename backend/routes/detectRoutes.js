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

// Default region coordinates
const REGION_COORDS = {
    Lebanon: { lat: 33.8938, lon: 35.5018 },
    Turkey: { lat: 39.9334, lon: 32.8597 },
    Italy: { lat: 41.9028, lon: 12.4964 },
    Palestine: { lat: 31.9522, lon: 35.2332 }
};

// Helper function to save findings to database
async function saveFindings(findings, region) {
    const saved = [];
    for (const finding of findings) {
        try {
            const findingId = finding.id || `${finding.source_type}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

            const [record, created] = await IntelFinding.findOrCreate({
                where: { finding_id: findingId },
                defaults: {
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
                }
            });

            if (created) {
                saved.push(record);
            }
        } catch (err) {
            console.error('Failed to save finding:', err.message);
        }
    }
    return saved;
}

// GET /api/detect/findings - Get saved intel findings
router.get('/detect/findings', async (req, res) => {
    try {
        const { region, limit = 100 } = req.query;

        const where = {};
        if (region) where.region = region;

        const findings = await IntelFinding.findAll({
            where,
            order: [['posted_at', 'DESC']],
            limit: parseInt(limit)
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
        await IntelFinding.destroy({ where: { region } });
        io.emit('detection_status', { step: 0, message: 'Clearing previous data for fresh run...', progress: 5 });

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
        console.log(`Saved ${savedFindings.length} new findings to database`);

        // Step 4: Generate recommendations
        io.emit('detection_status', { step: 4, message: 'Generating recommendations...', progress: 80 });
        const recommendations = generateRecommendations(aggregatedIntel.findings, region);

        // Step 5: Complete - emit findings for dashboard display
        io.emit('detection_status', {
            step: 5,
            message: `Found ${aggregatedIntel.total_findings} intel items (${savedFindings.length} new)`,
            progress: 100,
            complete: true
        });

        // Emit intel findings to dashboard
        io.emit('intel_findings', {
            region,
            timestamp: new Date().toISOString(),
            findings: aggregatedIntel.findings,
            summary: aggregatedIntel.summary,
            recommendations,
            sources: aggregatedIntel.sources,
            source_selection: sourceSelection
        });

        res.json({
            success: true,
            message: `Found ${aggregatedIntel.total_findings} intelligence items`,
            region,
            findings: aggregatedIntel.findings,
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
        finding,           // The intel finding to create alert from
        region = 'Lebanon',
        severity = 'MEDIUM',
        affected_radius_km = 30
    } = req.body;
    const io = req.app.get('io');

    try {
        if (!finding) {
            return res.status(400).json({ success: false, error: 'Finding is required' });
        }

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

        // Emit new alert
        io.emit('detection_status', { step: 5, message: 'Alert created', progress: 100, complete: true });
        io.emit('new_alert_for_review', {
            alert: alert.toJSON(),
            affectedUsersPreview: affectedUsers.counts
        });

        res.json({
            success: true,
            alertId: alert.id,
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
