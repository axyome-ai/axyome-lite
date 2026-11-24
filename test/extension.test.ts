/** X-1…X-7: activation, tree, preview, export and the XM hand-off, with the recording vscode mock. */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import type * as vscodeTypes from 'vscode';
import { COMMANDS, activate } from '../src/extension';
import type { SessionRef } from '../src/model';
import { ChatsTreeProvider, type ChatNode } from '../src/vscode/chats-tree';
import { ConversationDocumentProvider } from '../src/vscode/preview';
import { maybeShowXmHint, xmHandoff } from '../src/vscode/xm-handoff';
import { createMemento, createVscodeMock } from './__mocks__/vscode';
import { discoverAll } from '../src/locate';
import { peekSession } from '../src/read';
import { readHead } from '../src/read/line-stream';
import { escapeHtml } from '../src/vscode/dashboard';
import { makeTmpHome, tmpDir } from './helpers';

type Api = typeof vscodeTypes;
const asApi = (m: unknown): Api => m as Api;
const ctx = () => ({ subscriptions: [] as { dispose(): void }[], globalState: createMemento() });

const refs: SessionRef[] = [
    { assistant: 'claude', id: 'claude:1', file: '/x/1.jsonl', project: 'p1', size: 10, mtimeMs: 3 },
    { assistant: 'claude', id: 'claude:2', file: '/x/2.jsonl', project: 'p1', size: 10, mtimeMs: 2 },
    { assistant: 'copilot', id: 'copilot:3', file: '/x/3.json', project: 'w', size: 10, mtimeMs: 1 },
];

describe('extension', () => {
    it('X-1 activate registers the 8 commands, the view and the preview scheme', () => {
        const m = createVscodeMock();
        const c = ctx();
        activate(c as unknown as vscodeTypes.ExtensionContext, asApi(m));
        expect([...m.commandsRegistered.keys()].sort()).toEqual([...COMMANDS].sort());
        expect(m.calls.some((x) => x.name === 'window.registerTreeDataProvider' && x.args[0] === 'axyomeLite.chats')).toBe(true);
        expect(m.calls.some((x) => x.name === 'workspace.registerTextDocumentContentProvider' && x.args[0] === 'axyome-lite')).toBe(true);
        expect(c.subscriptions.length).toBeGreaterThanOrEqual(10);
    });

    it('X-2 tree levels: assistants → projects → conversations, with counts', () => {
        const m = createVscodeMock();
        const tree = new ChatsTreeProvider(asApi(m), (r) => ({ title: `T ${r.id}` }));
        tree.setSessions(refs);
        const top = tree.getChildren();
        expect(top.map((n) => (n as Extract<ChatNode, { kind: 'assistant' }>).assistant)).toEqual(['copilot', 'claude']);
        const claude = top.find((n) => n.kind === 'assistant' && n.assistant === 'claude')!;
        expect(tree.getTreeItem(claude).description).toBe('2');
        const projects = tree.getChildren(claude);
        expect(projects).toHaveLength(1);
        const convs = tree.getChildren(projects[0]);
        expect(convs.map((c) => (c as Extract<ChatNode, { kind: 'conversation' }>).ref.id)).toEqual(['claude:1', 'claude:2']);
        expect(tree.getTreeItem(convs[0]).command?.arguments).toEqual(['claude:1']);
    });

    it('X-3 the preview provider returns registered text and never writes', () => {
        const p = new ConversationDocumentProvider();
        const uri = p.put('claude/1.md', '# hello\n');
        expect(uri).toBe('axyome-lite:/claude/1.md');
        expect(p.provideTextDocumentContent({ path: '/claude/1.md' } as vscodeTypes.Uri)).toBe('# hello\n');
        expect(p.provideTextDocumentContent({ path: '/missing.md' } as vscodeTypes.Uri)).toContain('Not available');
    });

    it('X-4 export uses the save dialog and writes once to the chosen path', async () => {
        const dest = path.join(tmpDir(), 'out.md');
        const m = createVscodeMock({ saveTarget: dest });
        const c = ctx();
        activate(c as unknown as vscodeTypes.ExtensionContext, asApi(m));
        await m.commands.executeCommand('axyomeLite.refresh');
        const fixtureFile = path.join(__dirname, 'fixtures', 'claude-session.jsonl');
        const node: ChatNode = { kind: 'conversation', ref: { assistant: 'claude', id: 'claude:fx', file: fixtureFile, size: 1, mtimeMs: 1 } };
        await m.commands.executeCommand('axyomeLite.exportConversation', node);
        expect(m.calls.filter((x) => x.name === 'window.showSaveDialog')).toHaveLength(1);
        expect(fs.readFileSync(dest, 'utf8')).toContain('# Build script walkthrough');
    });

    it('X-5 hand-off with Axyome XM installed runs its dashboard command', async () => {
        const m = createVscodeMock({ xmInstalled: true });
        expect(await xmHandoff(asApi(m))).toBe('xm');
        expect(m.calls.some((x) => x.name === 'commands.executeCommand' && x.args[0] === 'axyome-xm.showDashboard')).toBe(true);
        expect(m.calls.some((x) => x.name === 'env.openExternal')).toBe(false);
    });

    it('X-6 without XM: opens the listing; the hint shows once only', async () => {
        const m = createVscodeMock({ xmInstalled: false });
        expect(await xmHandoff(asApi(m))).toBe('listing');
        expect(m.calls.find((x) => x.name === 'env.openExternal')?.args[0]).toContain('itemName=axyome-ai.axyome-ai-xm');
        const state = createMemento();
        expect(await maybeShowXmHint(asApi(m), state as unknown as vscodeTypes.Memento)).toBe(true);
        expect(await maybeShowXmHint(asApi(m), state as unknown as vscodeTypes.Memento)).toBe(false);
        expect(m.calls.filter((x) => x.name === 'window.showInformationMessage')).toHaveLength(1);
    });

    it('X-7 (#348) the My chats page names the largest chats by title, as the Chats view does', async () => {
        const h = makeTmpHome();
        const saved = { HOME: process.env.HOME, CODEX_HOME: process.env.CODEX_HOME };
        process.env.HOME = h.home;
        delete process.env.CODEX_HOME;
        try {
            const m = createVscodeMock();
            activate(ctx() as unknown as vscodeTypes.ExtensionContext, asApi(m));
            await m.commands.executeCommand('axyomeLite.showDashboard');
            const html = m.panels[m.panels.length - 1].html;
            const list = html.slice(html.indexOf('<p>Largest:</p>'), html.indexOf('</ul>'));
            const shown = [...list.matchAll(/<li><a href="[^"]*">([^<]*)<\/a> \(([^,]+),/g)].map((x) => ({ text: x[1], assistant: x[2] }));
            expect(shown.map((s) => s.assistant)).toEqual(expect.arrayContaining(['Claude Code', 'Copilot']));
            const d = await discoverAll({ platform: 'linux', home: h.home, env: {} });
            // Each row: the indexed title, else the head-peek title, else (no title anywhere) the 8-character short ID.
            const label = (s: SessionRef): string => escapeHtml(s.title ?? peekSession(s, (f) => readHead(f, 64 * 1024)).title ?? s.id.split(':')[1].slice(0, 8));
            const expected = new Set(d.sessions.map(label));
            for (const s of shown) {
                expect(expected.has(s.text)).toBe(true);
                expect(s.text).not.toMatch(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/i);
            }
            expect(shown.find((s) => s.assistant === 'Claude Code')?.text).toBe('Build script walkthrough');
            expect(shown.find((s) => s.assistant === 'Copilot')?.text).toBe('How do I read a file in Node?');
        } finally {
            for (const [k, v] of Object.entries(saved)) { if (v === undefined) { delete process.env[k]; } else { process.env[k] = v; } }
        }
    });
});
