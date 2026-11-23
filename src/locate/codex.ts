/**
 * Codex rollouts through the vendored Axyome XM discovery:
 * $CODEX_HOME (or ~/.codex)/sessions/YYYY/MM/DD/rollout-*.jsonl and archived_sessions/, titles from
 * session_index.jsonl. Compressed (.zst) rollouts are skipped in v0.1.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { SessionRef } from '../model';
import { resolveCodexHome } from '../xm-core/capture/codex/codex-home';
import { discoverRollouts, readTitles } from '../xm-core/capture/codex/codex-discovery';
import { nodeCodexFs } from '../xm-core/capture/codex/codex-fs';
import { realpathWithin } from './safe-path';

export function codexHomeFor(setting: string | undefined, env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string {
    return resolveCodexHome(setting, env, home);
}

/** The session id inside a rollout file name: rollout-<timestamp>-<uuid>.jsonl → <uuid>. */
export function rolloutSessionId(file: string): string {
    const base = path.basename(file).replace(/\.jsonl(\.zst)?$/i, '');
    const m = base.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    return m ? m[1] : base;
}

export async function findCodexSessions(home: string): Promise<SessionRef[]> {
    if (!fs.existsSync(home)) { return []; }
    const found = await discoverRollouts(home, nodeCodexFs);
    let titles = new Map<string, string>();
    try {
        titles = readTitles(fs.readFileSync(path.join(home, 'session_index.jsonl'), 'utf8').split(/\r?\n/));
    } catch { /* no index */ }
    const out: SessionRef[] = [];
    for (const r of found) {
        if (r.kind === 'compressed') { continue; }
        const real = realpathWithin(r.path, home);
        if (!real) { continue; }
        const sid = rolloutSessionId(real);
        out.push({
            assistant: 'codex',
            id: `codex:${sid}`,
            file: real,
            title: titles.get(sid),
            size: r.size,
            mtimeMs: r.mtimeMs,
        });
    }
    return out;
}
