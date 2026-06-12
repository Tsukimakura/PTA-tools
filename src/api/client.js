const { getConfig } = require('../utils/config');

/**
 * A centralized fetch wrapper that automatically injects PTA anti-CSRF headers and authentication cookies.
 * @param {string} url - The target API URL
 * @param {object} options - Standard fetch options (method, body, etc.)
 * @returns {Promise<Response>} The raw fetch response
 */
async function ptaFetch(url, options = {}) {
    const config = getConfig();
    
    // Ensure headers object exists
    const headers = options.headers || {};

    // Inject standard anti-bot and authentication headers
    const standardHeaders = {
        'Cookie': config.cookie || "",
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://pintia.cn',
        'Referer': 'https://pintia.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...headers // Allow custom headers to override standard ones if necessary
    };

    const finalOptions = {
        ...options,
        headers: standardHeaders
    };

    return await fetch(url, finalOptions);
}

module.exports = {
    ptaFetch
};