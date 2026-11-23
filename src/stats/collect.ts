/**
 * Dashboard counts from file metadata only (no parsing).
 * "Per day" uses each file's last change, in local days: a chat counts on the day it was last changed.
 */
import { ASSISTANTS, type Assistant, type SessionRef } from '../model';

export interface ChatStats {
    days: number;
    perAssistant: Record<Assistant, number>;
    /** Oldest → newest, `days` entries; `date` is the local YYYY-MM-DD. */
    perDay: { date: string; count: number }[];
    largest: { id: string; assistant: Assistant; file: string; size: number; title?: string }[];
    storage: Record<Assistant, number>;
}

export function localDate(ms: number): string {
    const d = new Date(ms);
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function collectChatStats(refs: readonly SessionRef[], opts: { days?: number; now?: number } = {}): ChatStats {
    const days = Math.min(Math.max(Math.round(opts.days ?? 30), 1), 366);
    const now = opts.now ?? Date.now();
    const perAssistant = Object.fromEntries(ASSISTANTS.map((a) => [a, 0])) as Record<Assistant, number>;
    const storage = Object.fromEntries(ASSISTANTS.map((a) => [a, 0])) as Record<Assistant, number>;

    const dayKeys: string[] = [];
    const base = new Date(now);
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i, 12);
        dayKeys.push(localDate(d.getTime()));
    }
    const counts = new Map(dayKeys.map((k) => [k, 0]));

    for (const r of refs) {
        perAssistant[r.assistant] += 1;
        storage[r.assistant] += r.size;
        const k = localDate(r.mtimeMs);
        if (counts.has(k)) { counts.set(k, (counts.get(k) ?? 0) + 1); }
    }
    const largest = [...refs]
        .sort((a, b) => b.size - a.size || a.id.localeCompare(b.id))
        .slice(0, 5)
        .map((r) => ({ id: r.id, assistant: r.assistant, file: r.file, size: r.size, title: r.title }));

    return { days, perAssistant, perDay: dayKeys.map((date) => ({ date, count: counts.get(date) ?? 0 })), largest, storage };
}
