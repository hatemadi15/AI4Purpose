const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
const { loadBackendEnv, resolveSqliteOptions } = require('./runtime');

loadBackendEnv();

const sequelizeOptions = resolveSqliteOptions({
  databaseUrl: process.env.DATABASE_URL,
  sqliteStorage: process.env.SQLITE_STORAGE
});

if (sequelizeOptions.storage && sequelizeOptions.storage !== ':memory:') {
  fs.mkdirSync(path.dirname(sequelizeOptions.storage), { recursive: true });
}

const sequelize = new Sequelize(sequelizeOptions);

module.exports = sequelize;
