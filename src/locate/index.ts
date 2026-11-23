/**
 * One entry point that finds every root and session (shared by the CLI and the extension).
 */
import * as fs from 'fs';
import * as os from 'os';
import type { EditorDir, SessionRef } from '../model';
import { defaultClaudeProjectsDir, findClaudeSessions, findClaudeSubagentFiles } from './claude';
import { codexHomeFor, findCodexSessions } from './codex';
import { findCopilotSessions } from './copilot';
import { resolveEditorUserDirs } from './editor-dirs';

export interface DiscoverOptions {
    platform?: string;
    env?: Record<string, string | undefined>;
    home?: string;
    extraVsCodeUserDirs?: readonly string[];
    codexHomeSetting?: string;
}

export interface RootReport {
    assistant: SessionRef['assistant'];
    editor?: string;
    path: string;
    exists: boolean;
    files: number;
    bytes: number;
}

export interface Discovery {
    roots: RootReport[];
    sessions: SessionRef[];
    editorDirs: EditorDir[];
    /** Claude Code subagent transcripts (token line only; not listed as chats). */
    claudeSubagents: { file: string; mtimeMs: number }[];
}

export async function discoverAll(opts: DiscoverOptions = {}): Promise<Discovery> {
    const platform = opts.platform ?? process.platform;
    const env = opts.env ?? process.env;
    const home = opts.home ?? os.homedir();
    const editorDirs = resolveEditorUserDirs(platform, env, home, opts.extraVsCodeUserDirs ?? []);
    const roots: RootReport[] = [];
    const sessions: SessionRef[] = [];
    const sum = (refs: SessionRef[]): { files: number; bytes: number } =>
        ({ files: refs.length, bytes: refs.reduce((a, r) => a + r.size, 0) });

    if (editorDirs.length === 0) {
        roots.push({ assistant: 'copilot', path: '(no VS Code user folder found)', exists: false, files: 0, bytes: 0 });
    }
    for (const d of editorDirs) {
        const refs = findCopilotSessions(d.path, d.product);
        sessions.push(...refs);
        roots.push({ assistant: 'copilot', editor: d.product, path: d.path, exists: true, ...sum(refs) });
    }

    const claudeRoot = defaultClaudeProjectsDir(home);
    const claude = findClaudeSessions(claudeRoot);
    sessions.push(...claude);
    roots.push({ assistant: 'claude', path: claudeRoot, exists: claude.length > 0 || fs.existsSync(claudeRoot), ...sum(claude) });

    const codexHome = codexHomeFor(opts.codexHomeSetting, env as NodeJS.ProcessEnv, home);
    const codex = await findCodexSessions(codexHome);
    sessions.push(...codex);
    roots.push({ assistant: 'codex', path: codexHome, exists: codex.length > 0 || fs.existsSync(codexHome), ...sum(codex) });

    sessions.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return { roots, sessions, editorDirs, claudeSubagents: findClaudeSubagentFiles(claudeRoot) };
}

/** The "where are my chats" report as Markdown (shared by `axyome-lite where` and the VS Code command). */
export function whereReportMarkdown(d: Discovery): string {
    const label: Record<RootReport['assistant'], string> = { copilot: 'Copilot', claude: 'Claude Code', codex: 'Codex' };
    const mb = (n: number): string => `${(n / 1048576).toFixed(1)} MB`;
    const lines = ['# Where are my chats?', '', '| Assistant | Editor | Folder | Chats | Size |', '|---|---|---|---|---|'];
    for (const r of d.roots) {
        lines.push(`| ${label[r.assistant]} | ${r.editor ?? '—'} | \`${r.path}\` | ${r.exists ? r.files : 'not found'} | ${r.exists ? mb(r.bytes) : '—'} |`);
    }
    lines.push('', 'Copilot keeps one folder per workspace (`workspaceStorage/<id>/chatSessions`) plus `globalStorage/emptyWindowChatSessions`.',
        'Claude Code keeps one `.jsonl` per session per project. Codex keeps `sessions/YYYY/MM/DD/rollout-*.jsonl`.', '');
    return lines.join('\n');
}

/** The scanned roots, for refusing an export target inside an assistant's own store. */
export function storeRoots(d: Discovery): string[] {
    return d.roots.filter((r) => r.exists).map((r) => r.path);
}
