# Contributing to Axyome Lite

Thank you for helping. Issues and pull requests are welcome.

## Report a problem or ask for a feature

Open an [issue](https://github.com/axyome-ai/axyome-lite/issues/new/choose). Please say which editor and version,
which operating system and which assistant (Copilot, Claude Code or Codex) are involved.

**Never paste chat text that contains secrets, customer data or private code.** A short, invented example that shows
the problem is enough.

## Build and test

You need Node.js 18 or later.

```text
npm ci
npm test            # unit tests (vitest)
npm run typecheck   # TypeScript, strict
npm run build       # dist/extension.js and dist/cli.js
```

Try the command line from your build:

```text
node dist/cli.js where
```

To try the extension, package it with `npm run package` and install the `.vsix` from the Extensions view (`…` menu,
**Install from VSIX…**).

## Where things are

| Folder | What it holds |
|---|---|
| `src/locate/` | finds the chat folders of each assistant |
| `src/read/` | reads Copilot, Claude Code and Codex chat files |
| `src/render/` | Markdown output and secret redaction |
| `src/stats/` | the counts and token totals of the My chats page and `stats` |
| `src/vscode/` | the Chats view, the previews and the My chats page |
| `src/cli.ts` | the `axyome-lite` command |
| `src/xm-core/` | parsers shared with Axyome XM (see below) |
| `test/` | unit tests; `test/fixtures/` holds invented chats only |
| `docs/` | install guide, onboarding, tutorials, FAQ and screenshots |

## `src/xm-core`

The files in `src/xm-core/` are generated copies of parsers from Axyome XM, so that both products read chats the same
way. Each starts with a "GENERATED … do not edit here" line. Please do not change them in a pull request; open an
issue that describes the problem instead, and we will fix it at the source.

## Pull requests

- Keep each pull request to one change, with a test that fails before it and passes after it.
- `npm test` and `npm run typecheck` must pass.
- Axyome Lite stays local only: no network calls, no telemetry, and it never writes to an assistant's chat folders.
- Test data must be invented. Never add real chats, names, paths or keys.

By contributing, you agree that your contribution is licensed under the [MIT licence](LICENSE).

— Axyome.ai Team
