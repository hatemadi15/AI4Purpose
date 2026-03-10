const sequelize = require('../config/database');
const User = require('./User');
const Alert = require('./Alert');
const IntelFinding = require('./IntelFinding');

module.exports = {
    sequelize,
    User,
    Alert,
    IntelFinding
};
