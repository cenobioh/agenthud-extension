import * as vscode from 'vscode';
import { SessionStore } from '../state/SessionStore';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri, private readonly store: SessionStore) {
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
      }
    });

    this.postState(this.store.getAll());
  }

  private postState(sessions: ReturnType<SessionStore['getAll']>): void {
    this.view?.webview.postMessage({ command: 'updateState', sessions });
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
  <div id="sessions"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
