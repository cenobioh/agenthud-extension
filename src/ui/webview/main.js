(function () {
  const vscode = acquireVsCodeApi();
  const container = document.getElementById('sessions');

  window.addEventListener('message', (event) => {
    if (event.data.command === 'updateState') {
      render(event.data.sessions);
    }
  });

  function statusClass(session) {
    if (session.status === 'WAITING_ON_DECISION') return 'status-decision';
    if (session.status === 'WORKING') {
      return session.lastMessageSeen ? 'status-working-seen' : 'status-working-unseen';
    }
    return session.lastMessageSeen ? 'status-idle-seen' : 'status-idle-unseen';
  }

  function render(sessions) {
    container.innerHTML = '';
    for (const session of sessions) {
      container.appendChild(renderCard(session));
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
    card.appendChild(titleRow);

    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = session.status + (session.status === 'WAITING_ON_DECISION' ? ' — Action Required' : '');
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
