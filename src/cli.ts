/**
 * `axyome-lite where | list | export | stats`.
 * Exit codes: 0 ok · 1 usage · 2 not found · 3 unreadable / unsupported / too large · 4 refused.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ASSISTANT_LABEL, ASSISTANTS, LiteError, type Assistant, type SessionRef } from './model';
import { discoverAll, storeRoots, whereReportMarkdown, type DiscoverOptions } from './locate';
import { exportTargetProblem } from './locate/safe-path';
import { labelSession, readConversation } from './read';
import { renderConversationMarkdown } from './render/markdown';
import { collectChatStats } from './stats/collect';
import { sumRecentTokens } from './stats/tokens';

declare const __LITE_VERSION__: string | undefined;
export const VERSION = typeof __LITE_VERSION__ === 'string' ? __LITE_VERSION__ : '0.0.0-dev';

export interface CliIo {
    out(s: string): void;
    err(s: string): void;
    discover?: DiscoverOptions;
    now?: number;
    writeFile?: (file: string, text: string) => void;
    exists?: (file: string) => boolean;
}

const HELP = `axyome-lite ${'{version}'}: find, open and export your Copilot, Claude Code and Codex chats.

  axyome-lite where [--json]                      where each assistant keeps its chats
  axyome-lite list [--assistant copilot|claude|codex] [--since YYYY-MM-DD] [--json]
  axyome-lite export <id|path> [-o file.md] [--stdout] [--no-redact] [--no-footer] [--force]
  axyome-lite stats [--days 30] [--json]          chats per day, largest, storage, tokens (7 days)

Local only: no network, no account, nothing stored. Search every chat, replay any day and give your
assistant a memory: Axyome XM, https://marketplace.visualstudio.com/items?itemName=axyome-ai.axyome-ai-xm
`;

function flag(args: string[], name: string): boolean {
    const i = args.indexOf(name);
    if (i >= 0) { args.splice(i, 1); return true; }
    return false;
}

function option(args: string[], ...names: string[]): string | undefined {
    for (const name of names) {
        const i = args.indexOf(name);
        if (i >= 0) {
            const v = args[i + 1];
            args.splice(i, 2);
            return v;
        }
    }
    return undefined;
}

function findRef(sessions: readonly SessionRef[], idOrPath: string): SessionRef | undefined {
    const byId = sessions.find((s) => s.id === idOrPath);
    if (byId) { return byId; }
    let real: string;
    try { real = fs.realpathSync(path.resolve(idOrPath)); } catch { return undefined; }
    return sessions.find((s) => s.file === real || s.file.toLowerCase() === real.toLowerCase());
}

const EXIT: Record<LiteError['code'], number> = { 'not-found': 2, unreadable: 3, 'too-large': 3, refused: 4 };

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
    const args = [...argv];
    const cmd = args.shift();
    if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') { io.out(HELP.replace('{version}', VERSION)); return cmd ? 0 : 1; }
    if (cmd === '--version' || cmd === '-v') { io.out(`${VERSION}\n`); return 0; }
    const json = flag(args, '--json');
    try {
        if (cmd === 'where') {
            const d = await discoverAll(io.discover);
            if (json) { io.out(`${JSON.stringify(d.roots, null, 2)}\n`); return 0; }
            const found = d.roots.filter((r) => r.exists && r.files > 0);
            if (found.length === 0) {
                io.out(`none found. Checked:\n${d.roots.map((r) => `  ${ASSISTANT_LABEL[r.assistant]}: ${r.path}`).join('\n')}\n`);
                return 0;
            }
            for (const r of d.roots) {
                io.out(`${ASSISTANT_LABEL[r.assistant]}${r.editor ? ` (${r.editor})` : ''}: ${r.exists ? `${r.files} chats, ${(r.bytes / 1048576).toFixed(1)} MB` : 'not found'}  ${r.path}\n`);
            }
            return 0;
        }
        if (cmd === 'list') {
            const which = option(args, '--assistant') as Assistant | undefined;
            const since = option(args, '--since');
            if (which && !ASSISTANTS.includes(which)) { io.err(`unknown assistant: ${which}\n`); return 1; }
            const sinceMs = since ? new Date(`${since}T00:00:00`).getTime() : undefined;
            const d = await discoverAll(io.discover);
            const rows = d.sessions.filter((s) => (!which || s.assistant === which) && (sinceMs === undefined || s.mtimeMs >= sinceMs));
            // Same title and folder as the Chats view: at most 64 KB read from each listed chat.
            const labelled = rows.map((s) => ({ s, l: labelSession(s) }));
            if (json) {
                io.out(`${JSON.stringify(labelled.map(({ s, l }) => ({ id: s.id, assistant: s.assistant, project: l.project ?? null, changed: new Date(s.mtimeMs).toISOString(), size: s.size, title: l.title ?? null, file: s.file })), null, 2)}\n`);
                return 0;
            }
            for (const { s, l } of labelled) {
                io.out(`${s.id}\t${new Date(s.mtimeMs).toISOString().slice(0, 16)}\t${l.project ?? '—'}\t${l.title ?? ''}\n`);
            }
            return 0;
        }
        if (cmd === 'export') {
            const outFile = option(args, '-o', '--out');
            const toStdout = flag(args, '--stdout');
            const noRedact = flag(args, '--no-redact');
            const noFooter = flag(args, '--no-footer');
            const force = flag(args, '--force');
            const target = args.shift();
            if (!target) { io.err('export needs an id (from `list`) or a path\n'); return 1; }
            const d = await discoverAll(io.discover);
            const ref = findRef(d.sessions, target);
            if (!ref) { io.err(`not found: ${target}\n`); return 2; }
            const conv = await readConversation(ref);
            const md = renderConversationMarkdown(conv, { redact: !noRedact, footer: !noFooter });
            if (noRedact) { io.err('warning: export is not redacted (secrets in the chat are kept)\n'); }
            if (toStdout || !outFile) { io.out(md); return 0; }
            const dest = path.resolve(outFile);
            const problem = exportTargetProblem(dest, storeRoots(d), force, io.exists ?? fs.existsSync);
            if (problem) { io.err(`${problem}\n`); return 4; }
            (io.writeFile ?? ((f, t) => fs.writeFileSync(f, t, 'utf8')))(dest, md);
            io.out(`${dest}\n`);
            return 0;
        }
        if (cmd === 'stats') {
            const days = Number(option(args, '--days') ?? '30');
            const d = await discoverAll(io.discover);
            const stats = collectChatStats(d.sessions, { days: Number.isFinite(days) ? days : 30, now: io.now });
            const tokens = await sumRecentTokens(d.sessions, { now: io.now, claudeSubagentFiles: d.claudeSubagents });
            if (json) {
                const byId = new Map(d.sessions.map((s) => [s.id, s]));
                const largest = stats.largest.map((r) => {
                    const ref = byId.get(r.id);
                    const title = r.title ?? (ref ? labelSession(ref).title : undefined);
                    return title ? { ...r, title } : r;
                });
                io.out(`${JSON.stringify({ ...stats, largest, tokens: { hours: tokens.hours, claude: tokens.claude, codex: tokens.codex, copilot: tokens.copilot } }, null, 2)}\n`);
                return 0;
            }
            io.out(`Chats: ${ASSISTANTS.map((a) => `${ASSISTANT_LABEL[a]} ${stats.perAssistant[a]}`).join(' · ')}\n`);
            io.out(`Storage: ${ASSISTANTS.map((a) => `${ASSISTANT_LABEL[a]} ${(stats.storage[a] / 1048576).toFixed(1)} MB`).join(' · ')}\n`);
            io.out(`Tokens, last 7 days: Claude Code ${tokens.claude ? tokens.claude.total : 'n/a'} · Codex ${tokens.codex ? tokens.codex.total : 'n/a'} · Copilot not recorded\n`);
            return 0;
        }
        io.err(`unknown command: ${cmd}\n`);
        io.out(HELP.replace('{version}', VERSION));
        return 1;
    } catch (e) {
        if (e instanceof LiteError) { io.err(`${e.message}\n`); return EXIT[e.code]; }
        io.err(`${(e as Error).message}\n`);
        return 3;
    }
}

/**
 * End quietly when the reader of our output goes away (`axyome-lite list | head`): EPIPE exits 0, like other
 * command-line tools. Any other stream error is rethrown.
 */
export function guardPipe(stream: Pick<NodeJS.EventEmitter, 'on'>, exit: (code: number) => void): void {
    stream.on('error', (e: NodeJS.ErrnoException) => {
        if (e && e.code === 'EPIPE') { exit(0); return; }
        throw e;
    });
}

/* istanbul ignore next: process entry */
if (require.main === module) {
    guardPipe(process.stdout, (code) => process.exit(code));
    void runCli(process.argv.slice(2), {
        out: (s) => process.stdout.write(s),
        err: (s) => process.stderr.write(s),
        discover: { home: os.homedir(), extraVsCodeUserDirs: (process.env.AXYOME_LITE_EXTRA_DIRS ?? '').split(path.delimiter).filter(Boolean) },
    }).then((code) => { process.exitCode = code; });
}
