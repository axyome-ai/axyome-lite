/** Test helpers: a temporary home with the three assistants' stores, built from the synthetic fixtures. */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const FIXTURES = path.join(__dirname, 'fixtures');
export const EXPECTED = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'expected.json'), 'utf8')) as {
    now: string;
    claude: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; records: number };
    claudeDup: { dedupedTotal: number; naiveInWindowTotal: number };
    codex: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; records: number; finalCumulative: number };
    longClaudeChars: number;
    longCodexChars: number;
    sessionIds: { claude: string; codex: string };
};
export const NOW_MS = Date.parse(EXPECTED.now);

export function tmpDir(prefix = 'lite-'): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const copy = (name: string, dest: string): void => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(FIXTURES, name), dest);
};

export interface TmpHome {
    home: string;
    userDir: string;
    claudeRoot: string;
    codexHome: string;
    files: { copilotWs1: string; copilotWs2: string; copilotEmpty: string; claude1: string; claude2: string; codex1: string };
}

/** Linux layout (platform 'linux'): ~/.config/Code/User, ~/.claude/projects, ~/.codex. */
export function makeTmpHome(): TmpHome {
    const home = tmpDir('lite-home-');
    const userDir = path.join(home, '.config', 'Code', 'User');
    const ws = path.join(userDir, 'workspaceStorage');
    fs.mkdirSync(path.join(ws, 'hash-a'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'hash-a', 'workspace.json'), JSON.stringify({ folder: 'file:///home/test/demo-repo' }));
    const copilotWs1 = path.join(ws, 'hash-a', 'chatSessions', 'aaaa1111.json');
    const copilotWs2 = path.join(ws, 'hash-a', 'chatSessions', 'bbbb2222.jsonl');
    const copilotEmpty = path.join(userDir, 'globalStorage', 'emptyWindowChatSessions', 'cccc3333.json');
    copy('copilot-legacy.json', copilotWs1);
    copy('copilot-session.jsonl', copilotWs2);
    copy('copilot-legacy.json', copilotEmpty);

    const claudeRoot = path.join(home, '.claude', 'projects');
    const claude1 = path.join(claudeRoot, '-home-test-demo-repo', `${EXPECTED.sessionIds.claude}.jsonl`);
    const claude2 = path.join(claudeRoot, '-home-test-other', 'dddd4444-0000-4000-8000-000000000000.jsonl');
    copy('claude-session.jsonl', claude1);
    copy('claude-usage-dup.jsonl', claude2);

    const codexHome = path.join(home, '.codex');
    const codex1 = path.join(codexHome, 'sessions', '2026', '11', '20', `rollout-2026-11-20T09-00-00-${EXPECTED.sessionIds.codex}.jsonl`);
    copy('codex-rollout.jsonl', codex1);
    fs.writeFileSync(path.join(codexHome, 'session_index.jsonl'), `${JSON.stringify({ id: EXPECTED.sessionIds.codex, thread_name: 'Parser tests', updated_at: '2026-11-20T09:30:00Z' })}\n`);

    return { home, userDir, claudeRoot, codexHome, files: { copilotWs1, copilotWs2, copilotEmpty, claude1, claude2, codex1 } };
}

export function setMtime(file: string, ms: number): void {
    const d = new Date(ms);
    fs.utimesSync(file, d, d);
}
