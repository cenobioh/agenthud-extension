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
  { event: 'UserPromptSubmit', matcher: '' },
  { event: 'PreToolUse', matcher: '' },
  { event: 'Stop', matcher: '' },
  { event: 'Notification', matcher: 'permission_prompt' },
];

/**
 * Ensures targetDir's .claude/settings.json wires PreToolUse/Stop/Notification
 * hooks to this extension's bundled claude-agenthud-hook script. Merges into
 * existing settings/hooks rather than overwriting them, and is a no-op if the
 * existing file is malformed.
 */
export function ensureHookWiring(context: vscode.ExtensionContext, targetDir: string): void {
  const hookCommand =
    process.platform === 'win32'
      ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(
          context.extensionPath,
          'bin',
          'claude-agenthud-hook.ps1'
        )}"`
      : path.join(context.extensionPath, 'bin', 'claude-agenthud-hook');
  const settingsDir = path.join(targetDir, '.claude');
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
    const alreadyWired = entries.some((entry) => entry.hooks?.some((h) => h.command === hookCommand));
    if (!alreadyWired) {
      entries.push({ matcher, hooks: [{ type: 'command', command: hookCommand }] });
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
