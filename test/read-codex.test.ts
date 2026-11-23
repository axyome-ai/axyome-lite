/** RX-1…RX-4: Codex rollouts, full text, one source of messages per file. */
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { applyCodexRecord, codexTurns, newCodexState, readCodexConversation } from '../src/read/codex';
import { EXPECTED, FIXTURES } from './helpers';

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
