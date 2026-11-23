#!/usr/bin/env node
/** Two esbuild bundles, dist/extension.js (VS Code) and dist/cli.js (npx). No runtime dependencies. */
import { build } from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const common = {
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    sourcemap: false,
    minify: false,
    legalComments: 'inline',
    define: { __LITE_VERSION__: JSON.stringify(pkg.version) },
    logLevel: 'warning',
};

export async function buildAll() {
    fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
    await build({ ...common, entryPoints: [path.join(root, 'src', 'extension.ts')], outfile: path.join(root, 'dist', 'extension.js'), external: ['vscode'] });
    await build({ ...common, entryPoints: [path.join(root, 'src', 'cli.ts')], outfile: path.join(root, 'dist', 'cli.js'), banner: { js: '#!/usr/bin/env node' } });
    for (const f of ['extension.js', 'cli.js']) {
        const s = fs.statSync(path.join(root, 'dist', f));
        console.log(`dist/${f} ${s.size} bytes`);
    }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    buildAll().catch((e) => { console.error(e); process.exit(1); });
}
