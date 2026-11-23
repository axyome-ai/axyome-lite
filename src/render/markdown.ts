/** Conversation → Markdown (one renderer for all three assistants). */
import { ASSISTANT_LABEL, FOOTER_TEXT, type Conversation } from '../model';
import { redactForExport } from './redact';

export interface RenderOptions {
    redact: boolean;
    footer: boolean;
}

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function renderConversationMarkdown(conv: Conversation, opts: RenderOptions): string {
    const r = (s: string): string => (opts.redact ? redactForExport(s) : s);
    const out: string[] = [];
    out.push(`# ${r(conv.title).replace(/\r?\n/g, ' ')}`, '');
    out.push('| Assistant | Project | Started | Turns |', '|---|---|---|---|');
    out.push(`| ${ASSISTANT_LABEL[conv.assistant]} | ${cell(r(conv.project ?? '—'))} | ${conv.startedAt ?? '—'} | ${conv.turns.length} |`, '');
    if (conv.turns.length === 0) {
        out.push('_No messages in this conversation._', '');
    }
    for (const t of conv.turns) {
        out.push(t.role === 'user' ? '## User' : '## Assistant');
        if (t.at) { out.push(`_${t.at}_`); }
        out.push('');
        if (t.text) { out.push(r(t.text), ''); }
        if (t.tools && t.tools.length) { out.push(`_Tools: ${t.tools.join(', ')}_`, ''); }
    }
    if (opts.footer) { out.push('---', '', `_${FOOTER_TEXT}_`); }
    return out.join('\n').replace(/\n+$/, '') + '\n';
}
