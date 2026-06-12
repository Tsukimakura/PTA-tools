const fs = require('fs');
const path = require('path');

// Resolve the path relative to the project root
const CONFIG_FILE = path.join(__dirname, '../../config.json');

let configData = null;

function getConfig() {
    // Implement Singleton pattern: read from disk only once
    if (configData) return configData;

    try {
        configData = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        return configData;
    } catch (e) {
        console.error("[ERROR] Failed to read config.json. Please ensure the file exists and is in valid JSON format.");
        process.exit(1);
    }
}

function updateCookie(newCookie) {
    const config = getConfig();
    config.cookie = newCookie;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

module.exports = {
    getConfig,
    updateCookie
};