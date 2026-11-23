/** L-1…L-7: locators read metadata only and stay inside their roots. */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { findClaudeSessions } from '../src/locate/claude';
import { findCodexSessions } from '../src/locate/codex';
import { findCopilotSessions, workspaceName } from '../src/locate/copilot';
import { EXPECTED, makeTmpHome, tmpDir } from './helpers';

describe('locators', () => {
    it('L-1 Copilot sessions in workspace and empty-window stores, .json and .jsonl', () => {
        const h = makeTmpHome();
        const refs = findCopilotSessions(h.userDir);
        expect(refs).toHaveLength(3);
        expect(refs.map((r) => path.extname(r.file)).sort()).toEqual(['.json', '.json', '.jsonl']);
        expect(refs.every((r) => r.assistant === 'copilot' && r.id.startsWith('copilot:'))).toBe(true);
    });

    it('L-2 workspace name from workspace.json', () => {
        const h = makeTmpHome();
        const ws = findCopilotSessions(h.userDir).filter((r) => r.project);
        expect(ws.map((r) => r.project)).toEqual(['demo-repo', 'demo-repo']);
        expect(workspaceName(JSON.stringify({ workspace: 'file:///c%3A/w/team.code-workspace' }))).toBe('team');
    });

    it('L-3 Claude Code sessions by project folder', () => {
        const h = makeTmpHome();
        const refs = findClaudeSessions(h.claudeRoot);
        expect(refs).toHaveLength(2);
        expect(refs.map((r) => r.project).sort()).toEqual(['-home-test-demo-repo', '-home-test-other']);
        expect(refs.some((r) => r.id === `claude:${EXPECTED.sessionIds.claude}`)).toBe(true);
    });

    it('L-4 Codex rollouts via the vendored discovery, with the session-index title', async () => {
        const h = makeTmpHome();
        const refs = await findCodexSessions(h.codexHome);
        expect(refs).toHaveLength(1);
        expect(refs[0].id).toBe(`codex:${EXPECTED.sessionIds.codex}`);
        expect(refs[0].title).toBe('Parser tests');
    });

    it('L-5 a symlink that escapes the root is skipped', () => {
        const h = makeTmpHome();
        const outside = tmpDir('lite-outside-');
        fs.writeFileSync(path.join(outside, 'evil.jsonl'), '{}\n');
        fs.symlinkSync(path.join(outside, 'evil.jsonl'), path.join(h.claudeRoot, '-home-test-other', 'evil.jsonl'));
        expect(fs.lstatSync(path.join(h.claudeRoot, '-home-test-other', 'evil.jsonl')).isSymbolicLink()).toBe(true);
        const refs = findClaudeSessions(h.claudeRoot);
        expect(refs.some((r) => r.file.endsWith('evil.jsonl'))).toBe(false);
        expect(refs).toHaveLength(2);
    });

    it('L-6 listing Copilot sessions reads only workspace.json', () => {
        const h = makeTmpHome();
        const read: string[] = [];
        const refs = findCopilotSessions(h.userDir, 'Code', (f) => { read.push(f); return fs.readFileSync(f, 'utf8'); });
        expect(refs).toHaveLength(3);
        expect(read.length).toBeGreaterThan(0);
        expect(read.every((p) => p.endsWith('workspace.json'))).toBe(true);
    });

    it('L-7 missing roots give empty lists without throwing', async () => {
        const empty = tmpDir();
        expect(findCopilotSessions(path.join(empty, 'nope'))).toEqual([]);
        expect(findClaudeSessions(path.join(empty, 'nope'))).toEqual([]);
        await expect(findCodexSessions(path.join(empty, 'nope'))).resolves.toEqual([]);
    });
});
