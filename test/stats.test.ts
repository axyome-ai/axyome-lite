/** D-1…D-4, SP-1, SP-2: dashboard counts from metadata, and the sparkline. */
import * as fs from 'fs';
import { describe, expect, it } from 'vitest';
import { findClaudeSessions } from '../src/locate/claude';
import { findCodexSessions } from '../src/locate/codex';
import { findCopilotSessions } from '../src/locate/copilot';
import type { SessionRef } from '../src/model';
import { svgSparkline } from '../src/render/sparkline';
import { collectChatStats, localDate } from '../src/stats/collect';
import { NOW_MS, makeTmpHome, setMtime } from './helpers';

async function refsOf(h: ReturnType<typeof makeTmpHome>): Promise<SessionRef[]> {
    return [...findCopilotSessions(h.userDir), ...findClaudeSessions(h.claudeRoot), ...await findCodexSessions(h.codexHome)];
}

describe('collectChatStats', () => {
    it('D-1 counts per assistant equal the listing', async () => {
        const h = makeTmpHome();
        const refs = await refsOf(h);
        expect(collectChatStats(refs, { now: NOW_MS }).perAssistant).toEqual({ copilot: 3, claude: 2, codex: 1 });
    });

    it('D-2 per-day buckets by last change in local days; older than the window excluded', async () => {
        const h = makeTmpHome();
        setMtime(h.files.claude1, NOW_MS - 2 * 86_400_000);
        setMtime(h.files.claude2, NOW_MS - 40 * 86_400_000);
        const refs = await refsOf(h);
        for (const f of [h.files.copilotWs1, h.files.copilotWs2, h.files.copilotEmpty, h.files.codex1]) { setMtime(f, NOW_MS - 60 * 86_400_000); }
        const s = collectChatStats(await refsOf(h), { days: 30, now: NOW_MS });
        expect(s.perDay).toHaveLength(30);
        expect(s.perDay[29].date).toBe(localDate(NOW_MS));
        const day = localDate(NOW_MS - 2 * 86_400_000);
        expect(s.perDay.find((d) => d.date === day)?.count).toBe(1);
        expect(s.perDay.reduce((a, d) => a + d.count, 0)).toBe(1);
        expect(refs.length).toBe(6);
    });

    it('D-3 the largest chats, at most 5, sorted by size', async () => {
        const h = makeTmpHome();
        const s = collectChatStats(await refsOf(h), { now: NOW_MS });
        expect(s.largest).toHaveLength(5);
        expect(s.largest[0].file).toBe(fs.realpathSync(h.files.claude1));
        expect(s.largest.map((l) => l.size)).toEqual([...s.largest.map((l) => l.size)].sort((a, b) => b - a));
    });

    it('D-4 storage per assistant is the sum of the in-root file sizes', async () => {
        const h = makeTmpHome();
        const s = collectChatStats(await refsOf(h), { now: NOW_MS });
        const size = (f: string): number => fs.statSync(f).size;
        expect(s.storage.claude).toBe(size(h.files.claude1) + size(h.files.claude2));
        expect(s.storage.copilot).toBe(size(h.files.copilotWs1) + size(h.files.copilotWs2) + size(h.files.copilotEmpty));
        expect(s.storage.codex).toBe(size(h.files.codex1));
    });
});

describe('svgSparkline', () => {
    it('SP-1 one bar per value; the tallest has the full height; no script', () => {
        const svg = svgSparkline([0, 2, 4], { width: 30, height: 40 });
        expect(svg.match(/<rect /g)).toHaveLength(3);
        expect(svg).toContain('y="0" width="9.00" height="40"');
        expect(svg).not.toContain('<script');
    });

    it('SP-2 all zero: zero-height bars and no NaN', () => {
        const svg = svgSparkline([0, 0, 0]);
        expect(svg.match(/height="0"/g)).toHaveLength(3);
        expect(svg).not.toContain('NaN');
    });
});
