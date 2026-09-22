#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Import custom modules
const { getConfig, updateCookie } = require('../src/utils/config');
const { calculateRealStatus, getTimestamp } = require('../src/utils/helpers');
const { sendDingTalkNotification } = require('../src/utils/notifier');
const { getCookieViaBrowser } = require('../src/auth/authManager');
const { ptaFetch } = require('../src/api/client');
const { getEndpoints } = require('../src/api/endpoints');
const { writeFileAtomicSync } = require('../src/utils/files');

// Resolve path relative to the bin directory
const STATUS_FILE = path.join(__dirname, '../pta_status.json');
let isChecking = false;

async function fetchMonitoredProblemSets(endpoints, fetcher = ptaFetch) {
    const limit = 50;
    let page = 0;
    let total = Infinity;
    const problemSets = [];

    while (problemSets.length < total) {
        const response = await fetcher(endpoints.MONITORED_PROBLEM_SETS(page, limit));
        const data = await response.json();

        if (data.error) return data;

        const pageSets = data.problemSets || (data.data && data.data.problemSets) || [];
        const reportedTotal = data.total !== undefined
            ? data.total
            : (data.data && data.data.total);

        if (reportedTotal !== undefined) total = reportedTotal;
        problemSets.push(...pageSets);

        if (pageSets.length < limit) break;
        page++;
    }

    return { problemSets };
}

/**
 * Format a single problem set into a Markdown structured block
 * @param {object} set - The raw problem set object from API
 * @param {string} [overrideStatus] - Optional status to override the calculated one
 * @returns {string} Formatted Markdown text
 */
function formatSetInfo(set, overrideStatus) {
    const realStatus = overrideStatus || calculateRealStatus(set.startAt, set.endAt);
    const startDate = new Date(set.startAt).toLocaleString('zh-CN', { hour12: false });
    const endDate = new Date(set.endAt).toLocaleString('zh-CN', { hour12: false });
    
    return `**${set.name}**\n- Status: ${realStatus}\n- Start: ${startDate}\n- **End: \`${endDate}\`**`;
}

async function checkPTAStatus() {
    if (isChecking) {
        console.log(`[WARN] [${getTimestamp()}] Task backlogged. Skipping current trigger...`);
        return;
    }
    isChecking = true;

    console.log(`\n[INFO] [${getTimestamp()}] Checking PTA problem set status...`);

    try {
        const config = getConfig();
        const endpoints = getEndpoints();
        const MAX_RETRIES = 2;
        let currentProblemSets = [];

        // Retry loop for auto-reauthentication
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            if (!config.cookie) {
                const success = await getCookieViaBrowser();
                if (!success) {
                    isChecking = false;
                    return; 
                }
            }

            const res = await fetchMonitoredProblemSets(endpoints);

            if (res.error && res.error.code === 'USER_NOT_FOUND') {
                console.warn(`[WARN] Credentials expired (Attempt ${attempt}/${MAX_RETRIES}).`);
                updateCookie("");

                if (attempt === MAX_RETRIES) {
                    console.error("[ERROR] Authentication failed repeatedly. Aborting this cycle.");
                    isChecking = false;
                    return;
                }

                console.log("[INFO] Launching browser immediately to re-authenticate...");
                continue; 
            }

            if (res.error) {
                throw new Error(`API Error: ${res.error.message || res.error.code || 'Unknown error'}`);
            }

            currentProblemSets = res.problemSets || (res.data && res.data.problemSets) || [];
            break; 
        }

        if (currentProblemSets.length === 0) {
            console.log("[INFO] No problem sets currently available.");
            isChecking = false;
            return;
        }

        let lastStatus = {};
        
        // First Run: Create file and send Markdown summary
        if (!fs.existsSync(STATUS_FILE)) {
            const title = "PTA Monitor: Data Initialization";
            let initialMessage = "### PTA Monitor Data Initialization\nInitial data cache created successfully.\n\n---\n\n#### Currently ONGOING\n\n";

            let ongoingBlocks = [];

            currentProblemSets.forEach(set => {
                const realStatus = calculateRealStatus(set.startAt, set.endAt);
                
                // Cache ALL sets to ensure future diffing works correctly
                lastStatus[set.id] = { 
                    status: realStatus, 
                    name: set.name,
                    startAt: set.startAt,
                    endAt: set.endAt
                };
                
                // Only add to the notification message if the status is ONGOING
                if (realStatus === 'ONGOING') {
                    ongoingBlocks.push(formatSetInfo(set, realStatus));
                }
            });

            // Append ongoing blocks or a fallback message if none exist
            if (ongoingBlocks.length > 0) {
                initialMessage += ongoingBlocks.join("\n\n---\n\n");
            } else {
                initialMessage += "> *No ongoing problem sets at the moment.*\n";
            }

            writeFileAtomicSync(STATUS_FILE, JSON.stringify(lastStatus, null, 2) + '\n');
            console.log("[INFO] Data initialization completed. Status saved to local file.");
            await sendDingTalkNotification(title, initialMessage.trim());
            isChecking = false;
            return;
        }

        // Diffing: Compare current sets with local cache
        lastStatus = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        let hasChange = false;
        let cacheDirty = false;
        let changeMessages = [];

        // 1. Check problem sets currently returned by the API
        currentProblemSets.forEach(set => {
            const realStatus = calculateRealStatus(set.startAt, set.endAt);
            const oldData = lastStatus[set.id];

            if (!oldData) {
                // New problem set detected
                hasChange = true;
                changeMessages.push(`**[NEW SET DETECTED]**\n${formatSetInfo(set, realStatus)}`);
                lastStatus[set.id] = { 
                    status: realStatus, 
                    name: set.name,
                    startAt: set.startAt,
                    endAt: set.endAt
                };
                cacheDirty = true;
            } else {
                // Always sync the real server timestamps into cache
                if (oldData.name !== set.name || oldData.startAt !== set.startAt || oldData.endAt !== set.endAt) {
                    cacheDirty = true;
                }
                lastStatus[set.id].name = set.name;
                lastStatus[set.id].startAt = set.startAt;
                lastStatus[set.id].endAt = set.endAt;

                if (oldData.status !== realStatus) {
                    // Status change detected (e.g., ONGOING -> ENDED)
                    hasChange = true;
                    changeMessages.push(`**[STATUS UPDATE: \`${oldData.status}\` -> \`${realStatus}\`]**\n${formatSetInfo(set, realStatus)}`);
                    lastStatus[set.id].status = realStatus;
                    cacheDirty = true;
                }
            }
        });

        // 2. Advance cached sets by their timestamps even if the API temporarily omits them.
        // Absence alone is not proof that a set ended.
        const currentIds = new Set(currentProblemSets.map(set => String(set.id)));
        for (const [id, cachedData] of Object.entries(lastStatus)) {
            if (!currentIds.has(String(id))) {
                const startTime = new Date(cachedData.startAt).getTime();
                const endTime = new Date(cachedData.endAt).getTime();

                if (Number.isFinite(startTime) && Number.isFinite(endTime)) {
                    const realStatus = calculateRealStatus(cachedData.startAt, cachedData.endAt);

                    if (cachedData.status === realStatus) continue;
                    hasChange = true;
                    cacheDirty = true;
                    changeMessages.push(`**[STATUS UPDATE: \`${cachedData.status}\` -> \`${realStatus}\`]**\n${formatSetInfo(cachedData, realStatus)}`);
                    lastStatus[id].status = realStatus;
                }
            }
        }

        // Notification: Send formatted Markdown report
        if (hasChange) {
            const title = "PTA Monitor: Status Updates";
            let finalMessage = "### PTA Monitor Updates\n\n---\n\n#### Changes Detected\n\n";
            
            finalMessage += changeMessages.join("\n\n---\n\n") + "\n\n";

            finalMessage += "---\n\n#### Currently ONGOING\n\n";
            const ongoingSets = currentProblemSets.filter(set => calculateRealStatus(set.startAt, set.endAt) === 'ONGOING');
            
            if (ongoingSets.length > 0) {
                const ongoingBlocks = ongoingSets.map(set => formatSetInfo(set, 'ONGOING'));
                finalMessage += ongoingBlocks.join("\n\n---\n\n") + "\n\n";
            } else {
                finalMessage += "> *No ongoing problem sets at the moment.*\n";
            }

            console.log(`[INFO] Status changes detected! Sending Markdown notification...`);
            await sendDingTalkNotification(title, finalMessage.trim());
            writeFileAtomicSync(STATUS_FILE, JSON.stringify(lastStatus, null, 2) + '\n');
        } else {
            if (cacheDirty) {
                writeFileAtomicSync(STATUS_FILE, JSON.stringify(lastStatus, null, 2) + '\n');
            }
            console.log("[INFO] Check complete. No changes detected.");
        }

    } catch (err) {
        console.error(`[ERROR] Monitoring request failed: ${err.message}`);
    } finally {
        isChecking = false; 
    }
}

// Process Management
const configuredInterval = Number(getConfig().refreshInterval);
const REFRESH_INTERVAL = Number.isFinite(configuredInterval) && configuredInterval >= 1000
    ? configuredInterval
    : 5 * 60 * 1000;

/**
 * Handle process termination gracefully by sending a final notification
 * @param {string} signal - The event or signal causing the shutdown
 */
async function handleShutdown(signal) {
    console.log(`\n[INFO] Received ${signal}.`);
    const title = "PTA Monitor: Process Terminated";
    const time = new Date().toLocaleString('zh-CN', { hour12: false });
    
    const message = `### PTA Monitor Process Terminated\n\n- **Time:** \`${time}\`\n- **Reason:** \`${signal}\`\n\n> The background monitoring script has been safely stopped.`;
    
    try {
        await sendDingTalkNotification(title, message);
        console.log("[INFO] Shutdown notification sent successfully. Exiting.");
    } catch (e) {
        console.error(`[ERROR] Failed to send shutdown notification: ${e.message}`);
    }
    
    // Exit with standard status code (0 for SIGINT/SIGTERM, 1 for uncaught errors)
    const exitCode = signal.includes('Crash') ? 1 : 0;
    process.exit(exitCode);
}

/**
 * Boot sequence: Notify startup, then begin polling loop
 */
async function bootSequence() {
    console.log(`[INFO] Booting PTA Monitor... (PID: ${process.pid})`);
    const title = "PTA Monitor: Process Started";
    const time = new Date().toLocaleString('zh-CN', { hour12: false });
    
    // Convert interval from milliseconds to seconds
    const intervalSecs = (REFRESH_INTERVAL / 1000).toFixed(0);
    const message = `### PTA Monitor Process Started\n\n- **Time:** \`${time}\`\n- **PID:** \`${process.pid}\`\n- **Refresh Interval:** \`${intervalSecs} seconds\`\n\n> The script has initialized successfully and is now active.`;
    await sendDingTalkNotification(title, message);
    checkPTAStatus();
    setInterval(checkPTAStatus, REFRESH_INTERVAL);
}

function startMonitor() {
    process.on('SIGINT', () => handleShutdown('SIGINT (Manual Interruption)'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM (System Kill)'));
    process.on('uncaughtException', (err) => {
        console.error(`[FATAL ERROR] Uncaught Exception: ${err.message}`);
        handleShutdown(`Application Crash: ${err.message}`);
    });

    bootSequence().catch(error => handleShutdown(`Application Crash: ${error.message}`));
}

if (require.main === module) startMonitor();

module.exports = {
    fetchMonitoredProblemSets,
    formatSetInfo,
    checkPTAStatus,
    startMonitor
};
