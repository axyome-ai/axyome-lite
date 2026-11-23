/** F-1…F-2: the fixtures are synthetic and reproducible. */
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';
import { FIXTURES, tmpDir } from './helpers';

const ALLOWED_UUIDS = new Set([
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
]);

describe('fixtures', () => {
    it('F-1 no e-mail, no real user path, no UUID outside the fixture allow-list', () => {
        for (const f of fs.readdirSync(FIXTURES)) {
            const t = fs.readFileSync(path.join(FIXTURES, f), 'utf8');
            expect(t, f).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
            expect(t, f).not.toMatch(/[A-Za-z]:\\\\Users\\\\(?!test)/);
            expect(t, f).not.toMatch(/\/Users\/(?!test)/);
            expect(t, f).not.toMatch(/\/home\/(?!test\b)/);
            for (const u of t.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []) {
                expect(ALLOWED_UUIDS.has(u.toLowerCase()), `${f}: ${u}`).toBe(true);
            }
        }
    });

    it('F-2 make-fixtures.mjs reproduces the committed fixtures byte for byte', async () => {
        const m = (await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'make-fixtures.mjs')).href)) as { writeFixtures(dir: string): string[] };
        const out = tmpDir();
        const names = m.writeFixtures(out);
        expect(names).toHaveLength(6);
        for (const n of names) {
            expect(fs.readFileSync(path.join(out, n)).equals(fs.readFileSync(path.join(FIXTURES, n))), n).toBe(true);
        }
    });
});
