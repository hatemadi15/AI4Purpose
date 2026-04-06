const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MediaEvidence = sequelize.define('MediaEvidence', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    alert_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    intel_finding_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    origin: {
        type: DataTypes.STRING(32),
        allowNull: false
    },
    source_url: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    storage_path: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    mime_type: {
        type: DataTypes.STRING(128),
        allowNull: true
    },
    file_size_bytes: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    sha256: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    analysis_status: {
        type: DataTypes.STRING(24),
        allowNull: false,
        defaultValue: 'PENDING'
    },
    analysis_summary: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
    },
    analysis_raw: {
        type: DataTypes.JSON,
        allowNull: true
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'media_evidence',
    timestamps: true,
    underscored: true,
    validate: {
        hasOwner() {
            if (!this.alert_id && !this.intel_finding_id) {
                throw new Error('Media evidence must belong to an alert or an intel finding');
            }
        },
        hasBackingSource() {
            if (this.analysis_status === 'EXPIRED') {
                return;
            }

            if (!this.source_url && !this.storage_path) {
                throw new Error('Media evidence requires either a source URL or a storage path');
            }
        }
    }
});

module.exports = MediaEvidence;
