# FAQ

## Where does each assistant keep its chats?

| Assistant | Windows | macOS | Linux |
|---|---|---|---|
| **GitHub Copilot** (VS Code) | `%APPDATA%\Code\User\workspaceStorage\<id>\chatSessions` | `~/Library/Application Support/Code/User/workspaceStorage/<id>/chatSessions` | `~/.config/Code/User/workspaceStorage/<id>/chatSessions` |
| Copilot chats with no folder open | `…\Code\User\globalStorage\emptyWindowChatSessions` | same, under `Code/User/globalStorage` | same, under `Code/User/globalStorage` |
| **Claude Code** | `%USERPROFILE%\.claude\projects\<project>\<session>.jsonl` | `~/.claude/projects/<project>/<session>.jsonl` | `~/.claude/projects/<project>/<session>.jsonl` |
| **Codex** | `%USERPROFILE%\.codex\sessions\YYYY\MM\DD\rollout-*.jsonl` (or `$CODEX_HOME`) | `~/.codex/sessions/…` | `~/.codex/sessions/…` |

VS Code Insiders uses `Code - Insiders` instead of `Code`. Run **Where are my chats?** to see the folders on your
own computer.

## Does Axyome Lite send anything anywhere?

No. It makes no network calls, has no telemetry and needs no account. It only reads the chat files above and never
changes or deletes them. The only file it writes is the export you choose.

## Why are there no tokens for Copilot?

Copilot does not record tokens in its chat files. Claude Code and Codex do, so the token figures are the ones they
report in their own files.

## What does `[REDACTED]` replace?

In previews, exports and copies, Axyome Lite replaces:

- AWS access keys, GitHub tokens, OpenAI and Anthropic API keys, Slack tokens;
- JSON web tokens;
- IDs in the UUID format;
- the value after `password`, `passwd`, `secret`, `token`, `api_key`, `apikey` or `authToken` followed by `=` or `:`.

It matches patterns, so it cannot know every kind of secret. Read an export before you share it. To keep the original
text, turn off `axyomeLite.export.redactSecrets` (or use `--no-redact` on the command line).

## A chat says it is too large to open

Copilot chats larger than 64 MB are listed but not opened. [Axyome XM](https://marketplace.visualstudio.com/items?itemName=axyome-ai.axyome-ai-xm)
opens chats of any size.

## Does it read Cursor's chats?

Not the chat panel built into Cursor, which keeps its chats in a different format. In Cursor, Windsurf or VSCodium,
Axyome Lite finds your Claude Code and Codex chats, and the Copilot chats of VS Code on the same computer.

## A new chat does not appear

Click **Refresh** at the top of the Chats view.

## My Claude Code subagent runs are not listed

Claude Code subagent transcripts are not listed separately. Their tokens are counted in the token total.

## Can I search inside my chats?

Axyome Lite lists, opens and exports chats; it does not search their text. **Search all chats** opens
[Axyome XM](https://marketplace.visualstudio.com/items?itemName=axyome-ai.axyome-ai-xm) when it is installed, or its
Marketplace page when it is not.

## What is the difference with Axyome XM?

Axyome Lite finds, opens and exports chats, and it is open source (MIT).
[Axyome XM](https://marketplace.visualstudio.com/items?itemName=axyome-ai.axyome-ai-xm) remembers your whole coding
history: it searches every chat, replays any coding day, shows your AI usage per model and per hour, and gives Copilot
and Claude Code a memory of what you actually did.

## Where do I report a problem?

Open an issue on [GitHub](https://github.com/axyome-ai/axyome-lite/issues). Never paste chat text that contains
secrets.

— Axyome.ai Team
