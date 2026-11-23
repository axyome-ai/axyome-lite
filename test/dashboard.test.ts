/** DB-1…DB-5: the "My chats" page is static, strict and escaped. */
import { describe, expect, it } from 'vitest';
import type * as vscodeTypes from 'vscode';
import type { ChatStats } from '../src/stats/collect';
import type { RecentTokens } from '../src/stats/tokens';
import { DASHBOARD_COMMANDS, DashboardPanel, renderDashboardHtml } from '../src/vscode/dashboard';
import { createVscodeMock } from './__mocks__/vscode';

const stats = (over: Partial<ChatStats> = {}): ChatStats => ({
    days: 30,
    perAssistant: { copilot: 23, claude: 140, codex: 9 },
    perDay: Array.from({ length: 30 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, count: i % 4 })),
    largest: [{ id: 'claude:abc', assistant: 'claude', file: '/x', size: 2_200_000, title: 'Fix vitest shard' }],
    storage: { copilot: 48 * 1048576, claude: 310 * 1048576, codex: 6 * 1048576 },
    ...over,
});
const tokens: RecentTokens = {
    hours: 168, filesRead: 3, copilot: null,
    claude: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 4_200_000, records: 9 },
    codex: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 300_000, records: 2 },
};

describe('dashboard', () => {
    it('DB-1 content: counts, token line, the Copilot note and the XM link', () => {
        const html = renderDashboardHtml(stats(), tokens);
        expect(html).toContain('Copilot 23 · Claude Code 140 · Codex 9');
        expect(html).toContain('Tokens, last 7 days: Claude Code 4.2 M · Codex 300.0 K');
        expect(html).toContain('Copilot does not record tokens');
        expect(html).toContain('href="command:axyomeLite.searchAllChats"');
    });

    it('DB-2 no script, strict CSP, no remote source', () => {
        const html = renderDashboardHtml(stats(), tokens);
        expect(html).not.toMatch(/<script/i);
        expect(html).toContain("default-src 'none'");
        expect(html).not.toMatch(/src="https?:/i);
    });

    it('DB-3 the panel runs no scripts and allows only its own three commands', () => {
        const m = createVscodeMock();
        DashboardPanel.current = undefined;
        DashboardPanel.show(m as unknown as typeof vscodeTypes);
        const call = m.calls.find((c) => c.name === 'window.createWebviewPanel');
        const options = call?.args[3] as { enableScripts: boolean; enableCommandUris: string[] };
        expect(options.enableScripts).toBe(false);
        expect(options.enableCommandUris).toEqual([...DASHBOARD_COMMANDS]);
    });

    it('DB-4 empty state links to the where report', () => {
        const html = renderDashboardHtml(stats({ perAssistant: { copilot: 0, claude: 0, codex: 0 }, largest: [] }), 'counting');
        expect(html).toContain('No chats found');
        expect(html).toContain('command:axyomeLite.whereAreMyChats');
    });

    it('DB-5 titles are HTML-escaped', () => {
        const evil = '<img src=x onerror=1>';
        const html = renderDashboardHtml(stats({ largest: [{ id: 'claude:e', assistant: 'claude', file: '/e', size: 10, title: evil }] }), tokens);
        expect(html).toContain('&lt;img src=x onerror=1&gt;');
        expect(html).not.toContain(evil);
    });
});
