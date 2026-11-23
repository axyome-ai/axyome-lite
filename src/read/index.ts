/**
 * Reader dispatch and the cheap title/project peek used by the tree (first 256 KB only).
 */
import * as path from 'path';
import type { Conversation, SessionRef } from '../model';
import { extractTitle, parseLine } from '../xm-core/capture/claude-code-parser';
import { parseCodexLine } from '../xm-core/capture/codex/codex-parser';
import { applyClaudeRecord, readClaudeConversation } from './claude';
import { applyCodexRecord, codexTurns, newCodexState, readCodexConversation } from './codex';
import { readCopilotConversation } from './copilot';
import { readHead, type ReadLinesOptions } from './line-stream';

export function readConversation(ref: SessionRef, opts: ReadLinesOptions = {}): Promise<Conversation> {
    switch (ref.assistant) {
        case 'copilot': return readCopilotConversation(ref);
        case 'claude': return readClaudeConversation(ref, opts);
        case 'codex': return readCodexConversation(ref, opts);
    }
}

function oneLine(s: string, max = 80): string {
    const t = s.replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function jsonString(raw: string): string | undefined {
    try { return JSON.parse(`"${raw}"`) as string; } catch { return undefined; }
}

/** Complete lines of a head buffer (the last, possibly cut, line is dropped). */
function headLines(head: string): string[] {
    const lines = head.split(/\r?\n/);
    lines.pop();
    return lines;
}

export interface Peek { title?: string; project?: string }

/** Title (and, for Claude Code, the project folder from `cwd`) from the first 256 KB of a session file. */
export function peekSession(ref: SessionRef, read: (file: string) => string = (f) => readHead(f)): Peek {
    if (ref.title) { return { title: ref.title }; }
    let head: string;
    try { head = read(ref.file); } catch { return {}; }
    if (ref.assistant === 'copilot') {
        const custom = head.match(/"customTitle"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const t = custom ? jsonString(custom[1]) : undefined;
        if (t && t.trim()) { return { title: oneLine(t) }; }
        const prompt = head.match(/"message"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.){1,600})/);
        const p = prompt ? jsonString(prompt[1].replace(/\\$/, '')) : undefined;
        return p && p.trim() ? { title: oneLine(p) } : {};
    }
    if (ref.assistant === 'claude') {
        const state: Parameters<typeof applyClaudeRecord>[1] = { turns: [] };
        let title: string | undefined;
        for (const line of headLines(head)) {
            const rec = parseLine(line);
            if (!rec) { continue; }
            title = title ?? extractTitle(rec) ?? undefined;
            applyClaudeRecord(rec, state);
        }
        const t = title ?? state.title ?? state.firstPrompt;
        return { title: t ? oneLine(t) : undefined, project: state.cwd ? path.basename(state.cwd) : undefined };
    }
    const cs = newCodexState();
    for (const line of headLines(head)) {
        const rec = parseCodexLine(line);
        if (rec) { applyCodexRecord(rec, cs); }
    }
    const first = codexTurns(cs).find((t) => t.role === 'user')?.text;
    return { title: first ? oneLine(first) : undefined, project: cs.cwd ? path.basename(cs.cwd.replace(/[\\/]+$/, '')) : undefined };
}
