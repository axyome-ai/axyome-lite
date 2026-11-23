/**
 * A Claude Code transcript → Conversation, streamed line by line.
 *
 * Uses the vendored Axyome XM parser (parseLine, extractPrompt, extractTitle, extractToolCalls, NON_PROMPT_MARKERS)
 * with the same text rules as XM's extractTurnText, but WITHOUT its scrub and 16 KB cap
 * (claude-code-parser.ts:216, :474): an export must be complete; redaction is a separate, user-controlled step.
 * Consecutive assistant records of one request are merged into one turn.
 */
import * as path from 'path';
import { LiteError, type Conversation, type SessionRef, type Turn } from '../model';
import {
    NON_PROMPT_MARKERS, extractPrompt, extractTitle, extractToolCalls, parseLine,
} from '../xm-core/capture/claude-code-parser';
import type { CCRecord } from '../xm-core/types/claude-code';
import { readLines, type ReadLinesOptions } from './line-stream';

function blocksText(content: unknown, onlyPromptText: boolean): string {
    const texts: string[] = [];
    const add = (t: string): void => {
        const s = t.trim();
        if (!s) { return; }
        if (onlyPromptText && NON_PROMPT_MARKERS.some((m) => s.startsWith(m))) { return; }
        texts.push(s);
    };
    if (typeof content === 'string') { add(content); }
    if (Array.isArray(content)) {
        for (const raw of content) {
            const b = raw as Record<string, unknown> | null;
            if (b && b.type === 'text' && typeof b.text === 'string') { add(b.text); }
        }
    }
    return texts.join('\n\n');
}

/** Fold one record into the conversation state (exported for tests). */
export function applyClaudeRecord(rec: CCRecord, state: { turns: Turn[]; title?: string; firstPrompt?: string; startedAt?: string; lastRequestId?: string; cwd?: string }): void {
    const title = extractTitle(rec);
    if (title) { state.title = title; }
    if (!state.cwd && typeof rec.cwd === 'string') { state.cwd = rec.cwd; }
    if (rec.isMeta === true || rec.isCompactSummary === true) { return; }
    const at = typeof rec.timestamp === 'string' ? rec.timestamp : undefined;
    if (rec.type === 'user') {
        if (!extractPrompt(rec)) { return; }
        const text = blocksText(rec.message?.content, true);
        if (!text) { return; }
        state.turns.push({ role: 'user', text, at });
        state.firstPrompt ??= text;
        state.startedAt ??= at;
        state.lastRequestId = undefined;
        return;
    }
    if (rec.type === 'assistant') {
        const text = blocksText(rec.message?.content, false);
        const tools = extractToolCalls(rec).map((t) => t.tool_name);
        if (!text && tools.length === 0) { return; }
        const last = state.turns[state.turns.length - 1];
        const reqId = typeof rec.requestId === 'string' ? rec.requestId : undefined;
        if (last && last.role === 'assistant' && reqId && reqId === state.lastRequestId) {
            if (text) { last.text = last.text ? `${last.text}\n\n${text}` : text; }
            if (tools.length) { last.tools = [...(last.tools ?? []), ...tools]; }
        } else {
            state.turns.push({ role: 'assistant', text, at, ...(tools.length ? { tools } : {}) });
        }
        state.lastRequestId = reqId;
        state.startedAt ??= at;
    }
}

function oneLine(s: string, max = 80): string {
    const t = s.replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export async function readClaudeConversation(
    ref: Pick<SessionRef, 'id' | 'file' | 'project'>,
    opts: ReadLinesOptions = {},
): Promise<Conversation> {
    const state: { turns: Turn[]; title?: string; firstPrompt?: string; startedAt?: string; lastRequestId?: string; cwd?: string } = { turns: [] };
    try {
        await readLines(ref.file, (line) => {
            const rec = parseLine(line);
            if (rec) { applyClaudeRecord(rec, state); }
        }, opts);
    } catch (e) {
        throw new LiteError(`${path.basename(ref.file)} is unreadable: ${(e as Error).message}`, 'unreadable');
    }
    return {
        assistant: 'claude',
        id: ref.id,
        title: state.title ?? (state.firstPrompt ? oneLine(state.firstPrompt) : 'Claude Code session'),
        project: state.cwd ? path.basename(state.cwd) : ref.project,
        startedAt: state.startedAt,
        file: ref.file,
        turns: state.turns,
    };
}
