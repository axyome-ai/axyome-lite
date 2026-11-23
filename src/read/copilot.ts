/**
 * A Copilot Chat session file → Conversation.
 *
 * .jsonl (VS Code ≥ 1.109, incremental kinds 0/1/2) goes through the vendored Axyome XM reconstructor;
 * .json (legacy) through JSON.parse. Both read the whole file (the vendored reconstructor uses readFileSync,
 * jsonl-session-parser.ts), so files above MAX_WHOLE_FILE_BYTES are refused with a pointer to Axyome XM.
 * Text is never truncated (unlike XM's stored copy). Lite's own rendering is used, not XM's
 * generateSessionMarkdown (it joins response parts with a literal "\n").
 */
import * as fs from 'fs';
import * as path from 'path';
import { LiteError, MAX_WHOLE_FILE_BYTES, type Conversation, type SessionRef, type Turn } from '../model';
import { reconstructSessionFromPatches } from '../xm-core/utils/jsonl-session-parser';
import { copilotSessionTitle, type RawChatSession } from '../xm-core/utils/session-markdown-generator';

type RawRequest = NonNullable<RawChatSession['requests']>[number];

function userText(r: RawRequest): string {
    const m = r.message?.text ?? r.message?.value ?? '';
    return typeof m === 'string' ? m.trim() : '';
}

function partText(v: unknown): string {
    if (typeof v === 'string') { return v; }
    if (v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'string') { return (v as { value: string }).value; }
    return '';
}

function assistantText(r: RawRequest): string {
    const parts: string[] = [];
    for (const part of r.response ?? []) {
        if (part.kind === 'thinking') { continue; }
        const t = partText(part.value);
        if (t) { parts.push(t); }
    }
    return parts.join('').trim();
}

function tsOf(r: RawRequest): string | undefined {
    const t = r.timestamp as unknown;
    if (typeof t === 'number' && Number.isFinite(t)) { return new Date(t).toISOString(); }
    if (typeof t === 'string' && t) { const d = new Date(t); return Number.isNaN(d.getTime()) ? undefined : d.toISOString(); }
    return undefined;
}

/** Parse the raw session object (exported for tests). */
export function parseCopilotSession(text: string, isJsonl: boolean): RawChatSession {
    if (isJsonl) { return reconstructSessionFromPatches(text); }
    const raw = JSON.parse(text) as unknown;
    if (!raw || typeof raw !== 'object') { throw new Error('not a session object'); }
    return raw as RawChatSession;
}

export function sessionToConversation(session: RawChatSession, ref: Pick<SessionRef, 'id' | 'file' | 'project'>): Conversation {
    const reqs = [...(session.requests ?? [])].sort((a, b) =>
        (new Date(tsOf(a) ?? 0).getTime()) - (new Date(tsOf(b) ?? 0).getTime()));
    const turns: Turn[] = [];
    for (const r of reqs) {
        const at = tsOf(r);
        const u = userText(r);
        if (u) { turns.push({ role: 'user', text: u, at }); }
        const a = assistantText(r);
        if (a) { turns.push({ role: 'assistant', text: a, at }); }
    }
    const created = (session as { creationDate?: unknown }).creationDate;
    const startedAt = typeof created === 'number' ? new Date(created).toISOString() : turns[0]?.at;
    return {
        assistant: 'copilot',
        id: ref.id,
        title: copilotSessionTitle(session) ?? 'Copilot chat',
        project: ref.project,
        startedAt,
        file: ref.file,
        turns,
    };
}

export async function readCopilotConversation(
    ref: Pick<SessionRef, 'id' | 'file' | 'project'>,
    opts: { statSize?: (file: string) => number } = {},
): Promise<Conversation> {
    const size = (opts.statSize ?? ((f: string) => fs.statSync(f).size))(ref.file);
    if (size > MAX_WHOLE_FILE_BYTES) {
        throw new LiteError(
            `${path.basename(ref.file)} is ${(size / 1048576).toFixed(0)} MB, larger than 64 MB: too large for Axyome Lite to open. Axyome XM imports chats of any size.`,
            'too-large',
        );
    }
    let session: RawChatSession;
    try {
        session = parseCopilotSession(fs.readFileSync(ref.file, 'utf8'), ref.file.toLowerCase().endsWith('.jsonl'));
    } catch (e) {
        if (e instanceof LiteError) { throw e; }
        throw new LiteError(`${path.basename(ref.file)} is unreadable: ${(e as Error).message}`, 'unreadable');
    }
    return sessionToConversation(session, ref);
}
