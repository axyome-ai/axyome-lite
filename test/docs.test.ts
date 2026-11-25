/** DX-T1…DX-T3: the public docs. Links and images resolve, screenshots carry no metadata, claims stay honest. */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const REPO_BLOB = 'https://github.com/axyome-ai/axyome-lite/blob/main/';

function walk(dir: string, ext: string): string[] {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) { return []; }
    return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
        const rel = path.posix.join(dir, e.name);
        return e.isDirectory() ? walk(rel, ext) : e.name.endsWith(ext) ? [rel] : [];
    });
}

const DOCS = ['README.md', 'CONTRIBUTING.md', ...walk('docs', '.md')];
const IMAGES = walk('docs/images', '.png');

/** Link and image targets of a Markdown file, outside fenced code blocks: [x](t), ![x](t), src="t", href="t". */
export function linkTargets(markdown: string): string[] {
    const text = markdown.replace(/```[\s\S]*?```/g, '');
    const out: string[] = [];
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) { out.push(m[1]); }
    for (const m of text.matchAll(/\b(?:src|href)="([^"]+)"/g)) { out.push(m[1]); }
    return out;
}

/** The chunk types of a PNG file, in order; throws when the signature is wrong. */
export function pngChunkTypes(buf: Buffer): string[] {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!buf.subarray(0, 8).equals(sig)) { throw new Error('not a PNG'); }
    const types: string[] = [];
    let at = 8;
    while (at + 8 <= buf.length) {
        const len = buf.readUInt32BE(at);
        types.push(buf.toString('latin1', at + 4, at + 8));
        at += 12 + len;
    }
    return types;
}

describe('public docs', () => {
    it('DX-T1 every relative link and image resolves to a file of the package; every screenshot is used', () => {
        expect(DOCS.length).toBeGreaterThanOrEqual(10);
        const missing: string[] = [];
        const used = new Set<string>();
        for (const doc of DOCS) {
            for (const target of linkTargets(fs.readFileSync(path.join(ROOT, doc), 'utf8'))) {
                let rel: string;
                if (target.startsWith(REPO_BLOB)) { rel = target.slice(REPO_BLOB.length); }
                else if (/^([a-z]+:|#)/i.test(target)) { continue; }
                else { rel = path.posix.normalize(path.posix.join(path.posix.dirname(doc), target.split('#')[0])); }
                if (!fs.existsSync(path.join(ROOT, rel))) { missing.push(`${doc} -> ${target}`); }
                used.add(rel);
            }
        }
        expect(missing).toEqual([]);
        expect(IMAGES.filter((img) => !used.has(img))).toEqual([]);
    });

    it('DX-T1b the issue-template links point at files of the package', () => {
        const yml = fs.readFileSync(path.join(ROOT, '.github', 'ISSUE_TEMPLATE', 'config.yml'), 'utf8');
        const targets = [...yml.matchAll(/url: (\S+)/g)].map((m) => m[1]);
        expect(targets.length).toBeGreaterThan(0);
        for (const t of targets) {
            expect(t.startsWith(REPO_BLOB)).toBe(true);
            expect(fs.existsSync(path.join(ROOT, t.slice(REPO_BLOB.length)))).toBe(true);
        }
    });

    it('DX-T2 screenshots are PNGs without text or EXIF metadata, at most 400 KB each', () => {
        expect(IMAGES).toHaveLength(8);
        for (const img of IMAGES) {
            const buf = fs.readFileSync(path.join(ROOT, img));
            expect(buf.length, img).toBeLessThanOrEqual(400 * 1024);
            const types = pngChunkTypes(buf);
            expect(types[0], img).toBe('IHDR');
            expect(types[types.length - 1], img).toBe('IEND');
            expect(types.filter((t) => ['tEXt', 'iTXt', 'zTXt', 'eXIf'].includes(t)), img).toEqual([]);
        }
    });

    it('DX-T3 the docs make no price claim and no search claim; every tutorial is listed', () => {
        for (const doc of DOCS) {
            const t = fs.readFileSync(path.join(ROOT, doc), 'utf8');
            expect(t, doc).not.toMatch(/\$\s?\d/);
            expect(t, doc).not.toMatch(/Axyome Lite (searches|lets you search)/i);
        }
        const index = fs.readFileSync(path.join(ROOT, 'docs', 'tutorials', 'README.md'), 'utf8');
        const tutorials = walk('docs/tutorials', '.md').filter((f) => !f.endsWith('/README.md'));
        expect(tutorials.length).toBeGreaterThanOrEqual(4);
        for (const t of tutorials) { expect(index, t).toContain(`(${path.posix.basename(t)})`); }
    });

    it('DX-T3b linkTargets and pngChunkTypes read what they should', () => {
        expect(linkTargets('![a [b]](x/y.png) [c](../z.md#h) <img src="q.png" />\n```\n[no](skip.md)\n```')).toEqual(['x/y.png', '../z.md#h', 'q.png']);
        expect(() => pngChunkTypes(Buffer.from('GIF89a'))).toThrow(/not a PNG/);
    });
});
