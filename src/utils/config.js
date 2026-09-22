const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync } = require('./files');

// Resolve the path relative to the project root
const CONFIG_FILE = path.join(__dirname, '../../config.json');

let configData = null;
let fileConfigData = null;

function applyEnvironmentOverrides(config) {
    const merged = { ...config };
    const stringOverrides = {
        username: process.env.PTA_USERNAME,
        password: process.env.PTA_PASSWORD,
        cookie: process.env.PTA_COOKIE,
        dingdingWebhook: process.env.DINGTALK_WEBHOOK
    };

    for (const [key, value] of Object.entries(stringOverrides)) {
        if (value !== undefined) merged[key] = value;
    }

    if (process.env.PTA_REFRESH_INTERVAL !== undefined) {
        const interval = Number(process.env.PTA_REFRESH_INTERVAL);
        if (Number.isFinite(interval)) merged.refreshInterval = interval;
    }

    return merged;
}

function secureConfigPermissions() {
    if (process.platform === 'win32' || !fs.existsSync(CONFIG_FILE)) return;

    try {
        const permissions = fs.statSync(CONFIG_FILE).mode & 0o777;
        if ((permissions & 0o077) !== 0) fs.chmodSync(CONFIG_FILE, 0o600);
    } catch (error) {
        console.warn(`[WARN] Could not restrict config.json permissions: ${error.message}`);
    }
}

function getConfig() {
    // Implement Singleton pattern: read from disk only once
    if (configData) return configData;

    try {
        fileConfigData = fs.existsSync(CONFIG_FILE)
            ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
            : {};
        secureConfigPermissions();
        configData = applyEnvironmentOverrides(fileConfigData);
        return configData;
    } catch (e) {
        console.error("[ERROR] Failed to parse config.json. Please ensure it contains valid JSON.");
        process.exit(1);
    }
}

function updateCookie(newCookie) {
    const config = getConfig();
    config.cookie = newCookie;
    fileConfigData = { ...fileConfigData, cookie: newCookie };
    writeFileAtomicSync(CONFIG_FILE, JSON.stringify(fileConfigData, null, 2) + '\n', { mode: 0o600 });
}

module.exports = {
    getConfig,
    updateCookie
};
