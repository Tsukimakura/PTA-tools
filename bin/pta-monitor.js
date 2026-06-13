const fs = require('fs');
const path = require('path');

// Import custom modules
const { getConfig, updateCookie } = require('../src/utils/config');
const { calculateRealStatus, getTimestamp } = require('../src/utils/helpers');
const { sendDingTalkNotification } = require('../src/utils/notifier');
const { getCookieViaBrowser } = require('../src/auth/authManager');
const { ptaFetch } = require('../src/api/client');
const { getEndpoints } = require('../src/api/endpoints');

// Resolve path relative to the bin directory
const STATUS_FILE = path.join(__dirname, '../pta_status.json');
let isChecking = false;

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
    
    // Removed formatting from Status and Start, but explicitly bolded the End line
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

            const response = await ptaFetch(endpoints.PROBLEM_SETS);
            const res = await response.json();

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
            const title = "PTA Monitor: Initialization";
            let initialMessage = "### PTA Monitor Initialization\nMonitoring script successfully started.\n\n---\n\n#### All Monitored Sets\n\n";

            // Map each set to a formatted string block
            const setsBlocks = currentProblemSets.map(set => {
                const realStatus = calculateRealStatus(set.startAt, set.endAt);
                lastStatus[set.id] = { status: realStatus, name: set.name };
                return formatSetInfo(set, realStatus);
            });

            initialMessage += setsBlocks.join("\n\n---\n\n");

            fs.writeFileSync(STATUS_FILE, JSON.stringify(lastStatus, null, 2));
            console.log("[INFO] First run completed. Status saved to local file.");
            await sendDingTalkNotification(title, initialMessage.trim());
            isChecking = false;
            return;
        }

        // Diffing: Compare current sets with local cache
        lastStatus = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        let hasChange = false;
        let changeMessages = [];

        currentProblemSets.forEach(set => {
            const realStatus = calculateRealStatus(set.startAt, set.endAt);
            const oldData = lastStatus[set.id];

            if (!oldData) {
                hasChange = true;
                changeMessages.push(`**[NEW SET DETECTED]**\n${formatSetInfo(set, realStatus)}`);
                lastStatus[set.id] = { status: realStatus, name: set.name };
            } else if (oldData.status !== realStatus) {
                hasChange = true;
                changeMessages.push(`**[STATUS UPDATE: \`${oldData.status}\` -> \`${realStatus}\`]**\n${formatSetInfo(set, realStatus)}`);
                lastStatus[set.id].status = realStatus;
            }
        });

        // Notification: Send formatted Markdown report
        if (hasChange) {
            const title = "PTA Monitor: Status Updates";
            let finalMessage = "### PTA Monitor Updates\n\n---\n\n#### Changes Detected\n\n";
            
            // Join change blocks with a horizontal rule
            finalMessage += changeMessages.join("\n\n---\n\n") + "\n\n";

            finalMessage += "---\n\n#### Currently ONGOING\n\n";
            const ongoingSets = currentProblemSets.filter(set => calculateRealStatus(set.startAt, set.endAt) === 'ONGOING');
            
            if (ongoingSets.length > 0) {
                const ongoingBlocks = ongoingSets.map(set => formatSetInfo(set, 'ONGOING'));
                
                // Join ongoing blocks with a horizontal rule
                finalMessage += ongoingBlocks.join("\n\n---\n\n") + "\n\n";
            } else {
                finalMessage += "> *No ongoing problem sets at the moment.*\n";
            }

            console.log(`[INFO] Status changes detected! Sending Markdown notification...`);
            await sendDingTalkNotification(title, finalMessage.trim());
            fs.writeFileSync(STATUS_FILE, JSON.stringify(lastStatus, null, 2));
        } else {
            console.log("[INFO] Check complete. No changes detected.");
        }

    } catch (err) {
        console.error(`[ERROR] Monitoring request failed: ${err.message}`);
    } finally {
        isChecking = false; 
    }
}

// Initialization and interval setup
const REFRESH_INTERVAL = getConfig().refreshInterval || 5 * 60 * 1000;
checkPTAStatus();
setInterval(checkPTAStatus, REFRESH_INTERVAL);