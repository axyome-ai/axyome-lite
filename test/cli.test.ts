/** C-1…C-9: the CLI on a temporary home (platform linux). */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../src/cli';
import { readClaudeConversation } from '../src/read/claude';
import { renderConversationMarkdown } from '../src/render/markdown';
import { EXPECTED, NOW_MS, makeTmpHome, tmpDir, type TmpHome } from './helpers';

function io(h: TmpHome | { home: string }, extra: Partial<CliIo> = {}): CliIo & { stdout: string; stderr: string } {
    const o = {
        stdout: '', stderr: '',
        out(s: string) { o.stdout += s; },
        err(s: string) { o.stderr += s; },
        discover: { platform: 'linux', env: {}, home: h.home },
        now: NOW_MS,
        ...extra,
    };
    return o;
}

describe('runCli', () => {
    it('C-1 where lists the three assistants', async () => {
        const h = makeTmpHome();
        const o = io(h);
        expect(await runCli(['where'], o)).toBe(0);
        expect(o.stdout).toMatch(/^Copilot \(Code\): 3 chats/m);
        expect(o.stdout).toMatch(/^Claude Code: 2 chats/m);
        expect(o.stdout).toMatch(/^Codex: 1 chats/m);
    });

    it('C-2 where with nothing found prints the checked paths, exit 0', async () => {
        const o = io({ home: tmpDir() });
        expect(await runCli(['where'], o)).toBe(0);
        expect(o.stdout).toContain('none found. Checked:');
        expect(o.stdout).toContain('.claude');
    });

    it('C-3 list --json gives ids prefixed by assistant', async () => {
        const h = makeTmpHome();
        const o = io(h);
        expect(await runCli(['list', '--json'], o)).toBe(0);
        const rows = JSON.parse(o.stdout) as { id: string }[];
        expect(rows).toHaveLength(6);
        expect(new Set(rows.map((r) => r.id.split(':')[0]))).toEqual(new Set(['copilot', 'claude', 'codex']));
    });

    it('C-4 export to a file writes the rendered Markdown', async () => {
        const h = makeTmpHome();
        const dest = path.join(tmpDir(), 'chat.md');
        const o = io(h);
        expect(await runCli(['export', `claude:${EXPECTED.sessionIds.claude}`, '-o', dest], o)).toBe(0);
        const expected = renderConversationMarkdown(await readClaudeConversation({ id: `claude:${EXPECTED.sessionIds.claude}`, file: fs.realpathSync(h.files.claude1) }), { redact: true, footer: true });
        expect(fs.readFileSync(dest, 'utf8')).toBe(expected);
        expect(o.stdout.trim()).toBe(path.resolve(dest));
    });

    it('C-5 refuses to overwrite without --force', async () => {
        const h = makeTmpHome();
        const dest = path.join(tmpDir(), 'chat.md');
        fs.writeFileSync(dest, 'keep me');
        const o = io(h);
        expect(await runCli(['export', `claude:${EXPECTED.sessionIds.claude}`, '-o', dest], o)).toBe(4);
        expect(fs.readFileSync(dest, 'utf8')).toBe('keep me');
        expect(o.stderr).toContain('already exists');
    });

    it('C-6 refuses to write inside an assistant store', async () => {
        const h = makeTmpHome();
        const o = io(h);
        expect(await runCli(['export', `claude:${EXPECTED.sessionIds.claude}`, '-o', path.join(h.claudeRoot, 'x.md')], o)).toBe(4);
        expect(fs.existsSync(path.join(h.claudeRoot, 'x.md'))).toBe(false);
        expect(o.stderr).toContain("assistant's chat store");
    });

    it('C-7 unknown id exits 2', async () => {
        const h = makeTmpHome();
        const o = io(h);
        expect(await runCli(['export', 'claude:nope'], o)).toBe(2);
        expect(o.stderr).toContain('not found');
    });

    it('C-8 --no-redact warns on stderr', async () => {
        const h = makeTmpHome();
        const o = io(h);
        expect(await runCli(['export', `codex:${EXPECTED.sessionIds.codex}`, '--no-redact'], o)).toBe(0);
        expect(o.stderr).toContain('not redacted');
        expect(o.stdout).toContain('# Parser tests');
    });

    it('C-9 stats --json has the dashboard fields; Copilot tokens are null', async () => {
        const h = makeTmpHome();
        const o = io(h);
        expect(await runCli(['stats', '--json'], o)).toBe(0);
        const s = JSON.parse(o.stdout) as { perAssistant: Record<string, number>; perDay: unknown[]; largest: unknown[]; storage: Record<string, number>; tokens: { claude: { total: number } | null; codex: { total: number } | null; copilot: unknown } };
        expect(s.perAssistant).toEqual({ copilot: 3, claude: 2, codex: 1 });
        expect(s.perDay).toHaveLength(30);
        expect(s.largest.length).toBeGreaterThan(0);
        expect(s.storage.claude).toBeGreaterThan(0);
        expect(s.tokens.copilot).toBeNull();
        expect(s.tokens.claude).not.toBeNull();
        expect(s.tokens.codex).not.toBeNull();
    });
});
