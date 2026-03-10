const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Alert = sequelize.define('Alert', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    event_type: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    lat: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false
    },
    lon: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false
    },
    affected_radius_km: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    severity: {
        type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
        defaultValue: 'MEDIUM'
    },
    perplexity_analysis: {
        type: DataTypes.JSON,
        allowNull: true
    },
    gemini_analysis: {
        type: DataTypes.JSON,
        allowNull: true
    },
    alert_messages: {
        type: DataTypes.JSON,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED'),
        defaultValue: 'PENDING_REVIEW'
    },
    approved_by: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    approved_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    rejected_by: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    rejected_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    analyst_notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    selected_message_option: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    custom_message: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    affected_users_count: {
        type: DataTypes.JSON,
        defaultValue: { critical: 0, warning: 0, watch: 0 }
    },
    estimated_cost_usd: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    detection_data: {
        type: DataTypes.JSON,
        allowNull: true
    },
    region: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    // Intel timestamps
    intel_posted_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When the original intel/news was posted'
    },
    intel_confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When intelligence verified the event'
    },
    intel_sources: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of source attributions'
    },
    is_manual: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'True if created manually by analyst'
    },
    all_intel_findings: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'All aggregated intel findings for review'
    },
    // Verification Layers
    verification_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Full analysis report from Gemini and Perplexity'
    },
    verification_score: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: '0-100 confidence score based on multi-source verification'
    },
    verification_status: {
        type: DataTypes.STRING(20),
        defaultValue: 'UNVERIFIED',
        comment: 'UNVERIFIED, VERIFYING, VERIFIED, DISPUTED'
    },
    sources_checked: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    sources_confirmed: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'alerts',
    timestamps: true,
    underscored: true
});

module.exports = Alert;
