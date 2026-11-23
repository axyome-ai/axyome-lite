/** E-1…E-5: VS Code user folders per OS (same rule as Axyome XM). */
import { describe, expect, it } from 'vitest';
import { resolveEditorUserDirs } from '../src/locate/editor-dirs';

describe('resolveEditorUserDirs', () => {
    it('E-1 Windows uses APPDATA', () => {
        const exists = (p: string): boolean => p === 'C:\\x\\Code\\User';
        expect(resolveEditorUserDirs('win32', { APPDATA: 'C:\\x' }, 'C:\\h', [], exists)).toEqual([{ product: 'Code', path: 'C:\\x\\Code\\User' }]);
    });

    it('E-2 Windows without APPDATA falls back to <home>\\AppData\\Roaming', () => {
        const seen: string[] = [];
        const out = resolveEditorUserDirs('win32', {}, 'C:\\h', [], (p) => { seen.push(p); return true; });
        expect(out[0]).toEqual({ product: 'Code', path: 'C:\\h\\AppData\\Roaming\\Code\\User' });
        expect(seen).toContain('C:\\h\\AppData\\Roaming\\Code - Insiders\\User');
    });

    it('E-3 macOS and Linux paths', () => {
        expect(resolveEditorUserDirs('darwin', {}, '/Users/t', [], () => true)[0].path).toBe('/Users/t/Library/Application Support/Code/User');
        expect(resolveEditorUserDirs('linux', {}, '/home/t', [], () => true)[0].path).toBe('/home/t/.config/Code/User');
    });

    it('E-4 folders that do not exist are dropped', () => {
        expect(resolveEditorUserDirs('linux', {}, '/home/t', [], () => false)).toEqual([]);
    });

    it('E-5 extra folders are kept once, as custom', () => {
        const out = resolveEditorUserDirs('linux', {}, '/home/t', ['/opt/portable/User', '/opt/portable/User'], (p) => p.startsWith('/opt'));
        expect(out).toEqual([{ product: 'custom', path: '/opt/portable/User' }]);
    });
});
