/**
 * The "My chats" page. Static HTML: no script, CSP default-src 'none', every title escaped.
 * Buttons are command: links. Counts show at once; the token line fills in when the count resolves.
 */
import type * as vscodeTypes from 'vscode';
import { ASSISTANT_LABEL, ASSISTANTS, type SessionRef } from '../model';
import { svgSparkline } from '../render/sparkline';
import type { ChatStats } from '../stats/collect';
import type { RecentTokens, TokenTotals } from '../stats/tokens';

export function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function formatBytes(n: number): string {
    if (n >= 1024 ** 3) { return `${(n / 1024 ** 3).toFixed(1)} GB`; }
    if (n >= 1024 ** 2) { return `${(n / 1024 ** 2).toFixed(1)} MB`; }
    if (n >= 1024) { return `${(n / 1024).toFixed(0)} KB`; }
    return `${n} B`;
}

export function formatTokens(n: number): string {
    if (n >= 1e9) { return `${(n / 1e9).toFixed(1)} B`; }
    if (n >= 1e6) { return `${(n / 1e6).toFixed(1)} M`; }
    if (n >= 1e3) { return `${(n / 1e3).toFixed(1)} K`; }
    return String(n);
}

export const DASHBOARD_COMMANDS = ['axyomeLite.openConversation', 'axyomeLite.whereAreMyChats', 'axyomeLite.searchAllChats'] as const;

const cmd = (command: string, args?: unknown[]): string =>
    `command:${command}${args ? `?${encodeURIComponent(JSON.stringify(args))}` : ''}`;

function tokenLine(tokens: RecentTokens | 'counting'): string {
    if (tokens === 'counting') { return '<p class="tokens">Tokens, last 7 days: counting…</p>'; }
    const part = (label: string, t: TokenTotals | null): string | null => (t ? `${label} ${formatTokens(t.total)}` : null);
    const parts = [part('Claude Code', tokens.claude), part('Codex', tokens.codex)].filter((x): x is string => x !== null);
    const body = parts.length ? parts.join(' · ') : 'no Claude Code or Codex sessions found';
    const detail = [tokens.claude, tokens.codex]
        .map((t, i) => (t ? `${i === 0 ? 'Claude Code' : 'Codex'}: input ${formatTokens(t.input)}, output ${formatTokens(t.output)}, cache read ${formatTokens(t.cacheRead)}, cache write ${formatTokens(t.cacheWrite)}` : ''))
        .filter(Boolean).join(' — ');
    return `<p class="tokens" title="${escapeHtml(detail)}">Tokens, last 7 days: ${escapeHtml(body)}</p>`
        + '<p class="note">Copilot does not record tokens. Figures are the tokens Claude Code and Codex report in their own files.</p>';
}

export function renderDashboardHtml(stats: ChatStats, tokens: RecentTokens | 'counting', titleOf: (ref: Pick<SessionRef, 'id' | 'title'>) => string | undefined = (r) => r.title): string {
    const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src data:;";
    const total = ASSISTANTS.reduce((a, k) => a + stats.perAssistant[k], 0);
    const head = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>My chats</title>`
        + '<style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:12px 18px}'
        + 'svg rect{fill:var(--vscode-charts-blue,#3794ff)}.note{opacity:.75;font-size:.9em}a{color:var(--vscode-textLink-foreground)}'
        + 'li{margin:2px 0}.tokens{font-weight:600}</style></head><body>';
    if (total === 0) {
        return `${head}<h2>My chats</h2><p>No chats found.</p><p><a href="${cmd('axyomeLite.whereAreMyChats')}">Where did Axyome Lite look?</a></p></body></html>`;
    }
    const counts = ASSISTANTS.map((a) => `${escapeHtml(ASSISTANT_LABEL[a])} ${stats.perAssistant[a]}`).join(' · ');
    const storage = ASSISTANTS.map((a) => `${escapeHtml(ASSISTANT_LABEL[a])} ${formatBytes(stats.storage[a])}`).join(' · ');
    const largest = stats.largest.map((l) => {
        const t = titleOf(l) ?? l.id.split(':')[1] ?? l.id;
        return `<li><a href="${cmd('axyomeLite.openConversation', [l.id])}">${escapeHtml(t)}</a> (${escapeHtml(ASSISTANT_LABEL[l.assistant])}, ${formatBytes(l.size)})</li>`;
    }).join('');
    return `${head}<h2>My chats <span class="note">last ${stats.days} days</span></h2>`
        + `<p>${counts} chats</p>`
        + `${svgSparkline(stats.perDay.map((d) => d.count))}<p class="note">Chats changed per day (by last change)</p>`
        + `<p>Largest:</p><ul>${largest}</ul>`
        + `<p>Storage: ${storage}</p>`
        + tokenLine(tokens)
        + `<p>Per model, per hour, history, cost, Copilot activity, replay and memory: <a href="${cmd('axyomeLite.searchAllChats')}">Open in Axyome XM</a>`
        + ` · <a href="${cmd('axyomeLite.whereAreMyChats')}">Where are my chats?</a></p></body></html>`;
}

type Api = Pick<typeof vscodeTypes, 'window' | 'ViewColumn'>;

export class DashboardPanel {
    static current: DashboardPanel | undefined;
    private disposed = false;

    private constructor(private readonly panel: vscodeTypes.WebviewPanel) {
        panel.onDidDispose(() => { this.disposed = true; if (DashboardPanel.current === this) { DashboardPanel.current = undefined; } });
    }

    static show(api: Api): DashboardPanel {
        if (DashboardPanel.current && !DashboardPanel.current.disposed) {
            DashboardPanel.current.panel.reveal();
            return DashboardPanel.current;
        }
        const panel = api.window.createWebviewPanel('axyomeLite.dashboard', 'My chats', api.ViewColumn.Active, {
            enableScripts: false,
            // Least privilege: only the three commands the page links to can run from it.
            enableCommandUris: [...DASHBOARD_COMMANDS],
            localResourceRoots: [],
        });
        DashboardPanel.current = new DashboardPanel(panel);
        return DashboardPanel.current;
    }

    get isDisposed(): boolean { return this.disposed; }

    setHtml(html: string): void {
        if (!this.disposed) { this.panel.webview.html = html; }
    }
}
