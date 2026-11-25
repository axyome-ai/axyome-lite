# Install Axyome Lite

Axyome Lite is free, needs no account and works offline. Pick the way that fits your editor.

## VS Code

1. Open the Extensions view: `Ctrl+Shift+X` (Windows, Linux) or `Cmd+Shift+X` (macOS).
2. Search for **Axyome Lite** and click **Install**.

Or open the [VS Code Marketplace page](https://marketplace.visualstudio.com/items?itemName=axyome-ai.axyome-lite).

Axyome Lite needs VS Code 1.90 or later.

## Cursor, Windsurf, VSCodium and other editors that use Open VSX

1. Open the Extensions view.
2. Search for **Axyome Lite** and click **Install**.

Or open the [Open VSX page](https://open-vsx.org/extension/axyome-ai/axyome-lite).

In these editors, Axyome Lite finds your Claude Code and Codex chats, and the Copilot chats of VS Code and
VS Code Insiders on the same computer. The chat panel built into Cursor keeps its chats in its own format, which
Axyome Lite does not read.

## From a `.vsix` file

1. Open the Extensions view.
2. Click the `…` menu at the top of the view and choose **Install from VSIX…**.
3. Pick the `axyome-lite-<version>.vsix` file.

## Command line only

The same features run in a terminal. You need Node.js 18 or later.

```text
npx axyome-lite where
```

To install the command once instead of downloading it each time:

```text
npm install -g axyome-lite
axyome-lite --help
```

## Check that it works

In VS Code, open the Explorer (`Ctrl+Shift+E` or `Cmd+Shift+E`). A **Chats (Axyome Lite)** section appears under
your files. If it is empty, run **Axyome Lite: Where are my chats?** from the Command Palette (`Ctrl+Shift+P` or
`Cmd+Shift+P`): it lists every folder it checked.

Next: [the first five minutes](onboarding.md).

## Uninstall

Uninstall it from the Extensions view (or `npm uninstall -g axyome-lite` for the command line).

Axyome Lite keeps no database, cache or log, so there is nothing else to clean up. Your chats and the files you
exported are never touched.

— Axyome.ai Team
