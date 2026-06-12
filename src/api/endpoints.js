const { getConfig } = require('../utils/config');

/**
 * Returns the relevant API endpoints based on the current configuration.
 */
function getEndpoints() {
    const config = getConfig();
    return {
        PROBLEM_SETS: config.apiUrl 
    };
}

module.exports = {
    getEndpoints
};