const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');

const { ptaFetch } = require('../src/api/client');
const { getEndpoints } = require('../src/api/endpoints');
const { calculateRealStatus } = require('../src/utils/helpers');
const { writeFileAtomicSync } = require('../src/utils/files');
const {
    escapeMarkdownTableCell,
    formatFencedCodeBlock,
    generateMarkdown
} = require('../src/services/parser');
const { generateArchiveMarkdown } = require('../src/services/archiveParser');
const { fetchMonitoredProblemSets } = require('../bin/pta-monitor');
const { submissionMatchesExpectedId } = require('../src/services/submitter');
const { loadAuthenticatedProblemSets } = require('../src/services/problemSets');
const { buildTodoDigest, sendTodoNotification } = require('../src/services/todoNotifier');
const { runCommand } = require('../bin/pta');

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
});

test('calculateRealStatus covers every time window', () => {
    const now = Date.now();
    assert.equal(calculateRealStatus(now + 10_000, now + 20_000), 'NOT_STARTED');
    assert.equal(calculateRealStatus(now - 10_000, now + 10_000), 'ONGOING');
    assert.equal(calculateRealStatus(now - 20_000, now - 10_000), 'ENDED');
});

test('monitor pagination collects every page', async () => {
    const pages = [
        { problemSets: Array.from({ length: 50 }, (_, id) => ({ id })) },
        { problemSets: [{ id: 50 }], total: 51 }
    ];
    const requestedUrls = [];
    const endpoints = {
        MONITORED_PROBLEM_SETS(page, limit) {
            return `page=${page}&limit=${limit}`;
        }
    };
    const fetcher = async url => {
        requestedUrls.push(url);
        return new Response(JSON.stringify(pages.shift()), {
            headers: { 'Content-Type': 'application/json' }
        });
    };

    const result = await fetchMonitoredProblemSets(endpoints, fetcher);
    assert.equal(result.problemSets.length, 51);
    assert.deepEqual(requestedUrls, ['page=0&limit=50', 'page=1&limit=50']);
});

test('ptaFetch retries transient GET failures', async () => {
    let calls = 0;
    global.fetch = async () => {
        calls++;
        return calls === 1
            ? new Response('{}', { status: 503, statusText: 'Unavailable' })
            : new Response('{}', { status: 200 });
    };

    const response = await ptaFetch('https://pintia.cn/api/test', { retries: 1 });
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
});

test('ptaFetch never retries POST by default', async () => {
    let calls = 0;
    global.fetch = async () => {
        calls++;
        return new Response('{}', { status: 503, statusText: 'Unavailable' });
    };

    await assert.rejects(
        ptaFetch('https://pintia.cn/api/test', { method: 'POST' }),
        /HTTP 503/
    );
    assert.equal(calls, 1);
});

test('endpoint builder encodes monitor pagination', () => {
    const url = new URL(getEndpoints().MONITORED_PROBLEM_SETS(2, 25));
    assert.equal(url.searchParams.get('page'), '2');
    assert.equal(url.searchParams.get('limit'), '25');
    assert.ok(JSON.parse(url.searchParams.get('filter')).endAtAfter);
});

test('judge polling only accepts the newly created submission', () => {
    assert.equal(submissionMatchesExpectedId({ id: 'new-id' }, 'new-id'), true);
    assert.equal(submissionMatchesExpectedId({ id: 'old-id' }, 'new-id'), false);
    assert.equal(submissionMatchesExpectedId({}, 'new-id'), false);
});

test('problem-set loader reauthenticates once after an expired cookie', async () => {
    const config = { cookie: 'expired' };
    let fetchCalls = 0;
    let authCalls = 0;
    const expected = [{ id: 'set-1' }];

    const result = await loadAuthenticatedProblemSets({
        config,
        fetchProblemSets: async () => (++fetchCalls === 1 ? null : expected),
        authenticate: async () => {
            authCalls++;
            config.cookie = 'fresh';
            return true;
        },
        updateCookie: cookie => {
            config.cookie = cookie;
        }
    });

    assert.equal(authCalls, 1);
    assert.equal(fetchCalls, 2);
    assert.equal(result, expected);
});

test('todo digest includes only unfinished sets in deadline order', async () => {
    const now = Date.parse('2026-09-22T00:00:00Z');
    const sets = [
        { name: 'Ended', startAt: '2026-09-20T00:00:00Z', endAt: '2026-09-21T00:00:00Z' },
        { name: 'Later ongoing', startAt: '2026-09-21T00:00:00Z', endAt: '2026-09-24T00:00:00Z' },
        { name: 'Sooner ongoing', startAt: '2026-09-21T00:00:00Z', endAt: '2026-09-23T00:00:00Z' },
        { name: 'Upcoming', startAt: '2026-09-25T00:00:00Z', endAt: '2026-09-26T00:00:00Z' }
    ];

    const digest = buildTodoDigest(sets, now);
    assert.equal(digest.count, 3);
    assert.equal(digest.ongoingCount, 2);
    assert.equal(digest.upcomingCount, 1);
    assert.doesNotMatch(digest.markdown, /Ended/);
    assert.ok(digest.markdown.indexOf('Sooner ongoing') < digest.markdown.indexOf('Later ongoing'));
    assert.ok(digest.markdown.indexOf('Later ongoing') < digest.markdown.indexOf('Upcoming'));

    let deliveredMessage;
    const sentDigest = await sendTodoNotification({
        now,
        loadProblemSets: async () => sets,
        sendNotification: async (title, markdown) => {
            deliveredMessage = { title, markdown };
            return true;
        }
    });
    assert.equal(sentDigest.count, 3);
    assert.equal(deliveredMessage.title, digest.title);
    assert.equal(deliveredMessage.markdown, digest.markdown);
});

test('unified CLI dispatches todo aliases and rejects unknown commands', async () => {
    const output = [];
    let todoCalls = 0;
    const dependencies = {
        sendTodo: async () => {
            todoCalls++;
            return { count: 2 };
        },
        writeLine: line => output.push(line)
    };

    await runCommand(['t'], dependencies);
    assert.equal(todoCalls, 1);
    assert.match(output[0], /2 unfinished sets/);

    await assert.rejects(runCommand(['unknown'], dependencies), /Unknown command/);
});

test('atomic writer replaces complete files and preserves requested mode', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pta-tools-test-'));
    const target = path.join(directory, 'state.json');

    try {
        writeFileAtomicSync(target, 'first', { mode: 0o600 });
        writeFileAtomicSync(target, 'second', { mode: 0o600 });
        assert.equal(fs.readFileSync(target, 'utf8'), 'second');
        if (process.platform !== 'win32') {
            assert.equal(fs.statSync(target).mode & 0o777, 0o600);
        }
        assert.deepEqual(fs.readdirSync(directory), ['state.json']);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('Markdown helpers preserve backticks, empty answers and table content', () => {
    assert.match(formatFencedCodeBlock('```\ncode', 'text'), /^````text/);
    assert.equal(escapeMarkdownTableCell('a|b\nc'), 'a\\|b<br>c');

    const progress = generateMarkdown(
        'Set',
        { PROGRAMMING: [{ id: 'p1', title: 'Problem', content: 'Body' }] },
        { p1: '' }
    );
    assert.match(progress, /Current Saved Answer/);
    assert.match(progress, /\(empty\)/);

    const archive = generateArchiveMarkdown(
        'Set',
        { PROGRAMMING: [{ id: 'p1', title: 'Problem', content: 'Body', score: 10 }] },
        {
            p1: {
                status: 'ACCEPTED',
                score: 10,
                compiler: 'GCC',
                time: 0.1,
                memory: 1024,
                program: '```\ncode',
                testcases: {
                    sample: { result: 'WRONG|ANSWER', testcaseScore: 0, time: 0.1, memory: 1024 }
                },
                hints: { sample: 'line 1|line 2\nnext' }
            }
        }
    );
    assert.match(archive, /^````c$/m);
    assert.match(archive, /WRONG\\\|ANSWER/);
    assert.match(archive, /line 1\\\|line 2<br>next/);
});
