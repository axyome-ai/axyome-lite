/** Streaming line reader (Claude Code and Codex files can reach hundreds of MB). */
import * as fs from 'fs';
import * as readline from 'readline';

export interface ReadLinesOptions {
    signal?: { aborted: boolean };
    /** Injectable for tests (K-6 spies on it). */
    createReadStream?: typeof fs.createReadStream;
}

/** Calls `onLine` for every non-empty line; resolves when the file ends or the signal aborts. */
export async function readLines(file: string, onLine: (line: string) => void, opts: ReadLinesOptions = {}): Promise<void> {
    const open = opts.createReadStream ?? fs.createReadStream;
    const stream = open(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    try {
        for await (const line of rl) {
            if (opts.signal?.aborted) { break; }
            if (line.trim()) { onLine(line); }
        }
    } finally {
        rl.close();
        stream.destroy();
    }
}

/** The first `maxBytes` of a file as text (for titles in the tree; never the whole file). */
export function readHead(file: string, maxBytes = 256 * 1024): string {
    const fd = fs.openSync(file, 'r');
    try {
        const buf = Buffer.alloc(maxBytes);
        const n = fs.readSync(fd, buf, 0, maxBytes, 0);
        return buf.subarray(0, n).toString('utf8');
    } finally {
        fs.closeSync(fd);
    }
}
