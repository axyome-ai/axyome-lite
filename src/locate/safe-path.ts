/** Path checks. Roots and files are compared after realpath, so a symlink cannot lead outside a root. */
import * as fs from 'fs';
import * as path from 'path';

/** True when `child` is `root` or lies under it (both already absolute and resolved). */
export function isInsideRoot(child: string, root: string): boolean {
    const rel = path.relative(path.resolve(root), path.resolve(child));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Why an export target is refused, or null when it is allowed: never write inside an assistant's own store,
 * never overwrite without `force`.
 */
export function exportTargetProblem(target: string, storeRoots: readonly string[], force: boolean, exists: (p: string) => boolean = fs.existsSync): string | null {
    const abs = path.resolve(target);
    for (const root of storeRoots) {
        let realRoot = root;
        try { realRoot = fs.realpathSync(root); } catch { /* keep as given */ }
        let realParent = path.dirname(abs);
        try { realParent = fs.realpathSync(realParent); } catch { /* parent may not exist yet */ }
        if (isInsideRoot(abs, realRoot) || isInsideRoot(path.join(realParent, path.basename(abs)), realRoot)) {
            return `refusing to write inside an assistant's chat store (${root})`;
        }
    }
    if (!force && exists(abs)) { return `${abs} already exists (use --force to overwrite)`; }
    return null;
}

/** The realpath of `p` when it exists and lies inside the realpath of `root`; otherwise null. */
export function realpathWithin(p: string, root: string): string | null {
    try {
        const realRoot = fs.realpathSync(root);
        const realP = fs.realpathSync(p);
        return isInsideRoot(realP, realRoot) ? realP : null;
    } catch {
        return null;
    }
}
