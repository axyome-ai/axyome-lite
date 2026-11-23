/** T-1…T-4: public names, honest claims, manifest facts, no internal references. */
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

interface ExportModule {
    INTERNAL_REF: RegExp;
    readForbidList(file: string): RegExp[];
    scanExport(pkgRoot: string, patterns: RegExp[]): string[];
}

const ROOT = path.join(__dirname, '..');
const read = (f: string): string => fs.readFileSync(path.join(ROOT, f), 'utf8');

/**
 * The names that must never be published are kept in a private list outside this repository, so this test does not
 * publish them itself. AXYOME_LITE_FORBIDDEN_FILE names that list; without it, the list next to the private source
 * tree is used when present; otherwise (the public repository) the name check is skipped.
 */
const DEFAULT_LIST = path.join(ROOT, '..', '..', 'scripts', 'public-forbidden-names.txt');
const FORBIDDEN_FILE = process.env.AXYOME_LITE_FORBIDDEN_FILE || (fs.existsSync(DEFAULT_LIST) ? DEFAULT_LIST : '');

let m: ExportModule;
beforeAll(async () => {
    m = (await import(pathToFileURL(path.join(ROOT, 'scripts', 'export-public.mjs')).href)) as ExportModule;
});

describe('public text', () => {
    it.skipIf(!FORBIDDEN_FILE)('T-1 no private name in any published file', () => {
        const patterns = m.readForbidList(FORBIDDEN_FILE);
        expect(patterns.length).toBeGreaterThan(0);
        expect(m.scanExport(ROOT, patterns)).toEqual([]);
    });

    it('T-1b the licence is MIT', () => {
        expect(read('LICENSE')).toMatch(/^MIT License/);
    });

    it('T-2 README claims match the product', () => {
        const t = read('README.md');
        expect(t).toContain('https://marketplace.visualstudio.com/items?itemName=axyome-ai.axyome-ai-xm');
        expect(t).toMatch(/Copilot does not record tokens/i);
        // Lite does not search chat text (that is Axyome XM) and never states a price or a cost figure.
        expect(t).not.toMatch(/Axyome Lite (searches|lets you search)/i);
        expect(t).not.toMatch(/\$\s?\d/);
    });

    it('T-3 manifest: engine floor, publisher, licence, no runtime deps', () => {
        const pkg = JSON.parse(read('package.json')) as { engines: { vscode: string }; publisher: string; license: string; name: string; keywords: string[] };
        expect(pkg.engines.vscode).toBe('^1.90.0');
        expect(pkg.publisher).toBe('axyome-ai');
        expect(pkg.license).toBe('MIT');
        expect(pkg.name).toBe('axyome-lite');
        expect(pkg.keywords.length).toBeLessThanOrEqual(30);
    });

    it('T-4 no internal process reference in any published file', () => {
        expect(m.scanExport(ROOT, [m.INTERNAL_REF])).toEqual([]);
    });
});
