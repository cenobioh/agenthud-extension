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
  sessionDir?: string; // set for sessions created via "+ New Session"; used to group cards by parent folder
}

export type StatusPayload = Partial<AgentSession> & { terminalId: string };

export class SessionStore {
  private sessions = new Map<string, AgentSession>();
  private _onDidChange = new vscode.EventEmitter<AgentSession[]>();
  readonly onDidChange = this._onDidChange.event;
  private _onDecision = new vscode.EventEmitter<AgentSession>();
  readonly onDecision = this._onDecision.event;

  upsert(payload: StatusPayload, activeTerminalName: string | undefined): AgentSession {
    const existing = this.sessions.get(payload.terminalId);

    const taskTitle = existing?.titleOverridden
      ? existing.taskTitle
      : payload.taskTitle ?? existing?.taskTitle ?? payload.terminalId;

    const status = payload.status ?? existing?.status ?? 'IDLE';

    const decisionPrompt =
      status === 'WAITING_ON_DECISION' ? payload.decisionPrompt ?? existing?.decisionPrompt : undefined;

    const lastMessageSnippet =
      payload.lastMessageSnippet !== undefined
        ? payload.lastMessageSnippet
        : status === 'IDLE'
          ? existing?.lastMessageSnippet
          : undefined;

    const lastMessageSeen =
      payload.lastMessageSnippet !== undefined
        ? activeTerminalName === payload.terminalId
        : existing?.lastMessageSeen ?? true;

    const merged: AgentSession = {
      terminalId: payload.terminalId,
      taskTitle,
      status,
      decisionPrompt,
      lastMessageSnippet,
      lastMessageSeen,
      titleOverridden: existing?.titleOverridden ?? false,
      lastUpdated: Date.now(),
      sessionDir: payload.sessionDir ?? existing?.sessionDir,
    };

    this.sessions.set(payload.terminalId, merged);
    this.emitChange();
    if (status === 'WAITING_ON_DECISION' && existing?.status !== 'WAITING_ON_DECISION') {
      this._onDecision.fire(merged);
    }
    return merged;
  }

  /** Reconciles persisted sessions with currently-live terminals on activation. */
  restore(sessions: AgentSession[], liveTerminalIds: Set<string>): void {
    this.sessions.clear();
    for (const session of sessions) {
      if (liveTerminalIds.has(session.terminalId)) {
        this.sessions.set(session.terminalId, session);
      }
    }
    this.emitChange();
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
    return [...this.sessions.values()].sort((a, b) => {
      const aDecision = a.status === 'WAITING_ON_DECISION' ? 1 : 0;
      const bDecision = b.status === 'WAITING_ON_DECISION' ? 1 : 0;
      if (aDecision !== bDecision) return bDecision - aDecision;
      return b.lastUpdated - a.lastUpdated;
    });
  }

  private emitChange(): void {
    this._onDidChange.fire(this.getAll());
  }
}
