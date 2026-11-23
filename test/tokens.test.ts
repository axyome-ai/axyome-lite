/** K-1…K-6: the 7-day token line (XM extractors, XM dedupe keys, window by record time). */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import type { SessionRef } from '../src/model';
import { sumRecentTokens } from '../src/stats/tokens';
import { EXPECTED, FIXTURES, NOW_MS, setMtime, tmpDir } from './helpers';

const ref = (assistant: SessionRef['assistant'], file: string, mtimeMs = NOW_MS): SessionRef =>
    ({ assistant, id: `${assistant}:${path.basename(file)}`, file, size: fs.statSync(file).size, mtimeMs });

describe('sumRecentTokens', () => {
    it('K-1 Claude Code totals equal the hand-computed constants', async () => {
        const t = await sumRecentTokens([ref('claude', path.join(FIXTURES, 'claude-session.jsonl'))], { now: NOW_MS });
        expect(t.claude).toEqual(EXPECTED.claude);
    });

    it('K-2 a duplicated (request_id, timestamp) is counted once', async () => {
        const t = await sumRecentTokens([ref('claude', path.join(FIXTURES, 'claude-usage-dup.jsonl'))], { now: NOW_MS });
        expect(t.claude?.total).toBe(EXPECTED.claudeDup.dedupedTotal);
        expect(t.claude?.total).not.toBe(EXPECTED.claudeDup.naiveInWindowTotal);
    });

    it('K-3 the window is by record timestamp: 167 h counted, 169 h not', async () => {
        const t = await sumRecentTokens([ref('claude', path.join(FIXTURES, 'claude-usage-dup.jsonl'))], { now: NOW_MS, hours: 168 });
        expect(t.claude?.records).toBe(2);
        const wider = await sumRecentTokens([ref('claude', path.join(FIXTURES, 'claude-usage-dup.jsonl'))], { now: NOW_MS, hours: 170 });
        expect(wider.claude?.records).toBe(3);
    });

    it('K-4 Codex per-turn values sum to the final cumulative total, duplicates and null info ignored', async () => {
        const t = await sumRecentTokens([ref('codex', path.join(FIXTURES, 'codex-rollout.jsonl'))], { now: NOW_MS });
        expect(t.codex).toEqual({ input: EXPECTED.codex.input, output: EXPECTED.codex.output, cacheRead: EXPECTED.codex.cacheRead, cacheWrite: 0, total: EXPECTED.codex.total, records: EXPECTED.codex.records });
        expect(t.codex?.total).toBe(EXPECTED.codex.finalCumulative);
    });

    it('K-5 Copilot has no tokens: null, not 0', async () => {
        const t = await sumRecentTokens([ref('copilot', path.join(FIXTURES, 'copilot-legacy.json'))], { now: NOW_MS });
        expect(t.copilot).toBeNull();
        expect(t.claude).toBeNull();
        expect(t.codex).toBeNull();
    });

    it('K-7 Claude Code subagent transcripts are counted, deduplicated with the main file', async () => {
        const main = path.join(FIXTURES, 'claude-session.jsonl');
        const dup = path.join(FIXTURES, 'claude-usage-dup.jsonl');
        const t = await sumRecentTokens([ref('claude', main)], { now: NOW_MS, claudeSubagentFiles: [{ file: dup, mtimeMs: NOW_MS }, { file: main, mtimeMs: NOW_MS }] });
        expect(t.claude?.total).toBe(EXPECTED.claude.total + EXPECTED.claudeDup.dedupedTotal);
        expect(t.claude?.records).toBe(EXPECTED.claude.records + 2);
    });

    it('K-6 files last changed before the window are never opened', async () => {
        const dir = tmpDir();
        const files = ['a', 'b', 'old'].map((n) => {
            const f = path.join(dir, `${n}.jsonl`);
            fs.copyFileSync(path.join(FIXTURES, 'claude-session.jsonl'), f);
            return f;
        });
        setMtime(files[2], NOW_MS - 10 * 86_400_000);
        const opened: string[] = [];
        const spyOpen = ((p: fs.PathLike, o?: unknown) => { opened.push(String(p)); return fs.createReadStream(p, o as never); }) as typeof fs.createReadStream;
        const refs = files.map((f) => ref('claude', f, fs.statSync(f).mtimeMs));
        const t = await sumRecentTokens(refs, { now: NOW_MS, createReadStream: spyOpen });
        expect(opened.sort()).toEqual([files[0], files[1]].sort());
        expect(t.filesRead).toBe(2);
    });
});
