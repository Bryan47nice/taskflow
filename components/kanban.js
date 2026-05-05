// === Kanban Board ===
const Kanban = {
  _activeCol: 'todo', // mobile: which column is visible

  render(tasks) {
    const today = App.getTodayKey();
    const cols = { todo: [], 'in-progress': [], done: [] };

    tasks.forEach(t => {
      const st = t.status || 'todo';
      if (cols[st]) cols[st].push(t);
    });

    // Sort each column: urgency (high first), then createdAt
    const urgOrd = { high: 0, medium: 1, low: 2 };
    Object.keys(cols).forEach(k => {
      cols[k].sort((a, b) => {
        const ud = (urgOrd[a.urgency] ?? 1) - (urgOrd[b.urgency] ?? 1);
        return ud !== 0 ? ud : (a.createdAt > b.createdAt ? 1 : -1);
      });
    });

    const EMPTY_HINTS = {
      'todo': '還沒有待辦任務\n點右下角 ＋ 新增',
      'in-progress': '沒有進行中的任務\n從待辦欄拖曳過來',
      'done': '今天還沒完成任何任務\n加油！'
    };

    ['todo', 'in-progress', 'done'].forEach(status => {
      const list = document.querySelector(`.task-list[data-status="${status}"]`);
      const countEl = document.querySelector(`.col-header[data-status="${status}"] .count`);
      if (!list) return;
      list.innerHTML = '';
      if (cols[status].length === 0) {
        const empty = document.createElement('div');
        empty.className = 'task-list-empty';
        empty.innerHTML = `
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>
          <p>${EMPTY_HINTS[status].replace('\n', '<br>')}</p>`;
        list.appendChild(empty);
      } else {
        cols[status].forEach(t => list.appendChild(this._card(t, today)));
      }
      if (countEl) countEl.textContent = cols[status].length;
    });

    // Mobile: update active tab counts
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const st = btn.dataset.status;
      btn.querySelector('.tab-count').textContent = cols[st]?.length ?? 0;
    });

    this._setupDragDrop();
  },

  _card(task, today) {
    const div = document.createElement('div');
    div.className = `task-card urgency-${task.urgency || 'medium'}`;
    div.dataset.id = task.id;
    div.draggable = true;

    const deadlineLabel = (() => {
      if (!task.deadline) return '';
      if (task.deadline === 'today') return '今天';
      if (task.deadline === 'tomorrow') return '明天';
      if (task.deadline === 'backlog') return 'Backlog';
      // Custom date YYYY-MM-DD → M/D
      const parts = task.deadline.split('-');
      if (parts.length === 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
      return task.deadline;
    })();

    const sourceIcon = this._sourceIcon(task.source?.type);
    const hasPDCA = task.pdca && Object.values(task.pdca).some(v => v?.trim());

    div.innerHTML = `
      <div class="card-header">
        <span class="urgency-dot"></span>
        <span class="card-title">${this._esc(task.title)}</span>
        ${hasPDCA ? '<span class="pdca-badge">PDCA</span>' : ''}
      </div>
      <div class="card-meta">
        ${sourceIcon || ''}
        <span class="estimate">${this._esc(task.estimate || '')}</span>
        <span class="deadline ${task.deadline === 'today' ? 'deadline-today' : ''}">${deadlineLabel}</span>
      </div>
    `;

    div.addEventListener('click', () => PDCA.show(task));

    // Swipe to change status on mobile
    this._addSwipe(div, task);

    return div;
  },

  _sourceIcon(type) {
    const labels = { gchat: 'Chat', jira: 'Jira', gmail: 'Mail', slack: 'Slack', notion: 'Notion', manual: '' };
    const label = labels[type];
    return label ? `<span class="source-badge">${label}</span>` : '';
  },

  _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _setupDragDrop() {
    document.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('taskId', card.dataset.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });

    document.querySelectorAll('.task-list').forEach(list => {
      list.addEventListener('dragover', e => {
        e.preventDefault();
        list.classList.add('drag-over');
        const after = this._dragAfterEl(list, e.clientY);
        const dragging = document.querySelector('.dragging');
        if (dragging) {
          if (after) list.insertBefore(dragging, after);
          else list.appendChild(dragging);
        }
      });
      list.addEventListener('dragleave', () => list.classList.remove('drag-over'));
      list.addEventListener('drop', async e => {
        e.preventDefault();
        list.classList.remove('drag-over');
        const id = e.dataTransfer.getData('taskId');
        const newStatus = list.dataset.status;
        await App.updateTask(id, {
          status: newStatus,
          done: newStatus === 'done',
          completedAt: newStatus === 'done' ? new Date().toISOString() : null
        });
      });
    });
  },

  _dragAfterEl(container, y) {
    const cards = [...container.querySelectorAll('.task-card:not(.dragging)')];
    return cards.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      return offset < 0 && offset > closest.offset ? { offset, el: child } : closest;
    }, { offset: Number.NEGATIVE_INFINITY }).el;
  },

  _addSwipe(el, task) {
    let startX = 0;
    el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', async e => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) < 60) return;
      const statuses = ['todo', 'in-progress', 'done'];
      const cur = statuses.indexOf(task.status || 'todo');
      const next = dx > 0 ? statuses[Math.min(cur + 1, 2)] : statuses[Math.max(cur - 1, 0)];
      if (next !== task.status) {
        await App.updateTask(task.id, {
          status: next,
          done: next === 'done',
          completedAt: next === 'done' ? new Date().toISOString() : null
        });
      }
    }, { passive: true });
  },

  // Mobile tab switching
  switchTab(status) {
    this._activeCol = status;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.status === status));
    document.querySelectorAll('.kanban-col').forEach(c => {
      c.classList.toggle('col-hidden', c.dataset.status !== status);
    });
  },

  init() {
    // Tab buttons (mobile)
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.status));
    });
    // Default: show todo
    this.switchTab('todo');
  }
};
