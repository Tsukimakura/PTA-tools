const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { getConfig, updateCookie } = require('../utils/config');
const { getTimestamp } = require('../utils/helpers');

puppeteer.use(StealthPlugin());

/**
 * Launch browser to simulate login and intercept authentication cookies
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function getCookieViaBrowser() {
    const config = getConfig();
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

        for (let i = 0; i < 180; i++) {
            const currentUrl = page.url();
            
            if (!currentUrl.includes('/login') && currentUrl !== 'about:blank') {
                await new Promise(r => setTimeout(r, 2000)); 
                
                const cookiesArray = await page.cookies();
                const newCookie = cookiesArray.map(c => `${c.name}=${c.value}`).join('; ');
                
                // Use the centralized config manager to save the cookie
                updateCookie(newCookie);

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

module.exports = {
    getCookieViaBrowser
};