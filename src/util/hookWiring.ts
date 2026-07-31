import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface HookEntry {
  matcher: string;
  hooks: { type: 'command'; command: string }[];
}

interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

const HOOK_EVENTS: { event: string; matcher: string }[] = [
  { event: 'PreToolUse', matcher: '' },
  { event: 'Stop', matcher: '' },
  { event: 'Notification', matcher: 'permission_prompt' },
];

/**
 * Ensures the current workspace's .claude/settings.json wires PreToolUse/Stop/
 * Notification hooks to this extension's bundled claude-agenthud-hook script.
 * Merges into existing settings/hooks rather than overwriting them, and is a
 * no-op if there's no open workspace folder or the existing file is malformed.
 */
export function ensureHookWiring(context: vscode.ExtensionContext): void {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;

  const hookScript = path.join(context.extensionPath, 'bin', 'claude-agenthud-hook');
  const settingsDir = path.join(folder.uri.fsPath, '.claude');
  const settingsPath = path.join(settingsDir, 'settings.json');

  let config: ClaudeSettings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      vscode.window.showWarningMessage(
        'AgentHUD: could not parse existing .claude/settings.json — skipping automatic hook wiring.'
      );
      return;
    }
  }
  config.hooks = config.hooks || {};

  let changed = !fs.existsSync(settingsPath);
  for (const { event, matcher } of HOOK_EVENTS) {
    const entries = (config.hooks[event] = config.hooks[event] || []);
    const alreadyWired = entries.some((entry) => entry.hooks?.some((h) => h.command === hookScript));
    if (!alreadyWired) {
      entries.push({ matcher, hooks: [{ type: 'command', command: hookScript }] });
      changed = true;
    }
  }

  if (!changed) return;

  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2) + '\n');
}

/** Returns the next unused `${prefix}-N` terminal name, e.g. claude-1, claude-2. */
export function nextTerminalId(prefix: string): string {
  const existing = new Set(vscode.window.terminals.map((t) => t.name));
  let n = 1;
  while (existing.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
