/**
 * A Codex rollout → Conversation, streamed line by line.
 *
 * Message sources, as Axyome XM's parser classifies them (vendored codex-parser.ts):
 *   - event_msg user_message / agent_message (`payload.message`)               older dialect
 *   - event_msg item_completed, item UserMessage / AgentMessage (`item.content`) Codex 0.171
 * When a file carries item_completed messages, those are used; otherwise the event_msg ones (so one message is
 * never shown twice). XM's text path scrubs and caps (codex-redact.ts); Lite keeps the full text.
 */
import * as path from 'path';
import { LiteError, type Conversation, type SessionRef, type Turn } from '../model';
import { epochToIso, parseCodexLine } from '../xm-core/capture/codex/codex-parser';
import type { CodexRecord } from '../xm-core/types/codex';
import { readLines, type ReadLinesOptions } from './line-stream';

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function contentText(v: unknown): string {
    if (typeof v === 'string') { return v; }
    if (Array.isArray(v)) {
        return v.map((c) => (typeof c === 'string' ? c : str(obj(c).text) ?? '')).filter(Boolean).join('\n');
    }
    return '';
}

export interface CodexState {
    fromEvents: Turn[];
    fromItems: Turn[];
    cwd?: string;
    startedAt?: string;
    title?: string;
}

export function newCodexState(): CodexState {
    return { fromEvents: [], fromItems: [] };
}

/** Fold one record into the state (exported for tests). */
export function applyCodexRecord(rec: CodexRecord, state: CodexState): void {
    const p = obj(rec.payload);
    const at = epochToIso(rec.timestamp) ?? undefined;
    if (rec.type === 'session_meta') {
        state.cwd ??= str(p.cwd);
        state.startedAt ??= epochToIso(p.timestamp) ?? at;
        return;
    }
    if (rec.type !== 'event_msg') { return; }
    const st = str(p.type);
    if (st === 'user_message' || st === 'agent_message') {
        const text = (str(p.message) ?? '').trim();
        if (text) { state.fromEvents.push({ role: st === 'user_message' ? 'user' : 'assistant', text, at }); }
        return;
    }
    if (st === 'item_completed') {
        const it = obj(p.item);
        const t = str(it.type);
        if (t === 'UserMessage' || t === 'AgentMessage') {
            const text = contentText(it.content).trim();
            if (text) { state.fromItems.push({ role: t === 'UserMessage' ? 'user' : 'assistant', text, at }); }
        }
    }
}

export function codexTurns(state: CodexState): Turn[] {
    return state.fromItems.length > 0 ? state.fromItems : state.fromEvents;
}

export async function readCodexConversation(
    ref: Pick<SessionRef, 'id' | 'file' | 'project' | 'title'>,
    opts: ReadLinesOptions = {},
): Promise<Conversation> {
    const state = newCodexState();
    try {
        await readLines(ref.file, (line) => {
            const rec = parseCodexLine(line);
            if (rec) { applyCodexRecord(rec, state); }
        }, opts);
    } catch (e) {
        throw new LiteError(`${path.basename(ref.file)} is unreadable: ${(e as Error).message}`, 'unreadable');
    }
    const turns = codexTurns(state);
    const first = turns.find((t) => t.role === 'user')?.text;
    const oneLine = (s: string): string => { const x = s.replace(/\s+/g, ' ').trim(); return x.length > 80 ? `${x.slice(0, 79)}…` : x; };
    return {
        assistant: 'codex',
        id: ref.id,
        title: ref.title ?? (first ? oneLine(first) : 'Codex session'),
        project: state.cwd ? path.basename(state.cwd.replace(/[\\/]+$/, '')) : ref.project,
        startedAt: state.startedAt ?? turns[0]?.at,
        file: ref.file,
        turns,
    };
}
