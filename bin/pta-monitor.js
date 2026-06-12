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
            
            // 1. Ensure authentication ticket exists
            if (!config.cookie) {
                const success = await getCookieViaBrowser();
                if (!success) {
                    isChecking = false;
                    return; 
                }
            }

            // 2. Fetch data using the centralized API client
            const response = await ptaFetch(endpoints.PROBLEM_SETS);
            const res = await response.json();

            // 3. Handle expired credentials
            if (res.error && res.error.code === 'USER_NOT_FOUND') {
                console.warn(`[WARN] Credentials expired (Attempt ${attempt}/${MAX_RETRIES}).`);
                
                // Clear the invalid cookie globally
                updateCookie("");

                if (attempt === MAX_RETRIES) {
                    console.error("[ERROR] Authentication failed repeatedly. Aborting this cycle.");
                    isChecking = false;
                    return;
                }

                console.log("[INFO] Launching browser immediately to re-authenticate...");
                continue; 
            }

            // 4. Data extracted successfully
            currentProblemSets = res.problemSets || (res.data && res.data.problemSets) || [];
            break; 
        }

        // Diffing and Notifications
        
        if (currentProblemSets.length === 0) {
            console.log("[INFO] No ongoing problem sets currently available.");
            isChecking = false;
            return;
        }

        let lastStatus = {};
        if (fs.existsSync(STATUS_FILE)) {
            lastStatus = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        } else {
            currentProblemSets.forEach(set => {
                lastStatus[set.id] = { 
                    status: calculateRealStatus(set.startAt, set.endAt), 
                    name: set.name 
                };
            });
            fs.writeFileSync(STATUS_FILE, JSON.stringify(lastStatus, null, 2));
            console.log("[INFO] First run completed. Status saved to local file.");
            await sendDingTalkNotification("Monitoring script has successfully taken over and is running in the background.");
            isChecking = false;
            return;
        }

        let hasChange = false;
        let changeMessages = [];

        currentProblemSets.forEach(set => {
            const realStatus = calculateRealStatus(set.startAt, set.endAt);
            const oldData = lastStatus[set.id];

            if (!oldData) {
                hasChange = true;
                changeMessages.push(`[NEW] Problem set detected: "${set.name}" (Status: ${realStatus})`);
                lastStatus[set.id] = { status: realStatus, name: set.name };
            } else if (oldData.status !== realStatus) {
                hasChange = true;
                changeMessages.push(`[UPDATE] Status changed for "${set.name}": [${oldData.status}] -> [${realStatus}]`);
                lastStatus[set.id].status = realStatus;
            }
        });

        if (hasChange) {
            const finalMessage = changeMessages.join("\n");
            console.log(`[INFO] Status changes detected!\n${finalMessage}`);
            await sendDingTalkNotification(finalMessage);
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