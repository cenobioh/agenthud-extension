# Changelog

## 0.0.5

- Add `agenthud.port` setting for the IPC server; the "+ New Session" terminal
  automatically exports `AGENTHUD_PORT` to match, and `bin/agent-emit`
  respects it.
- Add a restart (↻) button on `IDLE` cards to resend `claude chat` into that
  terminal.
- Add `agenthud.stuckThresholdMinutes` setting; a `WORKING` session with no
  update past that threshold is flagged "possibly stuck?" with a dashed red
  border.
- Add the **AgentHUD: Focus Next Decision** command to cycle through
  `WAITING_ON_DECISION` sessions from the command palette.
- Add Windows support: `bin/agent-emit.ps1` and
  `bin/claude-agenthud-hook.ps1`; hook wiring now auto-selects the PowerShell
  hook on `win32`.
- Cards are grouped by parent folder when sessions span more than one
  location.

## 0.0.4

- "New Session" now lets you pick (browse or type) the parent directory and
  name for a dedicated new session folder; the parent is remembered as the
  default, configurable via `agenthud.defaultSessionsDirectory`.
- Remove "Link Terminal" button (superseded by the folder-based New Session
  flow).
- Add a close (×) button on each session card to end a session (confirms,
  disposes the terminal, removes the card).
- Fix: a session's "Turn complete" snippet no longer persists once a new
  prompt sets it back to `WORKING`.
- Sessions now persist across window reloads (reconciled against terminals
  still open on activation).
- Add an activity-bar badge showing the count of sessions
  `WAITING_ON_DECISION`.
- Sessions `WAITING_ON_DECISION` are always sorted to the top of the list.
- Show a native notification (with a "Focus" action) the moment a session
  enters `WAITING_ON_DECISION`.
- Show an elapsed-time label ("3m ago") on each card.

## 0.0.3

- "New Session" button now auto-wires the workspace's `.claude/settings.json`
  hooks and starts the terminal with `AGENTHUD_TERMINAL`/`AGENTHUD_TITLE` set,
  so no manual hook setup is needed.
- Add "Link Terminal" button to associate an already-open terminal with
  AgentHUD (exports the env vars into it directly; requires restarting an
  already-running `claude` session in that terminal).

## 0.0.2

- Add marketplace icon.
- Add "New Session" button to sidebar HUD.

## 0.0.1

Initial release.

- Sidebar HUD showing agent session cards (task title, status, decision prompt, last message snippet).
- Local IPC server (`127.0.0.1:4545`) for status updates via `bin/agent-emit` or Claude Code hooks.
- One-click terminal focus routing from HUD cards.
- Inline task title rename.
- Message read / unseen tracking based on terminal focus.
