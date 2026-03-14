const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const storagePath = process.env.SQLITE_STORAGE || path.join(__dirname, '..', 'data', 'medalert.sqlite');
fs.mkdirSync(path.dirname(storagePath), { recursive: true });

const useSqliteUrl = process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('sqlite:');

const sequelize = useSqliteUrl
  ? new Sequelize(process.env.DATABASE_URL, { dialect: 'sqlite', logging: false })
  : new Sequelize({ dialect: 'sqlite', storage: storagePath, logging: false });

module.exports = sequelize;
