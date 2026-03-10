const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const IntelFinding = sequelize.define('IntelFinding', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    finding_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'UNCONFIRMED'
    },
    source: {
        type: DataTypes.STRING,
        allowNull: false
    },
    source_type: {
        type: DataTypes.STRING,
        allowNull: false
    },
    source_handle: {
        type: DataTypes.STRING
    },
    title: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    text: {
        type: DataTypes.TEXT
    },
    description: {
        type: DataTypes.TEXT
    },
    url: {
        type: DataTypes.STRING
    },
    language: {
        type: DataTypes.STRING
    },
    region: {
        type: DataTypes.STRING
    },
    severity: {
        type: DataTypes.STRING,
        defaultValue: 'UNCONFIRMED'
    },
    posted_at: {
        type: DataTypes.DATE
    },
    fetched_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    location: {
        type: DataTypes.JSON
    },
    metrics: {
        type: DataTypes.JSON
    },
    raw_data: {
        type: DataTypes.JSON
    },
    alert_created: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    tableName: 'intel_findings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = IntelFinding;
