/** RC-1…RC-5: Copilot sessions (legacy .json and incremental .jsonl through the vendored reconstructor). */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { LiteError } from '../src/model';
import { readCopilotConversation } from '../src/read/copilot';
import { FIXTURES, tmpDir } from './helpers';

const ref = (file: string) => ({ id: 'copilot:x', file, project: 'demo-repo' });

describe('readCopilotConversation', () => {
    it('RC-1 legacy JSON gives 2 user and 2 assistant turns, thinking excluded, title from the first prompt', async () => {
        const c = await readCopilotConversation(ref(path.join(FIXTURES, 'copilot-legacy.json')));
        expect(c.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
        expect(c.turns[1].text).toBe('Use fs.readFileSync for small files. Use streams for large ones.');
        expect(c.turns[1].text).not.toContain('hidden reasoning');
        expect(c.turns[1].text).not.toContain('\\n');
        expect(c.title).toBe('How do I read a file in Node?');
    });

    it('RC-2 the JSONL patch file gives the same turns as the equivalent legacy file', async () => {
        const a = await readCopilotConversation(ref(path.join(FIXTURES, 'copilot-legacy.json')));
        const b = await readCopilotConversation(ref(path.join(FIXTURES, 'copilot-session.jsonl')));
        expect(b.turns).toEqual(a.turns);
        expect(b.startedAt).toBe(a.startedAt);
    });

    it('RC-3 a legacy file above 64 MB is refused with a pointer to Axyome XM', async () => {
        await expect(readCopilotConversation(ref(path.join(FIXTURES, 'copilot-legacy.json')), { statSize: () => 65 * 1048576 }))
            .rejects.toThrow(/larger than 64 MB.*Axyome XM/);
    });

    it('RC-4 a JSONL file above 64 MB is refused the same way (the vendored reconstructor reads whole files)', async () => {
        const p = readCopilotConversation(ref(path.join(FIXTURES, 'copilot-session.jsonl')), { statSize: () => 418 * 1048576 });
        await expect(p).rejects.toBeInstanceOf(LiteError);
        await expect(readCopilotConversation(ref(path.join(FIXTURES, 'copilot-session.jsonl')), { statSize: () => 418 * 1048576 }))
            .rejects.toMatchObject({ code: 'too-large' });
    });

    it('RC-5 a corrupt legacy file is reported as unreadable', async () => {
        const f = path.join(tmpDir(), 'broken.json');
        fs.writeFileSync(f, '{"requests": [ {"message": ');
        await expect(readCopilotConversation(ref(f))).rejects.toMatchObject({ code: 'unreadable' });
        await expect(readCopilotConversation(ref(f))).rejects.toThrow(/unreadable/);
    });
});
