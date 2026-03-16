const path = require('path');
const dotenv = require('dotenv');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const BACKEND_ENV_PATH = path.join(BACKEND_ROOT, '.env');

let envLoaded = false;

function loadBackendEnv() {
    if (envLoaded) {
        return;
    }

    dotenv.config({ path: BACKEND_ENV_PATH });
    envLoaded = true;
}

function resolveProjectPath(value, fallbackRelativePath) {
    const candidate = value || fallbackRelativePath;

    if (!candidate || candidate === ':memory:' || path.isAbsolute(candidate)) {
        return candidate;
    }

    const normalized = candidate.replace(/[\\/]+/g, path.sep);

    if (normalized === 'backend' || normalized.startsWith(`backend${path.sep}`)) {
        return path.resolve(REPO_ROOT, normalized);
    }

    return path.resolve(BACKEND_ROOT, normalized);
}

function resolveSqliteStoragePath(value) {
    return resolveProjectPath(value, path.join('data', 'medalert.sqlite'));
}

function resolveSqliteOptions({ databaseUrl, sqliteStorage }) {
    if (databaseUrl && databaseUrl.startsWith('sqlite:')) {
        return {
            dialect: 'sqlite',
            storage: resolveSqliteStoragePath(databaseUrl.slice('sqlite:'.length)),
            logging: false
        };
    }

    return {
        dialect: 'sqlite',
        storage: resolveSqliteStoragePath(sqliteStorage),
        logging: false
    };
}

module.exports = {
    BACKEND_ROOT,
    REPO_ROOT,
    BACKEND_ENV_PATH,
    loadBackendEnv,
    resolveProjectPath,
    resolveSqliteStoragePath,
    resolveSqliteOptions
};
