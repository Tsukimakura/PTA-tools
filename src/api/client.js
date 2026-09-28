const { getConfig } = require('../utils/config');

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_GET_RETRIES = 2;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function createApiError(response) {
    const error = new Error(`PTA API request failed: HTTP ${response.status} ${response.statusText}`.trim());
    error.status = response.status;

    try {
        const payload = await response.clone().json();
        if (payload && payload.error) {
            error.code = payload.error.code;
            error.apiMessage = payload.error.message;
            error.message = `PTA API request failed: ${payload.error.code || payload.error.message} (HTTP ${response.status})`;
        }
    } catch (_) {
        // Some PTA error responses are not JSON. Keep the HTTP-level error above.
    }

    return error;
}

function createPayloadError(payload, context) {
    const apiError = payload && payload.error;
    const code = apiError && apiError.code;
    const message = apiError && apiError.message;
    const error = new Error(
        `${context} returned an API error: ${code || message || 'Unknown error'}`
    );

    error.code = code;
    error.apiMessage = message;
    return error;
}

/**
 * Parse a successful PTA response without allowing an API-level error payload
 * to be mistaken for valid, empty data.
 * @param {Response} response
 * @param {string} context
 * @returns {Promise<object>}
 */
async function readPtaJson(response, context = 'PTA API') {
    let payload;

    try {
        payload = await response.json();
    } catch (error) {
        throw new Error(`${context} returned invalid JSON: ${error.message}`);
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(`${context} returned an invalid response payload.`);
    }

    if (payload.error) throw createPayloadError(payload, context);
    return payload;
}

function requireObjectField(payload, field, context = 'PTA API') {
    const value = payload && payload[field];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${context} returned no valid ${field} object.`);
    }
    return value;
}

function requireArrayField(payload, field, context = 'PTA API') {
    const value = payload && payload[field];
    if (!Array.isArray(value)) {
        throw new Error(`${context} returned no ${field} array.`);
    }
    return value;
}

/**
 * A centralized fetch wrapper that automatically injects PTA anti-CSRF headers and authentication cookies.
 * @param {string} url - The target API URL
 * @param {object} options - Standard fetch options (method, body, etc.)
 * @returns {Promise<Response>} The raw fetch response
 */
async function ptaFetch(url, options = {}) {
    const config = getConfig();
    const {
        timeoutMs = DEFAULT_TIMEOUT_MS,
        retries,
        signal: callerSignal,
        ...fetchOptions
    } = options;
    const method = (fetchOptions.method || 'GET').toUpperCase();
    const maxRetries = retries === undefined
        ? (method === 'GET' ? DEFAULT_GET_RETRIES : 0)
        : retries;
    
    // Ensure headers object exists
    const headers = fetchOptions.headers || {};

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
        ...fetchOptions,
        headers: standardHeaders
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);
        const abortFromCaller = () => controller.abort(callerSignal.reason);

        if (callerSignal) {
            if (callerSignal.aborted) abortFromCaller();
            else callerSignal.addEventListener('abort', abortFromCaller, { once: true });
        }

        try {
            const response = await fetch(url, { ...finalOptions, signal: controller.signal });
            const retryableStatus = response.status === 429 || response.status >= 500;

            if (response.ok) return response;
            if (!retryableStatus || attempt === maxRetries) {
                const error = await createApiError(response);
                error.retryable = retryableStatus;
                throw error;
            }
        } catch (error) {
            const callerCanceled = callerSignal && callerSignal.aborted;
            if (callerCanceled || error.retryable === false || attempt === maxRetries) throw error;
        } finally {
            clearTimeout(timeout);
            if (callerSignal) callerSignal.removeEventListener('abort', abortFromCaller);
        }

        await wait(300 * (attempt + 1));
    }

    throw new Error('PTA API request failed after retries');
}

module.exports = {
    ptaFetch,
    createApiError,
    readPtaJson,
    requireObjectField,
    requireArrayField
};
