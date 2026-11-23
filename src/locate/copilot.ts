/**
 * Copilot Chat sessions in a VS Code user folder.
 *
 *   <userDir>/workspaceStorage/<hash>/chatSessions/<id>.json|.jsonl   (one folder per workspace)
 *   <userDir>/globalStorage/emptyWindowChatSessions/<id>.json|.jsonl  (chats with no folder open)
 *
 * Checked on VS Code 1.147 (Windows): both .json and .jsonl sessions occur in chatSessions and in
 * emptyWindowChatSessions; every workspace folder had a workspace.json with a `folder` URI.
 * Listing reads only workspace.json (to name the project) and stats: no session content (test L-6).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { SessionRef } from '../model';
import { realpathWithin } from './safe-path';

const SESSION_FILE = /\.(json|jsonl)$/i;

/** The folder name of a workspace.json `folder` / `workspace` URI; undefined when unreadable. */
export function workspaceName(workspaceJsonText: string): string | undefined {
    try {
        const j = JSON.parse(workspaceJsonText) as { folder?: unknown; workspace?: unknown };
        const uri = typeof j.folder === 'string' ? j.folder : typeof j.workspace === 'string' ? j.workspace : undefined;
        if (!uri) { return undefined; }
        const last = uri.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';
        const name = decodeURIComponent(last).replace(/\.code-workspace$/i, '');
        return name || undefined;
    } catch {
        return undefined;
    }
}

function listSessions(dir: string, root: string, project: string | undefined, editor: string, out: SessionRef[]): void {
    let names: string[];
    try { names = fs.readdirSync(dir); } catch { return; }
    for (const name of names) {
        if (!SESSION_FILE.test(name)) { continue; }
        const real = realpathWithin(path.join(dir, name), root);
        if (!real) { continue; }
        let st: fs.Stats;
        try { st = fs.statSync(real); } catch { continue; }
        if (!st.isFile()) { continue; }
        out.push({
            assistant: 'copilot',
            id: `copilot:${name.replace(SESSION_FILE, '')}`,
            file: real,
            project,
            size: st.size,
            mtimeMs: st.mtimeMs,
            editor,
        });
    }
}

/** `readText` is the only content read (workspace.json); injectable so test L-6 can record every read. */
export function findCopilotSessions(userDir: string, editor = 'Code', readText: (file: string) => string = (f) => fs.readFileSync(f, 'utf8')): SessionRef[] {
    const out: SessionRef[] = [];
    const wsRoot = path.join(userDir, 'workspaceStorage');
    let hashes: string[] = [];
    try { hashes = fs.readdirSync(wsRoot); } catch { /* no workspaces */ }
    for (const h of hashes) {
        const chatDir = path.join(wsRoot, h, 'chatSessions');
        if (!fs.existsSync(chatDir)) { continue; }
        let project: string | undefined;
        try { project = workspaceName(readText(path.join(wsRoot, h, 'workspace.json'))); } catch { project = undefined; }
        listSessions(chatDir, userDir, project, editor, out);
    }
    listSessions(path.join(userDir, 'globalStorage', 'emptyWindowChatSessions'), userDir, undefined, editor, out);
    return out;
}
