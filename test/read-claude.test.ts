/** RL-1…RL-5: Claude Code transcripts, full text (no 16 KB cap). */
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { readClaudeConversation } from '../src/read/claude';
import { extractTurnText, parseLine } from '../src/xm-core/capture/claude-code-parser';
import { EXPECTED, FIXTURES } from './helpers';
import * as fs from 'fs';

const file = path.join(FIXTURES, 'claude-session.jsonl');
const ref = { id: `claude:${EXPECTED.sessionIds.claude}`, file, project: '-home-test-demo-repo' };

describe('readClaudeConversation', () => {
    it('RL-1 user and assistant turns in order; title from the ai-title record; project from cwd', async () => {
        const c = await readClaudeConversation(ref);
        expect(c.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
        expect(c.turns[0].text).toBe('Explain the build script');
        expect(c.title).toBe('Build script walkthrough');
        expect(c.project).toBe('demo-repo');
    });

    it('RL-2 no 16 KB cap: a 40 KB reply is exported whole (XM extractTurnText would cap it)', async () => {
        const c = await readClaudeConversation(ref);
        expect(c.turns[3].text.length).toBe(EXPECTED.longClaudeChars);
        const longLine = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.includes('"a-3"')) ?? '';
        const capped = extractTurnText(parseLine(longLine)!);
        expect(capped?.text.length).toBeLessThanOrEqual(16_384);
    });

    it('RL-3 tool calls of one request are merged into one assistant turn, as names', async () => {
        const c = await readClaudeConversation(ref);
        expect(c.turns[1].tools).toEqual(['Bash', 'Edit']);
        expect(c.turns[1].text).toBe('The build script bundles two entry points.');
    });

    it('RL-4 non-prompt records (queue operation, command marker, tool result) are not turns', async () => {
        const c = await readClaudeConversation(ref);
        const texts = c.turns.map((t) => t.text).join('\n');
        expect(texts).not.toContain('<command-name>');
        expect(texts).not.toContain('enqueue');
        expect(c.turns.filter((t) => t.role === 'user')).toHaveLength(2);
    });

    it('RL-5 an unknown record type is tolerated', async () => {
        const c = await readClaudeConversation(ref);
        expect(c.turns).toHaveLength(4);
        expect(c.startedAt).toBe(new Date(Date.parse(EXPECTED.now) - 120 * 60_000).toISOString());
    });
});
