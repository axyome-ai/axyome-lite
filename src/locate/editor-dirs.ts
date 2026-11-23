/**
 * The VS Code user folders that hold Copilot chat sessions.
 *
 * Same rule as Axyome XM: Windows
 * %APPDATA%\<Product>\User (fallback <home>\AppData\Roaming), macOS ~/Library/Application Support/<Product>/User,
 * Linux ~/.config/<Product>/User. Products: VS Code and VS Code Insiders.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { EditorDir } from '../model';

export const EDITOR_PRODUCTS: readonly string[] = ['Code', 'Code - Insiders'];

export function userDirFor(product: string, platform: string, env: Record<string, string | undefined>, home: string): string {
    if (platform === 'win32') {
        const appData = env.APPDATA ?? path.win32.join(home, 'AppData', 'Roaming');
        return path.win32.join(appData, product, 'User');
    }
    if (platform === 'darwin') {
        return path.posix.join(home, 'Library', 'Application Support', product, 'User');
    }
    return path.posix.join(home, '.config', product, 'User');
}

export function resolveEditorUserDirs(
    platform: string,
    env: Record<string, string | undefined>,
    home: string,
    extra: readonly string[] = [],
    exists: (p: string) => boolean = fs.existsSync,
): EditorDir[] {
    const out: EditorDir[] = [];
    const seen = new Set<string>();
    const add = (product: string, p: string): void => {
        const key = platform === 'win32' ? p.toLowerCase() : p;
        if (seen.has(key) || !exists(p)) { return; }
        seen.add(key);
        out.push({ product, path: p });
    };
    for (const product of EDITOR_PRODUCTS) { add(product, userDirFor(product, platform, env, home)); }
    for (const p of extra) { if (p && p.trim()) { add('custom', p.trim()); } }
    return out;
}
