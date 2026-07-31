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

Clicking a card in the HUD focuses that terminal. Clicking a card's title lets you rename it inline (local override — future `--title` updates for that terminal are ignored until the terminal is closed). Each card shows an elapsed-time label (e.g. "3m ago") based on its last status update. Sessions `WAITING_ON_DECISION` are always sorted to the top, the AgentHUD activity-bar icon shows a badge with the count of sessions waiting on a decision, and a native notification (with a **Focus** action) fires the moment a session enters that state. Sessions persist across window reloads (reconciled against terminals still open). A session still `WORKING` after `agenthud.stuckThresholdMinutes` (default 10) with no update is flagged "possibly stuck?" with a dashed red border. Run **AgentHUD: Focus Next Decision** from the command palette to cycle through sessions waiting on a decision without opening the sidebar. Cards are grouped by parent folder once you have sessions in more than one location.

## Wiring up a real Claude Code session

AgentHUD ships a Claude Code hook bridge (`bin/claude-agenthud-hook`) that maps hook events to statuses:

| Hook event | AgentHUD status |
|---|---|
| `UserPromptSubmit`, `PreToolUse` | `WORKING` |
| `Stop` | `IDLE` |
| `Notification` (`permission_prompt`) | `WAITING_ON_DECISION` |

**Automatic wiring** — the **+ New Session** button handles setup for you: creates a new, dedicated folder for the session (you pick the parent directory — browse or type a path — and name it), writes `.claude/settings.json` hooks into that new folder pointing at the extension's bundled hook script, then opens a terminal `cd`'d into it with `AGENTHUD_TERMINAL`/`AGENTHUD_TITLE` already set and runs `claude chat`. The folder is *not* git-initialized — that's left to you/the agent. The parent directory you pick is remembered as the default for next time; set `agenthud.defaultSessionsDirectory` in settings to control the initial default (falls back to your home directory).

Each card also has a **×** close button — click it to end that session (confirms, then disposes the terminal and removes the card). IDLE cards additionally show a **↻** restart button that resends `claude chat` into that same terminal.

Run `/hooks` inside a session to confirm `PreToolUse`/`Stop`/`Notification` point at `claude-agenthud-hook`, then give it a prompt that triggers a tool call and watch the HUD update.

Note: if launched from within another Claude Code session, you'll need to `unset CLAUDECODE` first (nested-session guard).

**Manual wiring** (if you'd rather not auto-write `.claude/settings.json`): copy the hooks block from this repo's `.claude/settings.json` into your project, pointing `command` at your installed extension's `bin/claude-agenthud-hook`, then set `AGENTHUD_TERMINAL`/`AGENTHUD_TITLE` yourself before running `claude`.

**Windows**: sessions created via **+ New Session** wire hooks to `bin/claude-agenthud-hook.ps1` (invoked via `powershell -File`) instead of the bash script automatically; `bin/agent-emit.ps1` is the PowerShell equivalent of `bin/agent-emit` for manual use.

**Port conflicts**: if you run more than one AgentHUD-enabled window/profile, the second instance's IPC server will fail to bind to the shared default port. Set `agenthud.port` in settings to a different port for that window — the **+ New Session** terminal automatically gets `AGENTHUD_PORT` exported to match, so `agent-emit`/hooks started from that button pick it up with no extra steps. For terminals wired manually, export `AGENTHUD_PORT` yourself before running `claude`.

## IPC API

`POST http://127.0.0.1:4545/api/status` (or your configured `agenthud.port`) — binds to localhost only. Body is a partial, upsert-by-`terminalId` payload:

```json
{ "terminalId": "agent-1", "taskTitle": "Refactor auth", "status": "WORKING" }
```

Returns `200` with the merged session, or `400` on malformed JSON / missing `terminalId`.

## Architecture

- `src/state/SessionStore.ts` — in-memory session map, merge/upsert logic
- `src/bridge/ipcServer.ts` — raw `http` server for `/api/status`
- `src/listeners/terminalListener.ts` — tracks terminal focus/close to mark messages seen / drop closed sessions
- `src/ui/SidebarProvider.ts` + `src/ui/webview/` — the HUD webview
- `bin/agent-emit` / `bin/agent-emit.ps1` — CLI wrapper for manual/agent-hook status emission (bash / PowerShell)
- `bin/claude-agenthud-hook` / `bin/claude-agenthud-hook.ps1` — Claude Code hook → `agent-emit` bridge (bash / PowerShell)
