/** P-1…P-3: no network code, no runtime dependencies, writes only to the export target. */
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';
import { runCli } from '../src/cli';
import { EXPECTED, NOW_MS, makeTmpHome, tmpDir } from './helpers';

const ROOT = path.join(__dirname, '..');

beforeAll(async () => {
    const b = (await import(pathToFileURL(path.join(ROOT, 'scripts', 'build.mjs')).href)) as { buildAll(): Promise<void> };
    await b.buildAll();
}, 120_000);

describe('privacy', () => {
    it('P-1 the two bundles contain no network module and no fetch', () => {
        for (const f of ['extension.js', 'cli.js']) {
            const text = fs.readFileSync(path.join(ROOT, 'dist', f), 'utf8');
            expect(text.length).toBeGreaterThan(1000);
            expect(text).not.toMatch(/require\("(?:node:)?(?:http|https|http2|net|tls|dns|dgram|undici)"\)/);
            expect(text).not.toMatch(/\bfetch\(/);
        }
    });

    it('P-2 no runtime dependencies', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
        expect(pkg.dependencies === undefined || Object.keys(pkg.dependencies).length === 0).toBe(true);
    });

    it('P-3 an export writes exactly once, to the -o target', async () => {
        const h = makeTmpHome();
        const writes: string[] = [];
        const dest = path.join(tmpDir(), 'one.md');
        const code = await runCli(['export', `claude:${EXPECTED.sessionIds.claude}`, '-o', dest], {
            out: () => undefined, err: () => undefined, now: NOW_MS,
            discover: { platform: 'linux', env: {}, home: h.home },
            writeFile: (f) => { writes.push(f); },
        });
        expect(code).toBe(0);
        expect(writes).toEqual([path.resolve(dest)]);
    });
});
