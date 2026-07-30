import * as http from 'http';
import * as vscode from 'vscode';
import { startIpcServer } from './bridge/ipcServer';
import { registerTerminalListener } from './listeners/terminalListener';
import { SessionStore } from './state/SessionStore';
import { SidebarProvider } from './ui/SidebarProvider';

let ipcServer: http.Server | undefined;
let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('AgentHUD');
  context.subscriptions.push(outputChannel);

  const store = new SessionStore();
  const provider = new SidebarProvider(context.extensionUri, store);

  context.subscriptions.push(vscode.window.registerWebviewViewProvider('agenthud.sidebar', provider));

  registerTerminalListener(store, context);

  ipcServer = startIpcServer(
    store,
    () => vscode.window.activeTerminal?.name,
    (msg) => outputChannel?.appendLine(msg)
  );
}

export function deactivate(): void {
  ipcServer?.close();
}
