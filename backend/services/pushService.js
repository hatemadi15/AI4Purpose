const webpush = require('web-push');
require('dotenv').config();

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const pushConfigured = Boolean(vapidPublicKey && vapidPrivateKey);

if (pushConfigured) {
    webpush.setVapidDetails(
        process.env.VAPID_EMAIL || 'mailto:admin@medalert.demo',
        vapidPublicKey,
        vapidPrivateKey
    );
} else {
    console.warn('Push notifications disabled: VAPID keys are not configured');
}

/**
 * Send push notification to a single user
 */
async function sendPushToUser(user, alertData) {
    if (!pushConfigured) {
        return { success: false, userId: user.id, reason: 'Push notifications not configured' };
    }

    if (!user.push_subscription) {
        return { success: false, userId: user.id, reason: 'No subscription' };
    }

    try {
        const subscription = typeof user.push_subscription === 'string'
            ? JSON.parse(user.push_subscription)
            : user.push_subscription;

        // Get message in user's preferred language
        const lang = user.preferred_language || 'en';
        const message = alertData.message[lang] || alertData.message.en;

        const payload = JSON.stringify({
            title: `⚠️ MedAlert: ${alertData.eventType}`,
            body: message,
            icon: '/icon-192.png',
            badge: '/badge-72.png',
            vibrate: [200, 100, 200, 100, 200],
            tag: `alert-${alertData.alertId}`,
            requireInteraction: true,
            data: {
                alertId: alertData.alertId,
                eventType: alertData.eventType,
                severity: alertData.severity,
                zone: user.zone || 'unknown',
                distance: user.distance_km,
                url: `/alert/${alertData.alertId}`
            },
            actions: [
                { action: 'view', title: 'View Details' },
                { action: 'safe', title: "I'm Safe" }
            ]
        });

        await webpush.sendNotification(subscription, payload);

        return {
            success: true,
            userId: user.id,
            language: lang
        };

    } catch (error) {
        console.error(`Push failed for user ${user.id}:`, error.message);

        // Handle expired subscriptions
        if (error.statusCode === 410) {
            // Subscription expired - should be cleaned up
            return {
                success: false,
                userId: user.id,
                reason: 'Subscription expired',
                shouldRemove: true
            };
        }

        return {
            success: false,
            userId: user.id,
            reason: error.message
        };
    }
}

/**
 * Send push notifications to all affected users
 */
async function sendAlertNotifications(affectedUsers, alertData) {
    const results = {
        sent: 0,
        failed: 0,
        expired: 0,
        details: []
    };

    // Process all zones
    const allUsers = [
        ...affectedUsers.zones.critical.map(u => ({ ...u, zone: 'critical' })),
        ...affectedUsers.zones.warning.map(u => ({ ...u, zone: 'warning' })),
        ...affectedUsers.zones.watch.map(u => ({ ...u, zone: 'watch' }))
    ];

    // Send notifications in batches to avoid overwhelming the server
    const batchSize = 10;
    for (let i = 0; i < allUsers.length; i += batchSize) {
        const batch = allUsers.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
            batch.map(user => sendPushToUser(user, alertData))
        );

        batchResults.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
                if (result.value.success) {
                    results.sent++;
                } else {
                    results.failed++;
                    if (result.value.shouldRemove) {
                        results.expired++;
                    }
                }
                results.details.push(result.value);
            } else {
                results.failed++;
                results.details.push({
                    success: false,
                    userId: batch[idx].id,
                    reason: result.reason?.message
                });
            }
        });
    }

    return results;
}

/**
 * Get VAPID public key for client subscription
 */
function getVapidPublicKey() {
    return vapidPublicKey || null;
}

module.exports = {
    sendPushToUser,
    sendAlertNotifications,
    getVapidPublicKey
};
