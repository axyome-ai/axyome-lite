/**
 * A recording mock of the VS Code API surface Axyome Lite uses (signatures as in @types/vscode 1.90).
 * Each call is recorded in `calls`, so tests assert real side effects. Create a fresh mock per test.
 */
import * as path from 'path';

export interface Recorded { name: string; args: unknown[] }

export function createVscodeMock(opts: { xmInstalled?: boolean; saveTarget?: string; config?: Record<string, unknown>; pick?: string } = {}) {
    const calls: Recorded[] = [];
    const commands = new Map<string, (...a: unknown[]) => unknown>();
    const state = new Map<string, unknown>();

    class Uri {
        constructor(readonly scheme: string, readonly path: string, readonly fsPath: string) {}
        static parse(s: string): Uri {
            const i = s.indexOf(':');
            const scheme = s.slice(0, i);
            const rest = s.slice(i + 1);
            return new Uri(scheme, rest, rest);
        }
        static file(p: string): Uri { return new Uri('file', p.replace(/\\/g, '/'), p); }
        static joinPath(base: Uri, ...parts: string[]): Uri { return Uri.file(path.join(base.fsPath, ...parts)); }
        toString(): string { return `${this.scheme}:${this.path}`; }
    }

    class EventEmitter<T> {
        private listeners: ((e: T) => void)[] = [];
        readonly event = (l: (e: T) => void): { dispose(): void } => { this.listeners.push(l); return { dispose: () => undefined }; };
        fire(e: T): void { for (const l of this.listeners) { l(e); } calls.push({ name: 'EventEmitter.fire', args: [e] }); }
        dispose(): void { this.listeners = []; }
    }

    class TreeItem {
        description?: string;
        tooltip?: string;
        contextValue?: string;
        command?: { command: string; title: string; arguments?: unknown[] };
        constructor(readonly label: string, readonly collapsibleState: number) {}
    }

    const panels: { html: string; disposeHandlers: (() => void)[]; revealed: number }[] = [];

    const api = {
        calls,
        commandsRegistered: commands,
        globalStateMap: state,
        panels,
        Uri,
        EventEmitter,
        TreeItem,
        ThemeIcon: class { constructor(readonly id: string) {} },
        TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
        ViewColumn: { Active: -1, One: 1 },
        extensions: {
            getExtension: (id: string): unknown => { calls.push({ name: 'extensions.getExtension', args: [id] }); return opts.xmInstalled ? { id } : undefined; },
        },
        commands: {
            registerCommand: (id: string, fn: (...a: unknown[]) => unknown) => { commands.set(id, fn); return { dispose: () => commands.delete(id) }; },
            executeCommand: async (id: string, ...args: unknown[]): Promise<unknown> => {
                calls.push({ name: 'commands.executeCommand', args: [id, ...args] });
                const fn = commands.get(id);
                return fn ? fn(...args) : undefined;
            },
        },
        env: {
            openExternal: async (u: Uri): Promise<boolean> => { calls.push({ name: 'env.openExternal', args: [u.toString()] }); return true; },
            clipboard: { writeText: async (t: string): Promise<void> => { calls.push({ name: 'env.clipboard.writeText', args: [t] }); } },
        },
        window: {
            registerTreeDataProvider: (id: string, p: unknown) => { calls.push({ name: 'window.registerTreeDataProvider', args: [id, p] }); return { dispose: () => undefined }; },
            showInformationMessage: async (msg: string, ...items: string[]): Promise<string | undefined> => { calls.push({ name: 'window.showInformationMessage', args: [msg, ...items] }); return opts.pick; },
            showWarningMessage: async (msg: string): Promise<undefined> => { calls.push({ name: 'window.showWarningMessage', args: [msg] }); return undefined; },
            showErrorMessage: async (msg: string): Promise<undefined> => { calls.push({ name: 'window.showErrorMessage', args: [msg] }); return undefined; },
            showSaveDialog: async (o: unknown): Promise<Uri | undefined> => { calls.push({ name: 'window.showSaveDialog', args: [o] }); return opts.saveTarget ? Uri.file(opts.saveTarget) : undefined; },
            showTextDocument: async (d: unknown, o?: unknown): Promise<unknown> => { calls.push({ name: 'window.showTextDocument', args: [d, o] }); return {}; },
            createWebviewPanel: (viewType: string, title: string, column: number, options: unknown) => {
                calls.push({ name: 'window.createWebviewPanel', args: [viewType, title, column, options] });
                const p = { html: '', disposeHandlers: [] as (() => void)[], revealed: 0 };
                panels.push(p);
                return {
                    webview: { get html() { return p.html; }, set html(v: string) { p.html = v; } },
                    reveal: () => { p.revealed += 1; },
                    onDidDispose: (h: () => void) => { p.disposeHandlers.push(h); return { dispose: () => undefined }; },
                    dispose: () => { for (const h of p.disposeHandlers) { h(); } },
                };
            },
        },
        workspace: {
            workspaceFolders: undefined as unknown,
            getConfiguration: (section: string) => ({
                get: <T>(key: string, def: T): T => {
                    const v = opts.config?.[`${section}.${key}`];
                    return (v === undefined ? def : v) as T;
                },
            }),
            registerTextDocumentContentProvider: (scheme: string, p: unknown) => { calls.push({ name: 'workspace.registerTextDocumentContentProvider', args: [scheme, p] }); return { dispose: () => undefined }; },
            openTextDocument: async (u: Uri): Promise<unknown> => { calls.push({ name: 'workspace.openTextDocument', args: [u.toString()] }); return { uri: u }; },
        },
        languages: {
            setTextDocumentLanguage: async (d: unknown, lang: string): Promise<unknown> => { calls.push({ name: 'languages.setTextDocumentLanguage', args: [lang] }); return d; },
        },
    };
    return api;
}

export function createMemento(): { get<T>(k: string): T | undefined; update(k: string, v: unknown): Promise<void>; keys(): readonly string[]; map: Map<string, unknown> } {
    const map = new Map<string, unknown>();
    return {
        map,
        get: <T>(k: string): T | undefined => map.get(k) as T | undefined,
        update: async (k: string, v: unknown): Promise<void> => { map.set(k, v); },
        keys: () => [...map.keys()],
    };
}

