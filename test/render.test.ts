/** R-1…R-6: Markdown rendering, redaction (XM's scrubSecrets) and the footer. */
import { describe, expect, it } from 'vitest';
import { FOOTER_TEXT, type Conversation } from '../src/model';
import { renderConversationMarkdown } from '../src/render/markdown';

const GH = `ghp_${'a'.repeat(36)}`;
const AWS = 'AKIAABCDEFGHIJKLMNOP';

const conv = (over: Partial<Conversation> = {}): Conversation => ({
    assistant: 'claude', id: 'claude:x', title: 'Fix the build', project: 'demo-repo', startedAt: '2026-11-20T10:00:00.000Z', file: '/tmp/x.jsonl',
    turns: [
        { role: 'user', text: 'Why does the build fail?', at: '2026-11-20T10:00:00.000Z' },
        { role: 'assistant', text: 'Run this:\n\n```sh\nnpm run build\n```', at: '2026-11-20T10:00:05.000Z', tools: ['Bash'] },
    ],
    ...over,
});

describe('renderConversationMarkdown', () => {
    it('R-1 title, metadata table, then User / Assistant sections in order', () => {
        const md = renderConversationMarkdown(conv(), { redact: false, footer: false });
        expect(md.startsWith('# Fix the build\n')).toBe(true);
        expect(md).toContain('| Claude Code | demo-repo | 2026-11-20T10:00:00.000Z | 2 |');
        expect(md.indexOf('## User')).toBeLessThan(md.indexOf('## Assistant'));
        expect(md).toContain('_Tools: Bash_');
    });

    it('R-2 fenced code is kept verbatim', () => {
        const md = renderConversationMarkdown(conv(), { redact: false, footer: false });
        expect(md).toContain('```sh\nnpm run build\n```');
    });

    it('R-3 redaction on replaces a GitHub token and an AWS key', () => {
        const md = renderConversationMarkdown(conv({ turns: [{ role: 'user', text: `token ${GH} and key ${AWS}` }] }), { redact: true, footer: false });
        expect(md).not.toContain(GH);
        expect(md).not.toContain(AWS);
        expect(md.match(/\[REDACTED\]/g)?.length).toBe(2);
    });

    it('R-4 redaction off keeps the text', () => {
        const md = renderConversationMarkdown(conv({ turns: [{ role: 'user', text: `token ${GH}` }] }), { redact: false, footer: false });
        expect(md).toContain(GH);
    });

    it('R-5 footer on and off', () => {
        const on = renderConversationMarkdown(conv(), { redact: false, footer: true });
        const off = renderConversationMarkdown(conv(), { redact: false, footer: false });
        expect(on.trimEnd().endsWith(`_${FOOTER_TEXT}_`)).toBe(true);
        expect(off).not.toContain(FOOTER_TEXT);
    });

    it('R-6 one renderer for Copilot too: a Copilot conversation uses the same structure', () => {
        const md = renderConversationMarkdown(conv({ assistant: 'copilot', id: 'copilot:y' }), { redact: false, footer: false });
        expect(md).toContain('| Copilot | demo-repo |');
        expect(md).toContain('## Assistant');
        expect(md).not.toContain('**Assistant:**');
    });
});
