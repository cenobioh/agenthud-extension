import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { SessionStore } from '../state/SessionStore';
import { ensureHookWiring, nextTerminalId } from '../util/hookWiring';

const LAST_SESSION_PARENT_DIR_KEY = 'agenthud.lastSessionParentDir';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly extensionUri: vscode.Uri;

  constructor(private readonly context: vscode.ExtensionContext, private readonly store: SessionStore) {
    this.extensionUri = context.extensionUri;
    store.onDidChange((sessions) => this.postState(sessions));
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'src', 'ui', 'webview')],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.command === 'ready') {
        this.postState(this.store.getAll());
      } else if (message.command === 'focusTerminal') {
        const terminal = vscode.window.terminals.find((t) => t.name === message.terminalId);
        if (terminal) {
          terminal.show(false);
          this.store.markSeen(message.terminalId);
        }
      } else if (message.command === 'renameTask') {
        this.store.rename(message.terminalId, message.title);
      } else if (message.command === 'newSession') {
        this.startNewSession();
      } else if (message.command === 'closeSession') {
        this.closeSession(message.terminalId);
      } else if (message.command === 'restartSession') {
        this.restartSession(message.terminalId);
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.postState(this.store.getAll());
      }
    });

    this.postState(this.store.getAll());
  }

  private postState(sessions: ReturnType<SessionStore['getAll']>): void {
    const stuckThresholdMinutes = vscode.workspace
      .getConfiguration('agenthud')
      .get<number>('stuckThresholdMinutes', 10);
    this.view?.webview.postMessage({ command: 'updateState', sessions, stuckThresholdMinutes });
    this.updateBadge(sessions);
  }

  private updateBadge(sessions: ReturnType<SessionStore['getAll']>): void {
    if (!this.view) return;
    const count = sessions.filter((s) => s.status === 'WAITING_ON_DECISION').length;
    this.view.badge = count > 0 ? { value: count, tooltip: `${count} session(s) waiting on a decision` } : undefined;
  }

  private async startNewSession(): Promise<void> {
    const defaultParent = this.defaultSessionsParentDir();

    const choice = await vscode.window.showQuickPick(['Browse for folder…', 'Type a path…'], {
      placeHolder: `Where should the new session folder go? (default: ${defaultParent})`,
    });
    if (!choice) return;

    let parentDir: string | undefined;
    if (choice === 'Browse for folder…') {
      const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(defaultParent),
        openLabel: 'Select Parent Folder',
      });
      parentDir = picked?.[0]?.fsPath;
    } else {
      parentDir = await vscode.window.showInputBox({
        prompt: 'Parent directory for the new session',
        value: defaultParent,
      });
    }
    if (!parentDir) return;

    const name = await vscode.window.showInputBox({
      prompt: 'Name for the new session folder',
      value: nextTerminalId('claude'),
      validateInput: (value) => {
        if (!value.trim()) return 'Name cannot be empty';
        if (/[\\/]/.test(value)) return 'Name cannot contain path separators';
        if (fs.existsSync(path.join(parentDir!, value))) return 'A folder with this name already exists here';
        if (vscode.window.terminals.some((t) => t.name === value)) return 'A terminal with this name is already open';
        return undefined;
      },
    });
    if (!name) return;

    const sessionDir = path.join(parentDir, name);
    fs.mkdirSync(sessionDir, { recursive: true });
    this.context.globalState.update(LAST_SESSION_PARENT_DIR_KEY, parentDir);

    ensureHookWiring(this.context, sessionDir);

    const port = vscode.workspace.getConfiguration('agenthud').get<number>('port', 4545);
    const terminal = vscode.window.createTerminal({
      name,
      cwd: sessionDir,
      env: { AGENTHUD_TERMINAL: name, AGENTHUD_TITLE: name, AGENTHUD_PORT: String(port) },
    });
    terminal.show();
    terminal.sendText('claude chat');

    this.store.upsert({ terminalId: name, taskTitle: name, status: 'IDLE', sessionDir }, name);
  }

  private defaultSessionsParentDir(): string {
    const lastUsed = this.context.globalState.get<string>(LAST_SESSION_PARENT_DIR_KEY);
    if (lastUsed) return lastUsed;
    const configured = vscode.workspace.getConfiguration('agenthud').get<string>('defaultSessionsDirectory')?.trim();
    return configured || os.homedir();
  }

  private async closeSession(terminalId: string): Promise<void> {
    const terminal = vscode.window.terminals.find((t) => t.name === terminalId);
    if (!terminal) {
      this.store.remove(terminalId);
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Close session "${terminalId}"? This will terminate the terminal.`,
      { modal: true },
      'Close'
    );
    if (confirm !== 'Close') return;

    terminal.dispose(); // triggers onDidCloseTerminal -> store.remove
  }

  private restartSession(terminalId: string): void {
    const terminal = vscode.window.terminals.find((t) => t.name === terminalId);
    if (!terminal) return;
    terminal.show(false);
    terminal.sendText('claude chat');
    this.store.markSeen(terminalId);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'ui', 'webview', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'ui', 'webview', 'styles.css')
    );
    const nonce = String(Date.now());

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div class="toolbar">
    <button id="new-session">+ New Session</button>
  </div>
  <div id="sessions"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
