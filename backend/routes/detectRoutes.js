const express = require('express');
const router = express.Router();
const { detectCrisis } = require('../services/detectionService');
const { verifyEvent } = require('../services/perplexityService');
const { generateAlertOptions } = require('../services/geminiService');
const { findAffectedUsers, calculateCost } = require('../services/geoService');
const { fetchIntelTwitter, aggregateIntel, isRecentIntel, fetchMinistryAlerts } = require('../services/intelService');
const { scrapeAllNews } = require('../services/newsScraperService');
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

// POST /api/detect - Gather intel and return ALL findings for analyst review
router.post('/detect', async (req, res) => {
    const { region = 'Lebanon' } = req.body;
    const io = req.app.get('io');

    try {
        // Step 0: Clear previous findings not to confuse the analyst with old data
        // "Refresh" the run as requested
        await IntelFinding.destroy({ where: { region } });
        io.emit('detection_status', { step: 0, message: 'Clearing previous data for fresh run...', progress: 5 });

        // Step 1: Gather intel from all sources
        io.emit('detection_status', { step: 1, message: 'Gathering intelligence from all sources (APIs + news scrapers)...', progress: 10 });

        // Fetch from detection APIs, intel Twitter, Ministry Demo API, AND news scrapers in parallel
        const [detectionData, twitterIntel, ministryIntel, scrapedNews] = await Promise.all([
            detectCrisis(region),
            fetchIntelTwitter(region),
            fetchMinistryAlerts(region),
            scrapeAllNews(region)
        ]);

        console.log(`[Detect] Scraped news: ${scrapedNews.count} articles from ${scrapedNews.sources?.filter(s => s.success).length || 0} sources`);

        // Merge Ministry data into detectionData (treating it as another sensor/source)
        if (ministryIntel.success && ministryIntel.data.length > 0) {
            // Add ministry alerts to the main data stream
            // detectCrisis returns { findings: [...] } or array of results? 
            // Actually detectCrisis returns an aggregated object of API results.
            // aggregateIntel takes (detectionResults, twitterResults).
            // We should push ministry findings into detectionData's flow or handle separately.

            // Hack: Append ministry findings to a "custom" source in detectionData if it's an array, 
            // or pass it explicitly to aggregateIntel if that function supports it. 
            // Let's check aggregateIntel signature in next step or just append here if detectionData is extensible.

            // Better: Pass it to aggregateIntel if we modify aggregateIntel, OR
            // just append valid "Ministry" findings to the list that aggregateIntel generates.
            // But aggregateIntel merges them. Let's see how aggregateIntel works. 
            // Currently aggregateIntel(detectionData, twitterIntel).
            // I will update the call to: aggregateIntel(detectionData, twitterIntel, ministryIntel)
            // But first I need to update the import above.
        }

        // Step 2: Aggregate all intel findings
        io.emit('detection_status', { step: 2, message: 'Aggregating intelligence findings...', progress: 40 });

        // Pass ministry data to aggregator
        const aggregatedIntel = aggregateIntel(detectionData, twitterIntel, ministryIntel, scrapedNews);

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
            sources: aggregatedIntel.sources
        });

        res.json({
            success: true,
            message: `Found ${aggregatedIntel.total_findings} intelligence items`,
            region,
            findings: aggregatedIntel.findings,
            recommendations,
            summary: aggregatedIntel.summary
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
