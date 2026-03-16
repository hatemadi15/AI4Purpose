const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const { findAffectedUsers } = require('../services/geoService');
const { sendAlertNotifications } = require('../services/pushService');
const { translateCustomMessage } = require('../services/geminiService');
const { performDeepVerification } = require('../services/verificationService');

function emitUserAlerts(io, affectedUsers, alert, selectedMessage) {
    if (!io || !affectedUsers?.zones) return;

    const allUsers = [
        ...affectedUsers.zones.critical.map(u => ({ ...u, zone: 'critical' })),
        ...affectedUsers.zones.warning.map(u => ({ ...u, zone: 'warning' })),
        ...affectedUsers.zones.watch.map(u => ({ ...u, zone: 'watch' }))
    ];

    const alertPayload = alert.toJSON();

    allUsers.forEach(user => {
        const lang = user.preferred_language || 'en';
        let message = selectedMessage;
        if (selectedMessage && typeof selectedMessage === 'object') {
            message = selectedMessage[lang] || selectedMessage.en || selectedMessage.ar;
        }

        io.to(`user_${user.id}`).emit('user_alert', {
            alert: alertPayload,
            message: message || `Alert: ${alertPayload.event_type}`,
            zone: user.zone,
            distance_km: user.distance_km,
            userId: user.id
        });
    });
}

// GET /api/alerts - Get all alerts (optionally filter by status)
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;
        const where = status ? { status } : {};

        const alerts = await Alert.findAll({
            where,
            order: [['created_at', 'DESC']]
        });

        res.json({ success: true, alerts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/alerts/:id - Get single alert
router.get('/:id', async (req, res) => {
    try {
        const alert = await Alert.findByPk(req.params.id);
        if (!alert) {
            return res.status(404).json({ success: false, error: 'Alert not found' });
        }
        res.json({ success: true, alert });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/alerts/:id/verify - Trigger deep multi-source verification
router.post('/:id/verify', async (req, res) => {
    const io = req.app.get('io');
    const { source_ids } = req.body || {};
    try {
        const result = await performDeepVerification(req.params.id, io, source_ids);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/alerts/:id/approve - Approve alert and send notifications
router.post('/:id/approve', async (req, res) => {
    const { message_option, custom_message, analyst_notes, analyst_name = 'Analyst' } = req.body;
    const io = req.app.get('io');

    try {
        const alert = await Alert.findByPk(req.params.id);
        if (!alert) {
            return res.status(404).json({ success: false, error: 'Alert not found' });
        }

        if (alert.status !== 'PENDING_REVIEW') {
            return res.status(400).json({ success: false, error: 'Alert already processed' });
        }

        io.emit('approval_status', { alertId: alert.id, status: 'processing', message: 'Processing approval...' });

        // Get the selected message or translate custom message
        let selectedMessage;
        if (custom_message) {
            io.emit('approval_status', { alertId: alert.id, status: 'translating', message: 'Translating custom message...' });
            selectedMessage = await translateCustomMessage(custom_message);
        } else {
            const option = message_option || 'concise';
            selectedMessage = alert.alert_messages?.[option] || alert.alert_messages?.concise;
        }

        // Find affected users
        io.emit('approval_status', { alertId: alert.id, status: 'finding_users', message: 'Identifying affected users...' });
        const affectedUsers = await findAffectedUsers(
            parseFloat(alert.lat),
            parseFloat(alert.lon),
            parseFloat(alert.affected_radius_km),
            alert.severity
        );

        // Send push notifications
        io.emit('approval_status', { alertId: alert.id, status: 'sending', message: `Sending to ${affectedUsers.total} users...` });
        const pushResults = await sendAlertNotifications(affectedUsers, {
            alertId: alert.id,
            eventType: alert.event_type,
            severity: alert.severity,
            message: selectedMessage
        });

        // Update alert status
        await alert.update({
            status: 'APPROVED',
            approved_by: analyst_name,
            approved_at: new Date(),
            analyst_notes,
            selected_message_option: custom_message ? 'custom' : message_option,
            custom_message: custom_message || null
        });

        emitUserAlerts(io, affectedUsers, alert, selectedMessage);

        io.emit('approval_status', { alertId: alert.id, status: 'complete', message: 'Alert approved and sent!' });
        io.emit('alert_approved', {
            alert: alert.toJSON(),
            pushResults
        });

        res.json({
            success: true,
            message: 'Alert approved and notifications sent',
            pushResults: {
                sent: pushResults.sent,
                failed: pushResults.failed,
                total: affectedUsers.total
            }
        });

    } catch (error) {
        console.error('Approve error:', error);
        io.emit('approval_status', { alertId: req.params.id, status: 'error', message: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/alerts/:id/reject - Reject alert
router.post('/:id/reject', async (req, res) => {
    const { analyst_notes, analyst_name = 'Analyst' } = req.body;
    const io = req.app.get('io');

    try {
        const alert = await Alert.findByPk(req.params.id);
        if (!alert) {
            return res.status(404).json({ success: false, error: 'Alert not found' });
        }

        await alert.update({
            status: 'REJECTED',
            rejected_by: analyst_name,
            rejected_at: new Date(),
            analyst_notes
        });

        io.emit('alert_rejected', { alertId: alert.id });

        res.json({ success: true, message: 'Alert rejected' });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/alerts/manual - Create manual alert (analyst-initiated)
router.post('/manual', async (req, res) => {
    const {
        event_type,
        lat,
        lon,
        affected_radius_km = 30,
        severity = 'MEDIUM',
        message,
        analyst_name = 'Analyst',
        analyst_notes,
        intel_sources = []
    } = req.body;
    const io = req.app.get('io');

    try {
        // Validate required fields
        if (!event_type || !lat || !lon || !message) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: event_type, lat, lon, message'
            });
        }

        const { translateCustomMessage, generateAlertOptions } = require('../services/geminiService');
        const { findAffectedUsers, calculateCost } = require('../services/geoService');

        // Generate multi-language translations
        io.emit('manual_alert_status', { status: 'translating', message: 'Generating translations...' });
        const translatedMessages = await translateCustomMessage(message);

        // Find affected users
        io.emit('manual_alert_status', { status: 'finding_users', message: 'Identifying affected population...' });
        const affectedUsers = await findAffectedUsers(parseFloat(lat), parseFloat(lon), parseFloat(affected_radius_km), severity);
        const costEstimate = calculateCost(affectedUsers.total);

        // Create the manual alert
        const alert = await Alert.create({
            event_type,
            lat: parseFloat(lat),
            lon: parseFloat(lon),
            affected_radius_km: parseFloat(affected_radius_km),
            severity,
            alert_messages: {
                concise: translatedMessages,
                detailed: translatedMessages,
                technical: translatedMessages
            },
            status: 'PENDING_REVIEW',
            affected_users_count: affectedUsers.counts,
            estimated_cost_usd: costEstimate.total_cost,
            region: 'Manual',
            is_manual: true,
            intel_posted_at: new Date(),
            intel_confirmed_at: new Date(),
            intel_sources: intel_sources.map(s => ({ name: s, timestamp: new Date().toISOString() })),
            analyst_notes: analyst_notes || `Manual alert created by ${analyst_name}`,
            perplexity_analysis: {
                verified: true,
                confidence_level: 100,
                event_type,
                severity_assessment: severity,
                key_facts: [`Manual alert created by ${analyst_name}`],
                recommended_action: 'ALERT',
                sources: ['Analyst Input'],
                reasoning: 'Manually created by government analyst'
            }
        });

        // Emit to dashboard
        io.emit('manual_alert_status', { status: 'complete', message: 'Manual alert created' });
        io.emit('new_alert_for_review', {
            alert: alert.toJSON(),
            affectedUsersPreview: affectedUsers.counts,
            isManual: true
        });

        res.json({
            success: true,
            alertId: alert.id,
            message: 'Manual alert created and sent to dashboard',
            affectedUsers: affectedUsers.counts
        });

    } catch (error) {
        console.error('Manual alert error:', error);
        io.emit('manual_alert_status', { status: 'error', message: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
