# Changelog

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
