/**
 * Claude Code sessions, ~/.claude/projects/<project-slug>/<sessionId>.jsonl (the same root Axyome XM watches).
 *
 * Subagent transcripts live at <slug>/<sessionId>/subagents/agent-*.jsonl; v0.1 lists the main
 * sessions only. Listing reads no content.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { SessionRef } from '../model';
import { realpathWithin } from './safe-path';

export function defaultClaudeProjectsDir(home: string = os.homedir()): string {
    return path.join(home, '.claude', 'projects');
}

/**
 * Subagent transcripts, <slug>/<sessionId>/subagents/*.jsonl (hundreds on a busy machine).
 * Not listed as chats; used only by the token line, so it counts all the tokens Claude Code reports (about 10 % of
 * one week's tokens were in subagent transcripts).
 */
export function findClaudeSubagentFiles(root: string = defaultClaudeProjectsDir()): { file: string; mtimeMs: number }[] {
    const out: { file: string; mtimeMs: number }[] = [];
    let projects: string[];
    try { projects = fs.readdirSync(root); } catch { return out; }
    for (const slug of projects) {
        let sessions: string[];
        try { sessions = fs.readdirSync(path.join(root, slug)); } catch { continue; }
        for (const sid of sessions) {
            const dir = path.join(root, slug, sid, 'subagents');
            let names: string[];
            try { names = fs.readdirSync(dir); } catch { continue; }
            for (const name of names) {
                if (!name.toLowerCase().endsWith('.jsonl')) { continue; }
                const real = realpathWithin(path.join(dir, name), root);
                if (!real) { continue; }
                try { out.push({ file: real, mtimeMs: fs.statSync(real).mtimeMs }); } catch { /* vanished */ }
            }
        }
    }
    return out;
}

export function findClaudeSessions(root: string = defaultClaudeProjectsDir()): SessionRef[] {
    const out: SessionRef[] = [];
    let projects: string[];
    try { projects = fs.readdirSync(root); } catch { return out; }
    for (const slug of projects) {
        const dir = path.join(root, slug);
        const realDir = realpathWithin(dir, root);
        if (!realDir) { continue; }
        let names: string[];
        try {
            if (!fs.statSync(realDir).isDirectory()) { continue; }
            names = fs.readdirSync(realDir);
        } catch { continue; }
        for (const name of names) {
            if (!name.toLowerCase().endsWith('.jsonl')) { continue; }
            const real = realpathWithin(path.join(realDir, name), root);
            if (!real) { continue; }
            let st: fs.Stats;
            try { st = fs.statSync(real); } catch { continue; }
            if (!st.isFile()) { continue; }
            out.push({
                assistant: 'claude',
                id: `claude:${name.replace(/\.jsonl$/i, '')}`,
                file: real,
                project: slug,
                size: st.size,
                mtimeMs: st.mtimeMs,
            });
        }
    }
    return out;
}
