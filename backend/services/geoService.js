// Severity multipliers for radius calculation
const SEVERITY_MULTIPLIERS = {
    LOW: 1.0,
    MEDIUM: 1.5,
    HIGH: 2.0,
    CRITICAL: 2.5
};

/**
 * Find users within a given radius of the event epicenter
 * SQLite: compute distances in JS using Haversine.
 */
async function findAffectedUsers(lat, lon, radiusKm, severity = 'MEDIUM') {
    const multiplier = SEVERITY_MULTIPLIERS[severity] || 1.5;
    const adjustedRadius = radiusKm * multiplier;

    try {
        const User = require('../models/User');
        const { Op } = require('sequelize');

        const allUsers = await User.findAll({
            where: {
                push_subscription: { [Op.ne]: null }
            }
        });

        const usersWithDistance = allUsers
            .map(user => {
                const distance = haversineDistance(lat, lon, parseFloat(user.lat), parseFloat(user.lon));
                return { ...user.toJSON(), distance_km: distance };
            })
            .filter(user => user.distance_km <= adjustedRadius)
            .sort((a, b) => a.distance_km - b.distance_km);

        const zones = {
            critical: [],
            warning: [],
            watch: []
        };

        const criticalThreshold = adjustedRadius / 3;
        const warningThreshold = (adjustedRadius / 3) * 2;

        usersWithDistance.forEach(user => {
            if (user.distance_km <= criticalThreshold) {
                zones.critical.push(user);
            } else if (user.distance_km <= warningThreshold) {
                zones.warning.push(user);
            } else {
                zones.watch.push(user);
            }
        });

        return {
            total: usersWithDistance.length,
            zones,
            counts: {
                critical: zones.critical.length,
                warning: zones.warning.length,
                watch: zones.watch.length
            },
            radiusUsed: adjustedRadius,
            allUsers: usersWithDistance,
            fallback: true
        };

    } catch (error) {
        console.error('GeoService error:', error.message);
        return {
            total: 0,
            zones: { critical: [], warning: [], watch: [] },
            counts: { critical: 0, warning: 0, watch: 0 },
            radiusUsed: adjustedRadius,
            allUsers: [],
            error: error.message
        };
    }
}

/**
 * Haversine formula for calculating distance between two points
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Calculate cost estimate (for demo: $0 with carrier partnership)
 */
function calculateCost(userCount) {
    // With carrier partnership, cost is $0
    return {
        total_users: userCount,
        cost_per_message: 0,
        total_cost: 0,
        currency: 'USD',
        note: 'Carrier partnership - no per-message cost'
    };
}

module.exports = { findAffectedUsers, haversineDistance, calculateCost };
