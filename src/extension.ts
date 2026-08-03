import * as http from 'http';
import * as vscode from 'vscode';
import { startIpcServer } from './bridge/ipcServer';
import { registerTerminalListener } from './listeners/terminalListener';
import { AgentSession, SessionStore } from './state/SessionStore';
import { SidebarProvider } from './ui/SidebarProvider';

const SESSIONS_STORAGE_KEY = 'agenthud.savedSessions';

let ipcServer: http.Server | undefined;
let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('AgentHUD');
  context.subscriptions.push(outputChannel);

  const store = new SessionStore();

  const saved = context.globalState.get<AgentSession[]>(SESSIONS_STORAGE_KEY, []);
  const liveTerminalIds = new Set(vscode.window.terminals.map((t) => t.name));
  store.restore(saved, liveTerminalIds);

  const provider = new SidebarProvider(context, store);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('agenthud.sidebar', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(store.onDidChange((sessions) => context.globalState.update(SESSIONS_STORAGE_KEY, sessions)));

  context.subscriptions.push(
    store.onDecision((session) => {
      const message = `${session.taskTitle}: waiting on a decision${
        session.decisionPrompt ? ` — ${session.decisionPrompt}` : ''
      }`;
      vscode.window.showInformationMessage(message, 'Focus').then((choice) => {
        if (choice !== 'Focus') return;
        const terminal = vscode.window.terminals.find((t) => t.name === session.terminalId);
        if (terminal) {
          terminal.show(false);
          store.markSeen(session.terminalId);
        }
      });
    })
  );

  registerTerminalListener(store, context);

  let lastFocusedDecisionId: string | undefined;
  context.subscriptions.push(
    vscode.commands.registerCommand('agenthud.focusNextDecision', () => {
      const decisions = store.getAll().filter((s) => s.status === 'WAITING_ON_DECISION');
      if (decisions.length === 0) {
        vscode.window.showInformationMessage('AgentHUD: no sessions waiting on a decision.');
        return;
      }
      const currentIndex = decisions.findIndex((s) => s.terminalId === lastFocusedDecisionId);
      const next = decisions[(currentIndex + 1) % decisions.length];
      const terminal = vscode.window.terminals.find((t) => t.name === next.terminalId);
      if (terminal) {
        terminal.show(false);
        store.markSeen(next.terminalId);
      }
      lastFocusedDecisionId = next.terminalId;
    })
  );

  const port = vscode.workspace.getConfiguration('agenthud').get<number>('port', 4545);
  ipcServer = startIpcServer(
    store,
    () => vscode.window.activeTerminal?.name,
    (msg) => outputChannel?.appendLine(msg),
    port
  );
}

export function deactivate(): void {
  ipcServer?.close();
}
