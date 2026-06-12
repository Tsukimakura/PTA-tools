const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// ================= Configuration Setup =================
const CONFIG_FILE = './config.json';
const STATUS_FILE = './pta_status.json';

let config;
try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
} catch (e) {
    console.error("[ERROR] Failed to read config.json. Please ensure the file exists and is in valid JSON format.");
    process.exit(1);
}

const REFRESH_INTERVAL = config.refreshInterval || 5 * 60 * 1000;
const API_URL = config.apiUrl;
const DINGDING_WEBHOOK = config.dingdingWebhook;

let currentCookie = config.cookie || ""; 
let isChecking = false; // Process lock to prevent concurrent executions
// =======================================================

// Calculate the real display status based on time window
function calculateRealStatus(startAt, endAt) {
    const now = Date.now();
    const start = new Date(startAt).getTime();
    const end = new Date(endAt).getTime();

    if (now < start) return 'NOT_STARTED';
    if (now > end) return 'ENDED';
    return 'ONGOING';
}

// Helper function for consistent log timestamps
function getTimestamp() {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
}

// Send notification via DingTalk webhook
async function sendDingTalkNotification(message) {
    if (!DINGDING_WEBHOOK) return;
    try {
        const res = await fetch(DINGDING_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                "msgtype": "text",
                "text": { "content": `[PTA Monitor]\n${message}` }
            })
        });
        if (!res.ok) {
            console.error(`[ERROR] Failed to send DingTalk notification. HTTP Status: ${res.status}`);
        }
    } catch (e) {
        console.error(`[ERROR] DingTalk API request failed: ${e.message}`);
    }
}

// Launch browser to simulate login and intercept authentication cookies
async function getCookieViaBrowser() {
    console.log(`[INFO] [${getTimestamp()}] Starting browser... [Please complete manual captcha verification if prompted]`);
    
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: null,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1280,720'
        ]
    }); 
    
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    try {
        console.log("[INFO] Opening login page...");
        await page.goto('https://pintia.cn/auth/login', { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log("[INFO] Attempting to auto-fill credentials...");
        try {
            await page.waitForSelector('input', { timeout: 10000 });
            const inputs = await page.$$('input');
            if (inputs.length >= 2) {
                await inputs[0].type(config.username, { delay: 100 });
                await inputs[1].type(config.password, { delay: 100 });
                await page.keyboard.press('Enter');
            }
        } catch (fillError) {
            console.warn("[WARN] Auto-fill failed. Please enter credentials manually in the browser window.");
        }

        console.log("[INFO] Monitoring URL navigation state in the background (timeout: 3 minutes)...");
        let loginSuccess = false;

        // Loop for 180 iterations (approx. 3 minutes) to wait for manual intervention
        for (let i = 0; i < 180; i++) {
            const currentUrl = page.url();
            
            // A change in URL indicates a successful login routing
            if (!currentUrl.includes('/login') && currentUrl !== 'about:blank') {
                await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds to ensure cookies are fully written
                
                const cookiesArray = await page.cookies();
                currentCookie = cookiesArray.map(c => `${c.name}=${c.value}`).join('; ');
                
                // Save the new cookie to configuration for future headless requests
                config.cookie = currentCookie;
                fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

                console.log("[INFO] Intercept successful. Authenticated Cookie retrieved and saved to configuration.");
                loginSuccess = true;
                break; 
            }
            await new Promise(r => setTimeout(r, 1000)); 
        }

        await browser.close(); 
        return loginSuccess;

    } catch (e) {
        console.error(`[ERROR] Browser encountered an exception: ${e.message}`);
        await browser.close();
        return false;
    }
}

// Core monitoring logic
async function checkPTAStatus() {
    if (isChecking) {
        console.log(`[WARN] [${getTimestamp()}] Task backlogged. Skipping current trigger...`);
        return;
    }
    isChecking = true;

    console.log(`\n[INFO] [${getTimestamp()}] Checking PTA problem set status...`);

    try {
        let res;
        let currentProblemSets = [];
        const MAX_RETRIES = 3;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            
            if (!currentCookie) {
                const success = await getCookieViaBrowser();
                if (!success) {
                    isChecking = false;
                    return; // Abort if browser login fails
                }
            }

            const response = await fetch(API_URL, {
                headers: {
                    'Cookie': currentCookie,
                    'Accept': 'application/json, text/plain, */*',
                    'Origin': 'https://pintia.cn',
                    'Referer': 'https://pintia.cn/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            res = await response.json();

            // Check if cookie is expired
            if (res.error && res.error.code === 'USER_NOT_FOUND') {
                console.warn(`[WARN] Credentials expired (Attempt ${attempt}/${MAX_RETRIES}).`);
                
                // Clear the invalid cookie
                currentCookie = "";
                config.cookie = "";
                fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

                if (attempt === MAX_RETRIES) {
                    console.error("[ERROR] Authentication failed repeatedly. Aborting this cycle.");
                    isChecking = false;
                    return;
                }

                console.log("[INFO] Launching browser immediately to re-authenticate...");
                continue; // Loop restarts -> triggers getCookieViaBrowser() immediately
            }

            // If successful, extract data and break the retry loop
            currentProblemSets = res.problemSets || (res.data && res.data.problemSets) || [];
            break; 
        }

        if (currentProblemSets.length === 0) {
            console.log("[INFO] No ongoing problem sets currently available.");
            isChecking = false;
            return;
        }

        let lastStatus = {};
        if (fs.existsSync(STATUS_FILE)) {
            lastStatus = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        } else {
            // First run setup
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

        // Compare current fetched data with the local JSON file
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
checkPTAStatus();
setInterval(checkPTAStatus, REFRESH_INTERVAL);