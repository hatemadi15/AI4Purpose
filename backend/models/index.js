const sequelize = require('../config/database');
const User = require('./User');
const Alert = require('./Alert');
const IntelFinding = require('./IntelFinding');
const MediaEvidence = require('./MediaEvidence');

Alert.hasMany(MediaEvidence, {
    foreignKey: 'alert_id',
    as: 'media_evidence',
    onDelete: 'CASCADE'
});

IntelFinding.hasMany(MediaEvidence, {
    foreignKey: 'intel_finding_id',
    as: 'media_evidence',
    onDelete: 'CASCADE'
});

MediaEvidence.belongsTo(Alert, {
    foreignKey: 'alert_id',
    as: 'alert',
    onDelete: 'CASCADE'
});

MediaEvidence.belongsTo(IntelFinding, {
    foreignKey: 'intel_finding_id',
    as: 'intel_finding',
    onDelete: 'CASCADE'
});

module.exports = {
    sequelize,
    User,
    Alert,
    IntelFinding,
    MediaEvidence
};
