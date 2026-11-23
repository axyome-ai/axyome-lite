/**
 * Tokens reported by Claude Code and Codex in their own files, last 168 h.
 *
 * Same extractors and keys as Axyome XM, so the figure can be compared with XM's AI tab:
 *   Claude Code  vendored extractTokenUsage (claude-code-parser.ts); one record per (request_id, timestamp),
 *                model '<synthetic>' excluded.
 *   Codex        vendored extractTokenUsage (codex-parser.ts): per-turn values, deduplicated by usageKey;
 *                token_usage_record rows are used when a file has them, else token_count events.
 * The window is by each record's own timestamp; only files changed inside the window are opened.
 * Copilot records no tokens: its value is null, never 0.
 * Claude Code subagent transcripts (<session>/subagents/*.jsonl) are included: they hold real usage.
 */
import type { SessionRef } from '../model';
import { extractTokenUsage as ccTokenUsage, parseLine } from '../xm-core/capture/claude-code-parser';
import { epochToIso, extractTokenUsage as codexTokenUsage, newParseContext, parseCodexLine } from '../xm-core/capture/codex/codex-parser';
import type { CodexTokenUsage } from '../xm-core/types/codex';
import { readLines, type ReadLinesOptions } from '../read/line-stream';

export interface TokenTotals {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
    records: number;
}

export interface RecentTokens {
    hours: number;
    claude: TokenTotals | null;
    codex: TokenTotals | null;
    copilot: null;
    filesRead: number;
}

const zero = (): TokenTotals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, records: 0 });

/** Claude Code totals of one file's lines (exported for tests). */
export function sumClaudeLines(lines: Iterable<string>, fromIso: string, toIso: string, seen: Set<string>, acc: TokenTotals): void {
    for (const line of lines) {
        const rec = parseLine(line);
        if (!rec) { continue; }
        const u = ccTokenUsage(rec);
        if (!u || u.model === '<synthetic>') { continue; }
        if (u.timestamp < fromIso || u.timestamp >= toIso) { continue; }
        const key = `${u.request_id}|${u.timestamp}`;
        if (seen.has(key)) { continue; }
        seen.add(key);
        acc.input += u.input_tokens;
        acc.output += u.output_tokens;
        acc.cacheRead += u.cache_read_input_tokens;
        acc.cacheWrite += u.cache_creation_input_tokens;
        acc.total += u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens;
        acc.records += 1;
    }
}

/** Codex usage rows of one file, deduplicated, preferring token_usage_record (exported for tests). */
export function codexUsages(lines: Iterable<string>): CodexTokenUsage[] {
    const ctx = newParseContext();
    const records: CodexTokenUsage[] = [];
    const counts: CodexTokenUsage[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
        const rec = parseCodexLine(line);
        if (!rec) { continue; }
        const ts = epochToIso(rec.timestamp);
        if (ts) { ctx.lastTs = ts; }
        const u = codexTokenUsage(rec, ctx);
        if (!u) { continue; }
        const key = `${u.origin}|${u.usageKey}`;
        if (seen.has(key)) { continue; }
        seen.add(key);
        (u.origin === 'usage_record' ? records : counts).push(u);
    }
    return records.length > 0 ? records : counts;
}

export function addCodex(usages: readonly CodexTokenUsage[], fromIso: string, toIso: string, acc: TokenTotals): void {
    for (const u of usages) {
        if (u.timestamp < fromIso || u.timestamp >= toIso) { continue; }
        acc.input += u.input;
        acc.output += u.output;
        acc.cacheRead += u.cached;
        acc.cacheWrite += u.cacheWrite;
        acc.total += u.total;
        acc.records += 1;
    }
}

export async function sumRecentTokens(
    refs: readonly SessionRef[],
    opts: { hours?: number; now?: number; claudeSubagentFiles?: readonly { file: string; mtimeMs: number }[] } & ReadLinesOptions = {},
): Promise<RecentTokens> {
    const hours = opts.hours ?? 168;
    const now = opts.now ?? Date.now();
    const fromMs = now - hours * 3600_000;
    const fromIso = new Date(fromMs).toISOString();
    const toIso = new Date(now).toISOString();
    const claude = zero();
    const codex = zero();
    const claudeSeen = new Set<string>();
    let hasClaude = false;
    let hasCodex = false;
    let filesRead = 0;
    for (const ref of refs) {
        if (ref.assistant === 'copilot') { continue; }
        if (ref.assistant === 'claude') { hasClaude = true; } else { hasCodex = true; }
        if (ref.mtimeMs < fromMs) { continue; }
        if (opts.signal?.aborted) { break; }
        const lines: string[] = [];
        filesRead += 1;
        if (ref.assistant === 'claude') {
            await readLines(ref.file, (l) => { sumClaudeLines([l], fromIso, toIso, claudeSeen, claude); }, opts);
        } else {
            await readLines(ref.file, (l) => { lines.push(l); }, opts);
            addCodex(codexUsages(lines), fromIso, toIso, codex);
        }
    }
    // Subagent transcripts: same extractor and keys (XM stores them with is_sidechain = 1).
    for (const sub of opts.claudeSubagentFiles ?? []) {
        hasClaude = true;
        if (sub.mtimeMs < fromMs) { continue; }
        if (opts.signal?.aborted) { break; }
        filesRead += 1;
        await readLines(sub.file, (l) => { sumClaudeLines([l], fromIso, toIso, claudeSeen, claude); }, opts);
    }
    return { hours, claude: hasClaude ? claude : null, codex: hasCodex ? codex : null, copilot: null, filesRead };
}
