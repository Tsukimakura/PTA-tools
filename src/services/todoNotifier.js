const { calculateRealStatus } = require('../utils/helpers');
const { sendDingTalkNotification } = require('../utils/notifier');
const { loadAuthenticatedProblemSets } = require('./problemSets');

function escapeMarkdownText(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/([`*_\[\]])/g, '\\$1')
        .replace(/\r?\n/g, ' ');
}

function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '未知';
    return date.toLocaleString('zh-CN', { hour12: false });
}

function formatDuration(milliseconds) {
    const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];

    if (days > 0) parts.push(`${days} 天`);
    if (hours > 0) parts.push(`${hours} 小时`);
    if (days === 0 && minutes > 0) parts.push(`${minutes} 分钟`);
    return parts.length > 0 ? parts.join(' ') : '不足 1 分钟';
}

function formatSetBlock(set, status, now) {
    const name = escapeMarkdownText(set.name || '未命名题集');

    if (status === 'ONGOING') {
        const remaining = new Date(set.endAt).getTime() - now;
        return `**${name}**\n- 状态：进行中\n- 截止：\`${formatDate(set.endAt)}\`\n- 剩余：**${formatDuration(remaining)}**`;
    }

    const untilStart = new Date(set.startAt).getTime() - now;
    return `**${name}**\n- 状态：未开始\n- 开始：\`${formatDate(set.startAt)}\`（${formatDuration(untilStart)}后）\n- 截止：\`${formatDate(set.endAt)}\``;
}

function buildTodoDigest(problemSets, now = Date.now()) {
    const unfinished = problemSets
        .map(set => ({ ...set, realStatus: calculateRealStatus(set.startAt, set.endAt, now) }))
        .filter(set => set.realStatus !== 'ENDED');

    const ongoing = unfinished
        .filter(set => set.realStatus === 'ONGOING')
        .sort((a, b) => new Date(a.endAt) - new Date(b.endAt));
    const upcoming = unfinished
        .filter(set => set.realStatus === 'NOT_STARTED')
        .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

    const title = `PTA 待办：${unfinished.length} 个未结束题集`;
    let markdown = `### PTA 待办摘要\n\n共 **${unfinished.length}** 个未结束题集：${ongoing.length} 个进行中，${upcoming.length} 个未开始。\n`;

    if (unfinished.length === 0) {
        markdown += '\n> 当前没有未结束的题集。';
        return { title, markdown, count: 0, ongoingCount: 0, upcomingCount: 0 };
    }

    if (ongoing.length > 0) {
        markdown += `\n---\n\n#### 进行中（${ongoing.length}）\n\n`;
        markdown += ongoing.map(set => formatSetBlock(set, 'ONGOING', now)).join('\n\n---\n\n');
    }

    if (upcoming.length > 0) {
        markdown += `\n\n---\n\n#### 未开始（${upcoming.length}）\n\n`;
        markdown += upcoming.map(set => formatSetBlock(set, 'NOT_STARTED', now)).join('\n\n---\n\n');
    }

    return {
        title,
        markdown: markdown.trim(),
        count: unfinished.length,
        ongoingCount: ongoing.length,
        upcomingCount: upcoming.length
    };
}

async function sendTodoNotification(dependencies = {}) {
    const loadProblemSets = dependencies.loadProblemSets || loadAuthenticatedProblemSets;
    const sendNotification = dependencies.sendNotification || sendDingTalkNotification;
    const now = dependencies.now === undefined ? Date.now() : dependencies.now;
    const problemSets = await loadProblemSets();
    const digest = buildTodoDigest(problemSets, now);
    const sent = await sendNotification(digest.title, digest.markdown);

    if (!sent) {
        throw new Error('DingTalk notification was not sent. Check DINGTALK_WEBHOOK or config.json.');
    }

    return digest;
}

module.exports = {
    buildTodoDigest,
    sendTodoNotification
};
