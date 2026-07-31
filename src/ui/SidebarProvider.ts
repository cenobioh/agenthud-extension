import * as vscode from 'vscode';
import { SessionStore } from '../state/SessionStore';
import { ensureHookWiring, nextTerminalId } from '../util/hookWiring';

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
      if (message.command === 'focusTerminal') {
        const terminal = vscode.window.terminals.find((t) => t.name === message.terminalId);
        if (terminal) {
          terminal.show(false);
          this.store.markSeen(message.terminalId);
        }
      } else if (message.command === 'renameTask') {
        this.store.rename(message.terminalId, message.title);
      } else if (message.command === 'newSession') {
        this.startNewSession();
      } else if (message.command === 'linkTerminal') {
        this.linkExistingTerminal();
      }
    });

    this.postState(this.store.getAll());
  }

  private postState(sessions: ReturnType<SessionStore['getAll']>): void {
    this.view?.webview.postMessage({ command: 'updateState', sessions });
  }

  private startNewSession(): void {
    ensureHookWiring(this.context);

    const terminalId = nextTerminalId('claude');
    const title = 'Claude session';
    const terminal = vscode.window.createTerminal({
      name: terminalId,
      env: { AGENTHUD_TERMINAL: terminalId, AGENTHUD_TITLE: title },
    });
    terminal.show();
    terminal.sendText('claude chat');

    this.store.upsert({ terminalId, taskTitle: title, status: 'IDLE' }, terminalId);
  }

  private async linkExistingTerminal(): Promise<void> {
    const terminals = vscode.window.terminals;
    if (terminals.length === 0) {
      vscode.window.showInformationMessage('AgentHUD: no terminals are open to link.');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      terminals.map((t) => t.name),
      { placeHolder: 'Select a terminal to link to AgentHUD' }
    );
    if (!picked) return;

    const terminal = terminals.find((t) => t.name === picked);
    if (!terminal) return;

    const title =
      (await vscode.window.showInputBox({
        prompt: 'Task title for this session (optional)',
        value: picked,
      })) || picked;

    ensureHookWiring(this.context);

    terminal.show();
    terminal.sendText(`export AGENTHUD_TERMINAL="${picked}" && export AGENTHUD_TITLE="${title}"`);
    vscode.window.showInformationMessage(
      `AgentHUD: linked "${picked}". If Claude Code is already running there, restart it (exit and run \`claude\` again) so it picks up the new environment.`
    );

    this.store.upsert({ terminalId: picked, taskTitle: title, status: 'IDLE' }, picked);
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
    <button id="link-terminal">Link Terminal</button>
  </div>
  <div id="sessions"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
