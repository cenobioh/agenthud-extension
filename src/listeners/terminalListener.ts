import * as vscode from 'vscode';
import { SessionStore } from '../state/SessionStore';

export function registerTerminalListener(store: SessionStore, context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTerminal((terminal) => {
      if (terminal) {
        store.markSeen(terminal.name);
      }
    }),
    vscode.window.onDidCloseTerminal((terminal) => {
      store.remove(terminal.name);
    })
  );
}
