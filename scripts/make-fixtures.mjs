#!/usr/bin/env node
/**
 * Writes the SYNTHETIC test fixtures (no real chat, no real path, no real id) and expected.json.
 * Deterministic: running it twice gives byte-identical files (test F-2).
 *
 *   node scripts/make-fixtures.mjs [outDir]     default: test/fixtures
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NOW = '2026-11-20T12:00:00.000Z';
const nowMs = Date.parse(NOW);
const iso = (minutesBefore) => new Date(nowMs - minutesBefore * 60_000).toISOString();
const ms = (minutesBefore) => nowMs - minutesBefore * 60_000;

const CC_SESSION = '11111111-1111-4111-8111-111111111111';
const CODEX_SESSION = '22222222-2222-4222-8222-222222222222';
const CWD = '/home/test/demo-repo';

const jsonl = (records) => records.map((r) => JSON.stringify(r)).join('\n') + '\n';

function copilotRequests() {
    return [
        {
            requestId: 'request-1', timestamp: ms(300), modelId: 'copilot/test-model',
            message: { text: 'How do I read a file in Node?' },
            response: [{ value: 'Use fs.readFileSync for small files.' }, { kind: 'thinking', value: 'hidden reasoning' }, { value: { value: ' Use streams for large ones.' } }],
        },
        {
            requestId: 'request-2', timestamp: ms(299),
            message: { text: 'Thanks' },
            response: [{ value: 'You are welcome.' }],
        },
    ];
}

export function copilotLegacy() {
    return JSON.stringify({ version: 3, requesterUsername: 'tester', creationDate: ms(300), requests: copilotRequests() }, null, 2) + '\n';
}

export function copilotJsonl() {
    const [r1, r2] = copilotRequests();
    return jsonl([
        { kind: 0, v: { version: 3, requesterUsername: 'tester', creationDate: ms(300), requests: [] } },
        { kind: 2, k: ['requests'], v: [{ ...r1, response: [] }] },
        { kind: 1, k: ['requests', 0, 'response'], v: r1.response },
        { kind: 2, k: ['requests'], v: [r2] },
    ]);
}

const LONG_CLAUDE = 'L'.repeat(40_960);
const LONG_CODEX = 'X'.repeat(30_720);

export function claudeSession() {
    const base = { sessionId: CC_SESSION, cwd: CWD, version: '2.1.0', entrypoint: 'claude-vscode', userType: 'external' };
    const usage = (i, o, cr, cw) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cw });
    return jsonl([
        { type: 'queue-operation', operation: 'enqueue', timestamp: iso(121), sessionId: CC_SESSION },
        { ...base, type: 'user', uuid: 'u-1', parentUuid: null, timestamp: iso(120), message: { role: 'user', content: 'Explain the build script' } },
        { ...base, type: 'user', uuid: 'u-2', parentUuid: 'u-1', timestamp: iso(120), message: { role: 'user', content: '<command-name>/clear</command-name>' } },
        { ...base, type: 'assistant', uuid: 'a-1', parentUuid: 'u-1', requestId: 'req_1', timestamp: iso(119),
            message: { role: 'assistant', model: 'claude-test', content: [{ type: 'text', text: 'The build script bundles two entry points.' }, { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'ls' } }], usage: usage(100, 50, 1000, 10) } },
        { ...base, type: 'assistant', uuid: 'a-2', parentUuid: 'a-1', requestId: 'req_1', timestamp: iso(118),
            message: { role: 'assistant', model: 'claude-test', content: [{ type: 'tool_use', id: 'tu-2', name: 'Edit', input: { file_path: 'build.mjs' } }], usage: usage(100, 60, 1000, 0) } },
        { ...base, type: 'user', uuid: 'u-3', parentUuid: 'a-1', timestamp: iso(118), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'ok' }] } },
        { ...base, type: 'user', uuid: 'u-4', parentUuid: 'a-2', timestamp: iso(110), message: { role: 'user', content: [{ type: 'text', text: 'Show the full log' }] } },
        { ...base, type: 'assistant', uuid: 'a-3', parentUuid: 'u-4', requestId: 'req_2', timestamp: iso(109),
            message: { role: 'assistant', model: 'claude-test', content: [{ type: 'text', text: LONG_CLAUDE }], usage: usage(200, 4000, 0, 0) } },
        { type: 'ai-title', sessionId: CC_SESSION, title: 'Build script walkthrough' },
        { type: 'future-record-type', sessionId: CC_SESSION, timestamp: iso(100), payload: { anything: true } },
    ]);
}

export function claudeUsageDup() {
    const rec = (uuid, requestId, minutesBefore, n) => ({
        type: 'assistant', uuid, sessionId: CC_SESSION, requestId, timestamp: iso(minutesBefore), cwd: CWD,
        message: { role: 'assistant', model: 'claude-test', content: [{ type: 'text', text: `reply ${uuid}` }], usage: { input_tokens: n, output_tokens: n, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    });
    const a = rec('d-1', 'req_A', 60, 10);
    return jsonl([a, a, rec('d-2', 'req_B', 167 * 60, 20), rec('d-3', 'req_C', 169 * 60, 40)]);
}

export function codexRollout() {
    const ev = (minutesBefore, payload) => ({ timestamp: iso(minutesBefore), type: 'event_msg', payload });
    const tc = (last, cumulative) => ({ type: 'token_count', info: { last_token_usage: last, total_token_usage: { ...last, total_tokens: cumulative } } });
    const u = (i, c, o, r, t) => ({ input_tokens: i, cached_input_tokens: c, output_tokens: o, reasoning_output_tokens: r, total_tokens: t });
    return jsonl([
        { timestamp: iso(180), type: 'session_meta', payload: { id: CODEX_SESSION, timestamp: iso(180), cwd: CWD, originator: 'codex_vscode', cli_version: '0.171.0', source: 'vscode' } },
        { timestamp: iso(180), type: 'turn_context', payload: { turn_id: 'turn-1', model: 'codex-test', cwd: CWD } },
        ev(179, { type: 'user_message', message: 'Add a unit test for the parser' }),
        ev(178, { type: 'agent_message', message: 'Added parser.test.ts with three cases.' }),
        ev(178, tc(u(100, 20, 30, 5, 130), 130)),
        ev(170, { type: 'user_message', message: 'Show me the long version' }),
        ev(169, { type: 'agent_message', message: LONG_CODEX }),
        ev(169, tc(u(50, 0, 20, 0, 70), 200)),
        ev(169, tc(u(50, 0, 20, 0, 70), 200)),
        ev(168, { type: 'token_count', info: null }),
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'legacy-shaped line' }] },
    ]);
}

export const EXPECTED = {
    now: NOW,
    claude: { input: 400, output: 4110, cacheRead: 2000, cacheWrite: 10, total: 6520, records: 3 },
    claudeDup: { dedupedTotal: 60, naiveInWindowTotal: 80 },
    codex: { input: 150, output: 50, cacheRead: 20, cacheWrite: 0, total: 200, records: 2, finalCumulative: 200 },
    longClaudeChars: LONG_CLAUDE.length,
    longCodexChars: LONG_CODEX.length,
    sessionIds: { claude: CC_SESSION, codex: CODEX_SESSION },
};

export function writeFixtures(outDir = path.join(ROOT, 'test', 'fixtures')) {
    fs.mkdirSync(outDir, { recursive: true });
    const files = {
        'copilot-legacy.json': copilotLegacy(),
        'copilot-session.jsonl': copilotJsonl(),
        'claude-session.jsonl': claudeSession(),
        'claude-usage-dup.jsonl': claudeUsageDup(),
        'codex-rollout.jsonl': codexRollout(),
        'expected.json': JSON.stringify(EXPECTED, null, 2) + '\n',
    };
    for (const [name, text] of Object.entries(files)) { fs.writeFileSync(path.join(outDir, name), text); }
    return Object.keys(files);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const out = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
    console.log(`fixtures written: ${writeFixtures(out).join(', ')}`);
}
