/** Axyome Lite activation: the Chats view, the commands and the "My chats" page. */
import * as fs from 'fs';
import * as path from 'path';
// Type-only: the runtime module is loaded in activate(), so tests can inject the API (no vitest alias config).
import type * as vscode from 'vscode';
import { LiteError, type SessionRef } from './model';
import { discoverAll, storeRoots, whereReportMarkdown, type Discovery } from './locate';
import { exportTargetProblem } from './locate/safe-path';
import { readConversation } from './read';
import { renderConversationMarkdown } from './render/markdown';
import { collectChatStats } from './stats/collect';
import { sumRecentTokens } from './stats/tokens';
import { ChatsTreeProvider, type ChatNode } from './vscode/chats-tree';
import { DashboardPanel, renderDashboardHtml } from './vscode/dashboard';
import { ConversationDocumentProvider, PREVIEW_SCHEME } from './vscode/preview';
import { maybeShowXmHint, xmHandoff } from './vscode/xm-handoff';

export const COMMANDS = [
    'axyomeLite.showChats',
    'axyomeLite.whereAreMyChats',
    'axyomeLite.openConversation',
    'axyomeLite.exportConversation',
    'axyomeLite.copyConversation',
    'axyomeLite.searchAllChats',
    'axyomeLite.showDashboard',
    'axyomeLite.refresh',
] as const;

function settings(api: typeof vscode): { redact: boolean; footer: boolean; extra: string[]; codexHome: string; days: number } {
    const c = api.workspace.getConfiguration('axyomeLite');
    return {
        redact: c.get<boolean>('export.redactSecrets', true),
        footer: c.get<boolean>('export.footer', true),
        extra: c.get<string[]>('extraVsCodeUserDirs', []),
        codexHome: c.get<string>('codexHome', ''),
        days: c.get<number>('dashboard.days', 30),
    };
}

function refOf(arg: unknown, sessions: readonly SessionRef[]): SessionRef | undefined {
    if (typeof arg === 'string') { return sessions.find((s) => s.id === arg); }
    const node = arg as ChatNode | undefined;
    return node && node.kind === 'conversation' ? node.ref : undefined;
}

function safeFileName(title: string): string {
    return (title.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'chat') + '.md';
}

export function activate(context: vscode.ExtensionContext, api: typeof vscode = require('vscode') as typeof vscode): void {
    const tree = new ChatsTreeProvider(api);
    const docs = new ConversationDocumentProvider();
    let discovery: Discovery | undefined;

    const refresh = async (): Promise<Discovery> => {
        const s = settings(api);
        discovery = await discoverAll({ extraVsCodeUserDirs: s.extra, codexHomeSetting: s.codexHome });
        tree.setSessions(discovery.sessions);
        return discovery;
    };
    const current = async (): Promise<Discovery> => discovery ?? refresh();

    const render = async (ref: SessionRef): Promise<{ md: string; title: string }> => {
        const s = settings(api);
        const conv = await readConversation(ref);
        return { md: renderConversationMarkdown(conv, { redact: s.redact, footer: s.footer }), title: conv.title };
    };

    const withRef = (fn: (ref: SessionRef) => Promise<void>) => async (arg: unknown): Promise<void> => {
        const d = await current();
        const ref = refOf(arg, d.sessions);
        if (!ref) { void api.window.showWarningMessage('Axyome Lite: pick a conversation in the Chats view.'); return; }
        try { await fn(ref); } catch (e) {
            void api.window.showErrorMessage(`Axyome Lite: ${e instanceof LiteError ? e.message : (e as Error).message}`);
        }
    };

    context.subscriptions.push(
        api.window.registerTreeDataProvider('axyomeLite.chats', tree),
        api.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, docs),
        api.commands.registerCommand('axyomeLite.showChats', async () => { await api.commands.executeCommand('axyomeLite.chats.focus'); }),
        api.commands.registerCommand('axyomeLite.refresh', async () => { await refresh(); }),
        api.commands.registerCommand('axyomeLite.whereAreMyChats', async () => {
            const uri = api.Uri.parse(docs.put('where-are-my-chats.md', whereReportMarkdown(await current())));
            const doc = await api.workspace.openTextDocument(uri);
            await api.languages.setTextDocumentLanguage(doc, 'markdown');
            await api.window.showTextDocument(doc, { preview: true });
        }),
        api.commands.registerCommand('axyomeLite.openConversation', withRef(async (ref) => {
            const { md } = await render(ref);
            const uri = api.Uri.parse(docs.put(`${ref.id.replace(':', '/')}.md`, md));
            const doc = await api.workspace.openTextDocument(uri);
            await api.languages.setTextDocumentLanguage(doc, 'markdown');
            await api.window.showTextDocument(doc, { preview: true });
        })),
        api.commands.registerCommand('axyomeLite.exportConversation', withRef(async (ref) => {
            const { md, title } = await render(ref);
            const folder = api.workspace.workspaceFolders?.[0]?.uri;
            const target = await api.window.showSaveDialog({
                defaultUri: folder ? api.Uri.joinPath(folder, safeFileName(title)) : undefined,
                filters: { Markdown: ['md'] },
                saveLabel: 'Export chat',
            });
            if (!target) { return; }
            // The save dialog already confirmed any overwrite, so force is true; the store check still applies.
            const problem = exportTargetProblem(target.fsPath, storeRoots(await current()), true);
            if (problem) { void api.window.showErrorMessage(`Axyome Lite: ${problem}`); return; }
            fs.writeFileSync(target.fsPath, md, 'utf8');
            void api.window.showInformationMessage(`Axyome Lite: exported to ${path.basename(target.fsPath)}`);
            await maybeShowXmHint(api, context.globalState);
        })),
        api.commands.registerCommand('axyomeLite.copyConversation', withRef(async (ref) => {
            const { md } = await render(ref);
            await api.env.clipboard.writeText(md);
            void api.window.showInformationMessage('Axyome Lite: conversation copied as Markdown.');
        })),
        api.commands.registerCommand('axyomeLite.searchAllChats', async () => { await xmHandoff(api); }),
        api.commands.registerCommand('axyomeLite.showDashboard', async () => {
            const panel = DashboardPanel.show(api);
            const d = await refresh();
            const stats = collectChatStats(d.sessions, { days: settings(api).days });
            // Same titles as the Chats view: the indexed title, else the head peek (only the few "Largest" rows ask).
            const byId = new Map(d.sessions.map((s) => [s.id, s]));
            const titleOf = (r: { id: string; title?: string }): string | undefined => {
                const ref = byId.get(r.id);
                return ref ? tree.titleOf(ref) : r.title;
            };
            panel.setHtml(renderDashboardHtml(stats, 'counting', titleOf));
            const signal = { get aborted(): boolean { return panel.isDisposed; } };
            const tokens = await sumRecentTokens(d.sessions, { signal, claudeSubagentFiles: d.claudeSubagents });
            if (!panel.isDisposed) { panel.setHtml(renderDashboardHtml(stats, tokens, titleOf)); }
        }),
    );
    void refresh();
}

export function deactivate(): void { /* nothing to release: Lite holds no files open */ }
