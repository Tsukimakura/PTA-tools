const { getCookieViaBrowser } = require('../auth/authManager');
const { getConfig, updateCookie } = require('../utils/config');
const { fetchAllProblemSets } = require('./downloader');

async function loadAuthenticatedProblemSets(dependencies = {}) {
    const config = dependencies.config || getConfig();
    const authenticate = dependencies.authenticate || getCookieViaBrowser;
    const fetchProblemSets = dependencies.fetchProblemSets || fetchAllProblemSets;
    const saveCookie = dependencies.updateCookie || updateCookie;

    for (let attempt = 0; attempt < 2; attempt++) {
        if (!config.cookie) {
            console.log('[INFO] No valid cookie found. Initiating login sequence...');
            const success = await authenticate();
            if (!success) throw new Error('Authentication failed.');
        }

        const problemSets = await fetchProblemSets();
        if (problemSets !== null) return problemSets;

        console.warn('[WARN] Credentials expired. Re-authenticating...');
        saveCookie('');
    }

    throw new Error('Authentication failed repeatedly.');
}

module.exports = {
    loadAuthenticatedProblemSets
};
