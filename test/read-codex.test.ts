/** RX-1…RX-4: Codex rollouts, full text, one source of messages per file. */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import type * as vscodeTypes from 'vscode';
import { runCli, type CliIo } from '../src/cli';
import type { SessionRef } from '../src/model';
import { CODEX_PEEK_BYTES, PEEK_BYTES, labelSession, peekLabel } from '../src/read';
import { applyCodexRecord, codexTurns, newCodexState, readCodexConversation } from '../src/read/codex';
import { readHead } from '../src/read/line-stream';
import { ChatsTreeProvider } from '../src/vscode/chats-tree';
import { createVscodeMock } from './__mocks__/vscode';
import { EXPECTED, FIXTURES, tmpDir } from './helpers';

const ref = { id: `codex:${EXPECTED.sessionIds.codex}`, file: path.join(FIXTURES, 'codex-rollout.jsonl') };

describe('readCodexConversation', () => {
    it('RX-1 user and agent messages become 2 + 2 turns', async () => {
        const c = await readCodexConversation(ref);
        expect(c.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
        expect(c.turns[0].text).toBe('Add a unit test for the parser');
        expect(c.title).toBe('Add a unit test for the parser');
    });

    it('RX-2 session meta gives the start time and the project folder', async () => {
        const c = await readCodexConversation(ref);
        expect(c.startedAt).toBe(new Date(Date.parse(EXPECTED.now) - 180 * 60_000).toISOString());
        expect(c.project).toBe('demo-repo');
    });

    it('RX-3 full text: a 30 KB reply is not truncated (XM caps Codex text)', async () => {
        const c = await readCodexConversation(ref);
        expect(c.turns[3].text.length).toBe(EXPECTED.longCodexChars);
    });

    it('RX-4 a legacy-shaped line is ignored without error; item_completed messages win when present', () => {
        const s = newCodexState();
        applyCodexRecord({ type: 'message', payload: { role: 'user' } }, s);
        expect(codexTurns(s)).toEqual([]);
        applyCodexRecord({ type: 'event_msg', timestamp: '2026-11-20T09:00:00Z', payload: { type: 'user_message', message: 'from event' } }, s);
        applyCodexRecord({ type: 'event_msg', timestamp: '2026-11-20T09:00:00Z', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: 'from item' }] } } }, s);
        expect(codexTurns(s).map((t) => t.text)).toEqual(['from item']);
    });
});

/**
 * CT-T1…CT-T5 (#363): a Codex 0.171 rollout puts ~88 KB of session meta and developer messages before the first user
 * message, and `codex exec` writes no session_index.jsonl. The title must still come from the first prompt.
 */
const CT_ID = '33333333-3333-4333-8333-333333333333';
const CT_PROMPT = 'Create the file notes/todo.txt containing one line, then run git status';

function writeBigRollout(home: string, devBytes: number): string {
    const file = path.join(home, '.codex', 'sessions', '2026', '11', '27', `rollout-2026-11-27T14-17-40-${CT_ID}.jsonl`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const lines = [JSON.stringify({ timestamp: '2026-11-27T14:17:40.000Z', type: 'session_meta', payload: { id: CT_ID, timestamp: '2026-11-27T14:17:40.000Z', cwd: '/home/test/big-repo', originator: 'codex_exec', cli_version: '0.171.0', source: 'exec' } })];
    for (let written = 0; written < devBytes; written += 40_000) {
        lines.push(JSON.stringify({ timestamp: '2026-11-27T14:17:41.000Z', type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'D'.repeat(40_000) }] } }));
    }
    lines.push(JSON.stringify({ timestamp: '2026-11-27T14:17:42.000Z', type: 'event_msg', payload: { type: 'user_message', message: CT_PROMPT } }));
    lines.push(JSON.stringify({ timestamp: '2026-11-27T14:17:43.000Z', type: 'event_msg', payload: { type: 'agent_message', message: 'Done.' } }));
    fs.writeFileSync(file, `${lines.join('\n')}\n`);
    return file;
}

function codexRef(file: string): SessionRef {
    const st = fs.statSync(file);
    return { assistant: 'codex', id: `codex:${CT_ID}`, file, project: 'big-repo', size: st.size, mtimeMs: st.mtimeMs };
}

describe('peekLabel (#363)', () => {
    it('CT-T1 the first prompt after ~90 KB of developer messages is the title', () => {
        const file = writeBigRollout(tmpDir(), 90_000);
        expect(fs.statSync(file).size).toBeGreaterThan(PEEK_BYTES);
        expect(peekLabel(codexRef(file)).title).toBe(CT_PROMPT);
        expect(labelSession(codexRef(file)).title).toBe(CT_PROMPT);
    });

    it('CT-T2 a prompt inside the first 64 KB needs one read of 64 KB', () => {
        const file = writeBigRollout(tmpDir(), 0);
        const calls: number[] = [];
        const p = peekLabel(codexRef(file), (f, n) => { calls.push(n); return readHead(f, n); });
        expect(p.title).toBe(CT_PROMPT);
        expect(calls).toEqual([PEEK_BYTES]);
    });

    it('CT-T3 no prompt in the first 1 MB: no title, no throw, never more than 1 MB read', () => {
        const file = writeBigRollout(tmpDir(), 1_100_000);
        const calls: number[] = [];
        const p = peekLabel(codexRef(file), (f, n) => { calls.push(n); return readHead(f, n); });
        expect(p.title).toBeUndefined();
        expect(calls).toEqual([PEEK_BYTES, CODEX_PEEK_BYTES]);
        expect(CODEX_PEEK_BYTES).toBe(1024 * 1024);
    });

    it('CT-T4 `list --assistant codex` prints the prompt without a session index', async () => {
        const home = tmpDir();
        writeBigRollout(home, 90_000);
        let out = '';
        const io: CliIo = { out(s: string) { out += s; }, err() { /* none */ }, discover: { platform: 'linux', env: {}, home } };
        expect(await runCli(['list', '--assistant', 'codex'], io)).toBe(0);
        const row = out.trim().split('\n');
        expect(row).toHaveLength(1);
        expect(row[0].split('\t')[3]).toBe(CT_PROMPT);
    });

    it('CT-T5 the Chats view (default peek) shows the prompt', () => {
        const file = writeBigRollout(tmpDir(), 90_000);
        const tree = new ChatsTreeProvider(createVscodeMock() as unknown as typeof vscodeTypes);
        expect(tree.titleOf(codexRef(file))).toBe(CT_PROMPT);
    });
});
