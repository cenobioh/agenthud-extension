import * as vscode from 'vscode';

export interface AgentSession {
  terminalId: string; // must match vscode.Terminal.name
  taskTitle: string;
  status: 'WORKING' | 'WAITING_ON_DECISION' | 'IDLE';
  decisionPrompt?: string; // only meaningful when status === WAITING_ON_DECISION
  lastMessageSnippet?: string;
  lastMessageSeen: boolean; // true if terminal focused when message arrived / focused since
  titleOverridden: boolean; // true once user manually renames via HUD; blocks future IPC taskTitle updates
  lastUpdated: number;
}

export type StatusPayload = Partial<AgentSession> & { terminalId: string };

export class SessionStore {
  private sessions = new Map<string, AgentSession>();
  private _onDidChange = new vscode.EventEmitter<AgentSession[]>();
  readonly onDidChange = this._onDidChange.event;

  upsert(payload: StatusPayload, activeTerminalName: string | undefined): AgentSession {
    const existing = this.sessions.get(payload.terminalId);

    const taskTitle = existing?.titleOverridden
      ? existing.taskTitle
      : payload.taskTitle ?? existing?.taskTitle ?? payload.terminalId;

    const status = payload.status ?? existing?.status ?? 'IDLE';

    const decisionPrompt =
      status === 'WAITING_ON_DECISION' ? payload.decisionPrompt ?? existing?.decisionPrompt : undefined;

    const lastMessageSeen =
      payload.lastMessageSnippet !== undefined
        ? activeTerminalName === payload.terminalId
        : existing?.lastMessageSeen ?? true;

    const merged: AgentSession = {
      terminalId: payload.terminalId,
      taskTitle,
      status,
      decisionPrompt,
      lastMessageSnippet: payload.lastMessageSnippet ?? existing?.lastMessageSnippet,
      lastMessageSeen,
      titleOverridden: existing?.titleOverridden ?? false,
      lastUpdated: Date.now(),
    };

    this.sessions.set(payload.terminalId, merged);
    this.emitChange();
    return merged;
  }

  markSeen(terminalId: string): void {
    const session = this.sessions.get(terminalId);
    if (session && !session.lastMessageSeen) {
      session.lastMessageSeen = true;
      this.emitChange();
    }
  }

  rename(terminalId: string, title: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      return;
    }
    session.taskTitle = title;
    session.titleOverridden = true;
    this.emitChange();
  }

  remove(terminalId: string): void {
    if (this.sessions.delete(terminalId)) {
      this.emitChange();
    }
  }

  getAll(): AgentSession[] {
    return [...this.sessions.values()].sort((a, b) => b.lastUpdated - a.lastUpdated);
  }

  private emitChange(): void {
    this._onDidChange.fire(this.getAll());
  }
}
