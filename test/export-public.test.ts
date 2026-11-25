/** PX-T3, PX-T4: the export refuses internal references and private names, and writes nothing then. DX-T4, DX-T5: docs. */
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';
import { tmpDir } from './helpers';

interface ExportModule {
    exportPublic(pkgRoot: string, publicRoot: string, o?: { check?: boolean; forbid?: RegExp[] }): string[];
    readForbidList(file: string): RegExp[];
    exportedFiles(pkgRoot: string): string[];
}

const ROOT = path.join(__dirname, '..');
let m: ExportModule;
beforeAll(async () => {
    m = (await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'export-public.mjs')).href)) as ExportModule;
});

/** A minimal package: README.md and src/a.ts with the given text. */
function pkgWith(text: string): string {
    const root = tmpDir('lite-pkg-');
    fs.writeFileSync(path.join(root, 'README.md'), '# Demo\n');
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), `export const a = 1;\n${text}\n`);
    return root;
}

describe('exportPublic', () => {
    it('PX-T3 refuses a file that names a private plan path, reports file:line, writes nothing', () => {
        const out = tmpDir('lite-pub-');
        const pkg = pkgWith('// see docs/' + 'plans/x.md');
        expect(() => m.exportPublic(pkg, out)).toThrow(/src\/a\.ts:2:/);
        expect(fs.readdirSync(out)).toEqual([]);
    });

    it('PX-T4 refuses a name of the --forbid list; exports when nothing matches', () => {
        const list = path.join(tmpDir('lite-list-'), 'names.txt');
        fs.writeFileSync(list, '# private names\nAcme Corp\n\n');
        const forbid = m.readForbidList(list);
        expect(forbid).toHaveLength(1);

        const out = tmpDir('lite-pub-');
        expect(() => m.exportPublic(pkgWith('// made by ACME corp'), out, { forbid })).toThrow(/src\/a\.ts:2: Acme Corp/);
        expect(fs.readdirSync(out)).toEqual([]);

        const written = m.exportPublic(pkgWith('// made by us'), out, { forbid });
        expect(written.sort()).toEqual(['README.md', 'src/a.ts']);
    });

    it('DX-T4 the export includes the docs, the screenshots, CONTRIBUTING.md and the .github templates', () => {
        const files = m.exportedFiles(ROOT).map((f) => f.split(path.sep).join('/'));
        for (const f of ['docs/images/01-chats-view.png', 'docs/tutorials/README.md', 'CONTRIBUTING.md', '.github/ISSUE_TEMPLATE/bug_report.yml']) {
            expect(files).toContain(f);
        }
        expect(files.some((f) => /(^|\/)(node_modules|dist)\//.test(f) || f.endsWith('.vsix'))).toBe(false);
    });

    it('DX-T5 docs and .github never ship in the npm package or the VSIX (package.json "files")', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { files: string[] };
        expect(pkg.files.length).toBeGreaterThan(0);
        expect(pkg.files.filter((f) => /^(\.\/)?(docs|\.github)(\/|$)/.test(f))).toEqual([]);
    });
});
