/** C-1…C-13: the CLI on a temporary home (platform linux). */
import { spawn } from 'child_process';
import { build as esbuild } from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'events';
import { guardPipe, runCli, type CliIo } from '../src/cli';
import { discoverAll } from '../src/locate';
import { labelSession } from '../src/read';
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

    it('C-10 (#352) list shows the Chats view titles and the Claude Code folder name, in text and JSON', async () => {
        const h = makeTmpHome();
        const t = io(h);
        expect(await runCli(['list'], t)).toBe(0);
        const lines = t.stdout.trim().split('\n').map((l) => l.split('\t'));
        const claude = lines.find((c) => c[0] === `claude:${EXPECTED.sessionIds.claude}`)!;
        expect(claude[2]).toBe('demo-repo');
        expect(claude[3]).toBe('Build script walkthrough');
        expect(lines.some((c) => c[0].startsWith('copilot:') && c[3] === 'How do I read a file in Node?')).toBe(true);
        expect(lines.some((c) => /^-home-/.test(c[2]))).toBe(false);

        const j = io(h);
        expect(await runCli(['list', '--json'], j)).toBe(0);
        const rows = JSON.parse(j.stdout) as { id: string; project: string | null; title: string | null }[];
        const d = await discoverAll({ platform: 'linux', env: {}, home: h.home });
        for (const r of rows) {
            const l = labelSession(d.sessions.find((s) => s.id === r.id)!);
            expect(r.title).toBe(l.title ?? null);
            expect(r.project).toBe(l.project ?? null);
        }
        expect(rows.find((r) => r.id === `claude:${EXPECTED.sessionIds.claude}`)?.title).toBe('Build script walkthrough');
        expect(rows.filter((r) => r.title !== null).length).toBeGreaterThanOrEqual(4);
    });

    it('C-11 (#352) stats --json names the largest chats by title', async () => {
        const h = makeTmpHome();
        const o = io(h);
        expect(await runCli(['stats', '--json'], o)).toBe(0);
        const s = JSON.parse(o.stdout) as { largest: { id: string; title?: string }[] };
        expect(s.largest.find((r) => r.id === `claude:${EXPECTED.sessionIds.claude}`)?.title).toBe('Build script walkthrough');
        const d = await discoverAll({ platform: 'linux', env: {}, home: h.home });
        for (const r of s.largest) { expect(r.title).toBe(labelSession(d.sessions.find((x) => x.id === r.id)!).title); }
    });

    it('C-12 (#353) guardPipe exits 0 on EPIPE and rethrows any other stream error', () => {
        const codes: number[] = [];
        const pipe = new EventEmitter();
        guardPipe(pipe, (c) => codes.push(c));
        pipe.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
        expect(codes).toEqual([0]);
        const other = new EventEmitter();
        guardPipe(other, (c) => codes.push(c));
        expect(() => other.emit('error', Object.assign(new Error('denied'), { code: 'EACCES' }))).toThrow('denied');
        expect(codes).toEqual([0]);
    });

    it('C-13 (#353) the built command ends quietly with exit 0 when its output pipe closes', async () => {
        // Bundle the CLI into a temporary folder (not dist/, which another test rebuilds in parallel).
        const out = path.join(tmpDir('lite-cli-'), 'cli.js');
        await esbuild({ entryPoints: [path.join(__dirname, '..', 'src', 'cli.ts')], outfile: out, bundle: true, platform: 'node', format: 'cjs', target: 'node18', logLevel: 'silent', define: { __LITE_VERSION__: '"0.0.0-test"' } });
        const h = makeTmpHome();
        const env: NodeJS.ProcessEnv = { ...process.env, HOME: h.home, USERPROFILE: h.home };
        delete env.CODEX_HOME;
        const child = spawn(process.execPath, [out, 'list'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.destroy();
        let stderr = '';
        child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
        expect(stderr).not.toMatch(/EPIPE/);
        expect(code).toBe(0);
    }, 30000);
});
