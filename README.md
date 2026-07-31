# AgentHUD

Status HUD and one-click focus router for AI agents running in native Cursor/VS Code integrated terminal tabs. Agents run in plain, unmodified terminals (no PTY wrapping — full shell autofill, aliases, `Ctrl+R` history preserved). A local IPC server streams status updates to a sidebar webview.

## Setup

```bash
npm install
npm run compile
```

Open this folder in Cursor/VS Code and press `F5` to launch an Extension Development Host window. Open the **Agent HUD** icon (robot) in the activity bar.

## Manual testing (`agent-emit`)

`bin/agent-emit` posts a status update to the local IPC server (`127.0.0.1:4545`):

```bash
# rename an integrated terminal to "agent-1" first, so it matches --terminal
bin/agent-emit --terminal agent-1 --title "Refactor auth" --status WORKING
bin/agent-emit --terminal agent-1 --status WAITING_ON_DECISION --prompt "Use JWT or session cookies?"
bin/agent-emit --terminal agent-1 --status IDLE --snippet "Done, awaiting review"
```

Flags: `--terminal` (required, must match the terminal's tab name), `--status` (required, `WORKING` | `WAITING_ON_DECISION` | `IDLE`), `--title`, `--prompt`, `--snippet`.

Clicking a card in the HUD focuses that terminal. Clicking a card's title lets you rename it inline (local override — future `--title` updates for that terminal are ignored until the terminal is closed).

## Wiring up a real Claude Code session

AgentHUD ships a Claude Code hook bridge (`bin/claude-agenthud-hook`) that maps hook events to statuses:

| Hook event | AgentHUD status |
|---|---|
| `UserPromptSubmit`, `PreToolUse` | `WORKING` |
| `Stop` | `IDLE` |
| `Notification` (`permission_prompt`) | `WAITING_ON_DECISION` |

**Automatic wiring** — two sidebar buttons handle setup for you (both write/merge the `.claude/settings.json` hooks into the current workspace, pointing at the extension's bundled hook script):

- **+ New Session** — opens a fresh terminal with `AGENTHUD_TERMINAL`/`AGENTHUD_TITLE` already set and runs `claude chat`. Works immediately, no manual steps.
- **Link Terminal** — pick an already-open terminal from a quick-pick list; AgentHUD exports the env vars directly into it. If `claude` is already running there, exit and restart it (`Ctrl+D` then `claude`) so it picks up the new environment.

Run `/hooks` inside a session to confirm `PreToolUse`/`Stop`/`Notification` point at `claude-agenthud-hook`, then give it a prompt that triggers a tool call and watch the HUD update.

Note: if launched from within another Claude Code session, you'll need to `unset CLAUDECODE` first (nested-session guard).

**Manual wiring** (if you'd rather not auto-write `.claude/settings.json`): copy the hooks block from this repo's `.claude/settings.json` into your project, pointing `command` at your installed extension's `bin/claude-agenthud-hook`, then set `AGENTHUD_TERMINAL`/`AGENTHUD_TITLE` yourself before running `claude`.

## IPC API

`POST http://127.0.0.1:4545/api/status` — binds to localhost only. Body is a partial, upsert-by-`terminalId` payload:

```json
{ "terminalId": "agent-1", "taskTitle": "Refactor auth", "status": "WORKING" }
```

Returns `200` with the merged session, or `400` on malformed JSON / missing `terminalId`.

## Architecture

- `src/state/SessionStore.ts` — in-memory session map, merge/upsert logic
- `src/bridge/ipcServer.ts` — raw `http` server for `/api/status`
- `src/listeners/terminalListener.ts` — tracks terminal focus/close to mark messages seen / drop closed sessions
- `src/ui/SidebarProvider.ts` + `src/ui/webview/` — the HUD webview
- `bin/agent-emit` — CLI wrapper for manual/agent-hook status emission
- `bin/claude-agenthud-hook` — Claude Code hook → `agent-emit` bridge
