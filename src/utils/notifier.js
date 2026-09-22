const { getConfig } = require('./config');

/**
 * Send notification via DingTalk webhook using Markdown format
 * @param {string} title - The notification title (displayed on mobile notification banners)
 * @param {string} markdownText - The actual Markdown formatted content
 */
async function sendDingTalkNotification(title, markdownText) {
    const config = getConfig();
    
    if (!config.dingdingWebhook) return false;
    
    try {
        const res = await fetch(config.dingdingWebhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                "msgtype": "markdown",
                "markdown": {
                    "title": title,
                    "text": markdownText
                }
            }),
            signal: AbortSignal.timeout(10_000)
        });
        
        if (!res.ok) {
            console.error(`[ERROR] Failed to send DingTalk notification. HTTP Status: ${res.status}`);
            return false;
        }

        const result = await res.json().catch(() => ({}));
        if (result.errcode !== undefined && result.errcode !== 0) {
            console.error(`[ERROR] DingTalk rejected the notification: ${result.errmsg || result.errcode}`);
            return false;
        }

        return true;
    } catch (e) {
        console.error(`[ERROR] DingTalk API request failed: ${e.message}`);
        return false;
    }
}

module.exports = {
    sendDingTalkNotification
};
