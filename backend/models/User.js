const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    phone_number: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    preferred_language: {
        type: DataTypes.STRING(5),
        defaultValue: 'en'
    },
    lat: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false
    },
    lon: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false
    },
    accessibility_needs: {
        type: DataTypes.JSON,
        defaultValue: []
    },
    carrier: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    country: {
        type: DataTypes.STRING(50),
        defaultValue: 'Lebanon'
    },
    push_subscription: {
        type: DataTypes.JSON,
        allowNull: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: true
    }
}, {
    tableName: 'users',
    timestamps: true,
    underscored: true
});

module.exports = User;
