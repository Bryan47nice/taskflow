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

    ['todo', 'in-progress', 'done'].forEach(status => {
      const list = document.querySelector(`.task-list[data-status="${status}"]`);
      const countEl = document.querySelector(`.col-header[data-status="${status}"] .count`);
      if (!list) return;
      list.innerHTML = '';
      cols[status].forEach(t => list.appendChild(this._card(t, today)));
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

    const deadlineLabel = {
      today: '今天',
      tomorrow: '明天',
      backlog: 'Backlog'
    }[task.deadline] || task.deadline || '';

    const sourceIcon = this._sourceIcon(task.source?.type);
    const hasPDCA = task.pdca && Object.values(task.pdca).some(v => v?.trim());

    div.innerHTML = `
      <div class="card-header">
        <span class="urgency-dot"></span>
        <span class="card-title">${this._esc(task.title)}</span>
        ${hasPDCA ? '<span class="pdca-badge">PDCA</span>' : ''}
      </div>
      <div class="card-meta">
        ${sourceIcon ? `<span class="source-icon" title="${this._esc(task.source?.type || '')}">${sourceIcon}</span>` : ''}
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
    return { gchat: '💬', jira: '🔷', gmail: '📧', slack: '💼', notion: '📝', manual: '' }[type] || '';
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
