(function () {
  const vscode = acquireVsCodeApi();
  const container = document.getElementById('sessions');

  document.getElementById('new-session').addEventListener('click', () => {
    vscode.postMessage({ command: 'newSession' });
  });

  let latestSessions = [];
  let stuckThresholdMinutes = 10;

  window.addEventListener('message', (event) => {
    if (event.data.command === 'updateState') {
      latestSessions = event.data.sessions;
      if (typeof event.data.stuckThresholdMinutes === 'number') {
        stuckThresholdMinutes = event.data.stuckThresholdMinutes;
      }
      render(latestSessions);
    }
  });

  // Periodically refresh elapsed-time labels even when no new state arrives.
  setInterval(() => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    render(latestSessions);
  }, 30000);

  function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  function isStuck(session) {
    if (session.status !== 'WORKING') return false;
    return Date.now() - session.lastUpdated > stuckThresholdMinutes * 60000;
  }

  function statusClass(session) {
    if (session.status === 'WAITING_ON_DECISION') return 'status-decision';
    if (session.status === 'WORKING') {
      if (isStuck(session)) return 'status-working-stuck';
      return session.lastMessageSeen ? 'status-working-seen' : 'status-working-unseen';
    }
    return session.lastMessageSeen ? 'status-idle-seen' : 'status-idle-unseen';
  }

  function parentDir(p) {
    if (!p) return null;
    const normalized = p.replace(/[\\/]+$/, '');
    const idx = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    return idx >= 0 ? normalized.slice(0, idx) : null;
  }

  function baseName(p) {
    const normalized = p.replace(/[\\/]+$/, '');
    const idx = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    return idx >= 0 ? normalized.slice(idx + 1) : normalized;
  }

  function render(sessions) {
    container.innerHTML = '';

    const groups = new Map();
    for (const session of sessions) {
      const key = parentDir(session.sessionDir) || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(session);
    }

    if (groups.size <= 1) {
      for (const session of sessions) container.appendChild(renderCard(session));
      return;
    }

    for (const [key, group] of groups) {
      const header = document.createElement('div');
      header.className = 'group-header';
      header.textContent = key ? baseName(key) : 'Other';
      container.appendChild(header);
      for (const session of group) container.appendChild(renderCard(session));
    }
  }

  function renderCard(session) {
    const card = document.createElement('div');
    card.className = `card ${statusClass(session)}`;
    card.addEventListener('click', () => {
      vscode.postMessage({ command: 'focusTerminal', terminalId: session.terminalId });
    });

    const titleRow = document.createElement('div');
    titleRow.className = 'title-row';
    titleRow.appendChild(renderTitle(session));

    if (session.status === 'IDLE') {
      const restartBtn = document.createElement('button');
      restartBtn.className = 'restart-btn';
      restartBtn.textContent = '↻';
      restartBtn.title = 'Restart claude in this terminal';
      restartBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        vscode.postMessage({ command: 'restartSession', terminalId: session.terminalId });
      });
      titleRow.appendChild(restartBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close session';
    closeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      vscode.postMessage({ command: 'closeSession', terminalId: session.terminalId });
    });
    titleRow.appendChild(closeBtn);

    card.appendChild(titleRow);

    const badge = document.createElement('div');
    badge.className = 'badge';
    let badgeText = session.status;
    if (session.status === 'WAITING_ON_DECISION') badgeText += ' — Action Required';
    if (isStuck(session)) badgeText += ' — possibly stuck?';
    badge.textContent = badgeText;
    card.appendChild(badge);

    if (session.decisionPrompt) {
      const prompt = document.createElement('div');
      prompt.className = 'prompt';
      prompt.textContent = session.decisionPrompt;
      card.appendChild(prompt);
    }

    if (session.lastMessageSnippet) {
      const snippet = document.createElement('div');
      snippet.className = 'snippet';
      snippet.textContent = session.lastMessageSnippet;
      card.appendChild(snippet);
    }

    if (!session.lastMessageSeen) {
      const dot = document.createElement('span');
      dot.className = 'unseen-dot';
      card.appendChild(dot);
    }

    const time = document.createElement('div');
    time.className = 'time-ago';
    time.textContent = timeAgo(session.lastUpdated);
    card.appendChild(time);

    return card;
  }

  function renderTitle(session) {
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = session.taskTitle || session.terminalId;
    title.title = 'Click to rename';

    title.addEventListener('click', (event) => {
      event.stopPropagation(); // don't also trigger the card's focusTerminal click
      startEditingTitle(title, session);
    });

    return title;
  }

  function startEditingTitle(titleEl, session) {
    const input = document.createElement('input');
    input.className = 'title-input';
    input.value = session.taskTitle || '';
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = (commit) => {
      if (finished) return;
      finished = true;
      const value = input.value.trim();
      const nextTitle = commit && value ? value : session.taskTitle;
      if (commit && value && value !== session.taskTitle) {
        vscode.postMessage({ command: 'renameTask', terminalId: session.terminalId, title: value });
      }
      // Revert to display mode immediately; the next 'updateState' will reconcile with authoritative state.
      input.replaceWith(renderTitle({ ...session, taskTitle: nextTitle }));
    };

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        finish(true);
      } else if (event.key === 'Escape') {
        finish(false);
      }
    });
    input.addEventListener('click', (event) => event.stopPropagation());
  }
})();
