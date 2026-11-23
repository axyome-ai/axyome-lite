#!/usr/bin/env node
/**
 * Export this package to a clone of the public repo axyome-ai/axyome-lite.
 *
 *   node scripts/export-public.mjs <publicRepoRoot>            copy the allow-listed files
 *   node scripts/export-public.mjs <publicRepoRoot> --check    write nothing; exit 1 listing every file that differs
 *   --forbid <file>   also refuse any line matching a pattern of <file> (one literal per line, # comments)
 *
 * Before anything is written (and in --check), every exported file is scanned for internal references
 * (INTERNAL_REF) and, with --forbid, for the private names. Any match: exit 1 with file:line, nothing written.
 *
 * Only the allow-list below is exported: never node_modules, dist, *.vsix or anything outside this package.
 * The public repo's own files (.git, .github) are left untouched.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Top-level entries exported; directories are copied recursively. */
export const EXPORT_ENTRIES = Object.freeze([
    'package.json', 'package-lock.json', 'README.md', 'LICENSE', 'CHANGELOG.md', '.gitignore',
    'resources', 'scripts', 'src', 'test',
]);

/** Internal process references that must never reach the public repository. */
export const INTERNAL_REF = /LITE-\d|\bOD-\d|§\s?\d|docs\/(?:plans|postmortems|analysis)\/|packages\/mem-ag-basic/;

/** One case-insensitive literal pattern per non-empty, non-# line of a private list file. */
export function readForbidList(file) {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
        .map((l) => new RegExp(l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

/** Every line of a text that matches one of the patterns, as "file:line: pattern". Binary files are skipped. */
export function scanText(rel, buf, patterns) {
    if (buf.includes(0)) { return []; }
    const hits = [];
    buf.toString('utf8').split('\n').forEach((line, i) => {
        for (const p of patterns) { if (p.test(line)) { hits.push(`${rel}:${i + 1}: ${p.source}`); } }
    });
    return hits;
}

/** The exported files, relative to pkgRoot, with forward slashes. */
export function exportedFiles(pkgRoot) {
    const out = [];
    for (const entry of EXPORT_ENTRIES) {
        if (fs.existsSync(path.join(pkgRoot, entry))) { out.push(...listFiles(pkgRoot, entry)); }
    }
    return out;
}

/** Every hit of the patterns in the exported files. */
export function scanExport(pkgRoot, patterns) {
    return exportedFiles(pkgRoot).flatMap((rel) => scanText(rel.split(path.sep).join('/'), fs.readFileSync(path.join(pkgRoot, rel)), patterns));
}

const SKIP = /(^|[\\/])(node_modules|dist|\.vitest|coverage)([\\/]|$)|\.vsix$/i;

function listFiles(root, rel = '') {
    const abs = path.join(root, rel);
    const st = fs.statSync(abs);
    if (st.isFile()) { return [rel]; }
    const out = [];
    for (const name of fs.readdirSync(abs).sort()) {
        const childRel = rel ? path.join(rel, name) : name;
        if (SKIP.test(childRel)) { continue; }
        out.push(...listFiles(root, childRel));
    }
    return out;
}

/** @returns {string[]} files that differ (check) or were written (export), as forward-slash paths */
export function exportPublic(pkgRoot, publicRoot, { check = false, forbid = [] } = {}) {
    if (!publicRoot) { throw new Error('usage: export-public.mjs <publicRepoRoot> [--check] [--forbid <file>]'); }
    const hits = scanExport(pkgRoot, [INTERNAL_REF, ...forbid]);
    if (hits.length) { throw new Error(`refused: ${hits.length} line(s) must not be published:\n  ${hits.join('\n  ')}`); }
    const changed = [];
    {
        for (const rel of exportedFiles(pkgRoot)) {
            const src = fs.readFileSync(path.join(pkgRoot, rel));
            const dest = path.join(publicRoot, rel);
            const cur = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
            if (!cur || !cur.equals(src)) {
                changed.push(rel.split(path.sep).join('/'));
                if (!check) {
                    fs.mkdirSync(path.dirname(dest), { recursive: true });
                    fs.writeFileSync(dest, src);
                }
            }
        }
    }
    return changed;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const args = process.argv.slice(2);
    const check = args.includes('--check');
    const fi = args.indexOf('--forbid');
    const forbidFile = fi >= 0 ? args[fi + 1] : undefined;
    const target = args.find((a, i) => !a.startsWith('--') && i !== fi + 1);
    try {
        if (fi >= 0 && !forbidFile) { throw new Error('--forbid needs a file'); }
        const forbid = forbidFile ? readForbidList(path.resolve(forbidFile)) : [];
        const changed = exportPublic(PKG_ROOT, target ? path.resolve(target) : '', { check, forbid });
        if (check) {
            if (changed.length) { console.error(`public repo differs (${changed.length}):\n  ${changed.join('\n  ')}`); process.exit(1); }
            console.log('public repo in sync');
        } else {
            console.log(`exported ${changed.length} changed file(s) to ${target}`);
        }
    } catch (e) {
        console.error(String(e && e.message ? e.message : e));
        process.exit(1);
    }
}
