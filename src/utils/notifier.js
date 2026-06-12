const { getConfig } = require('./config');

/**
 * Send notification via DingTalk webhook
 * @param {string} message - The text content to be sent
 */
async function sendDingTalkNotification(message) {
    const config = getConfig();
    
    if (!config.dingdingWebhook) return;
    
    try {
        const res = await fetch(config.dingdingWebhook, {
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

module.exports = {
    sendDingTalkNotification
};