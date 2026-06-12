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

    // Sort each column: urgency (high first), then manual order, then createdAt
    const urgOrd = { high: 0, medium: 1, low: 2 };
    Object.keys(cols).forEach(k => {
      cols[k].sort((a, b) => {
        const ud = (urgOrd[a.urgency] ?? 1) - (urgOrd[b.urgency] ?? 1);
        if (ud !== 0) return ud;
        const ao = a.order ?? Infinity;
        const bo = b.order ?? Infinity;
        if (ao !== bo) return ao - bo;
        return a.createdAt > b.createdAt ? 1 : -1;
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

    // 擱置區（側欄卡）：parked 不屬於上面三欄，另外撈出渲染
    const parked = tasks.filter(t => t.status === 'parked');
    parked.sort((a, b) => {
      const ud = (urgOrd[a.urgency] ?? 1) - (urgOrd[b.urgency] ?? 1);
      if (ud !== 0) return ud;
      const ao = a.order ?? Infinity;
      const bo = b.order ?? Infinity;
      if (ao !== bo) return ao - bo;
      return a.createdAt > b.createdAt ? 1 : -1;
    });
    this._renderParked(parked);

    this._setupDragDrop();
  },

  // 擱置側欄卡：N=0 時清空（靠 .side-card:empty 自動隱藏）
  _renderParked(parked) {
    const el = document.getElementById('panel-parked');
    if (!el) return;
    if (!parked.length) { el.innerHTML = ''; return; }

    const collapsed = localStorage.getItem('taskflow_parked_collapsed') !== 'false'; // 預設收合
    const rows = collapsed ? '' : parked.map(t => `
      <div class="parked-row urgency-${t.urgency || 'medium'}" data-id="${t.id}">
        <span class="urgency-dot"></span>
        <span class="parked-row-title">${this._esc(t.title)}</span>
        <button class="parked-row-back" data-id="${t.id}" title="移回待辦">↩</button>
      </div>`).join('');

    el.innerHTML = `
      <div class="parked-header" role="button" tabindex="0">
        <span class="parked-toggle">${collapsed ? '▸' : '▾'}</span>
        <span class="parked-title">擱置中</span>
        <span class="count">${parked.length}</span>
      </div>
      <div class="parked-list">${rows}</div>`;

    el.querySelector('.parked-header').addEventListener('click', () => {
      localStorage.setItem('taskflow_parked_collapsed', collapsed ? 'false' : 'true');
      Kanban.render(App.tasks);
    });
    el.querySelectorAll('.parked-row-back').forEach(b => {
      b.addEventListener('click', async e => {
        e.stopPropagation();
        await App.updateTask(b.dataset.id, { status: 'todo' });
      });
    });
    el.querySelectorAll('.parked-row').forEach(r => {
      r.addEventListener('click', () => {
        const t = App.tasks.find(x => x.id === r.dataset.id);
        if (t) PDCA.show(t);
      });
    });
  },

  _card(task, today) {
    const div = document.createElement('div');

    // 落後於時程：截止日是「具體日期且早於今天」、且尚未完成 → 逾期天數
    const daysOverdue = this._daysOverdue(task, today);
    const isOverdue = daysOverdue > 0;

    div.className = `task-card urgency-${task.urgency || 'medium'}${isOverdue ? ' overdue' : ''}`;
    div.dataset.id = task.id;
    div.draggable = true;

    const deadlineLabel = (() => {
      if (!task.deadline) return '';
      if (task.deadline === 'today') return '今天';
      if (task.deadline === 'tomorrow') return '明天';
      if (task.deadline === 'backlog') return '無期限';
      // Custom date YYYY-MM-DD → M/D
      const parts = task.deadline.split('-');
      if (parts.length === 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
      return task.deadline;
    })();

    const sourceIcon = this._sourceIcon(task.source?.type);
    const hasPDCA = task.pdca && Object.values(task.pdca).some(v => v?.trim());
    const planBadge = this._planBadge(task.planId);

    // 逾期卡片：截止標籤改成醒目的「落後 N 天」紅色警示
    const deadlineCls = isOverdue
      ? 'deadline deadline-overdue'
      : `deadline ${task.deadline === 'today' ? 'deadline-today' : ''}`;
    const deadlineText = isOverdue ? `⚠ 落後 ${daysOverdue} 天` : deadlineLabel;

    div.innerHTML = `
      <div class="card-header">
        <span class="urgency-dot"></span>
        <span class="card-title">${this._esc(task.title)}</span>
        ${isOverdue ? '<span class="overdue-badge">逾期</span>' : ''}
        ${hasPDCA ? '<span class="pdca-badge">PDCA</span>' : ''}
      </div>
      <div class="card-meta">
        ${sourceIcon || ''}
        ${planBadge}
        <span class="estimate">${this._esc(task.estimate || '')}</span>
        <span class="${deadlineCls}">${deadlineText}</span>
      </div>
    `;

    div.addEventListener('click', () => PDCA.show(task));

    // Swipe to change status on mobile
    this._addSwipe(div, task);

    return div;
  },

  // 計算逾期天數：只有「具體日期 YYYY-MM-DD 且早於今天」且未完成/未擱置/未規劃的任務才算落後
  _daysOverdue(task, today) {
    const dl = task.deadline || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dl)) return 0;
    if (['done', 'parked', 'planned'].includes(task.status)) return 0;
    if (dl >= today) return 0;
    const [y1, m1, d1] = dl.split('-').map(Number);
    const [y2, m2, d2] = today.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  },

  // 屬於某長期規劃的任務，卡片上顯示規劃徽章
  _planBadge(planId) {
    if (!planId || typeof App === 'undefined' || !App.plans) return '';
    const plan = App.plans.find(p => p.id === planId);
    if (!plan) return '';
    const name = (plan.title || '規劃').slice(0, 8);
    return `<span class="plan-badge" title="${this._esc(plan.title)}">◇ ${this._esc(name)}</span>`;
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
    let dropSucceeded = false;

    document.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        dropSucceeded = false;
        e.dataTransfer.setData('taskId', card.dataset.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        if (!dropSucceeded) Kanban.render(App.tasks);
      });
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
      list.addEventListener('dragleave', e => {
        if (!list.contains(e.relatedTarget)) list.classList.remove('drag-over');
      });
      list.addEventListener('drop', async e => {
        e.preventDefault();
        dropSucceeded = true;
        list.classList.remove('drag-over');
        const id = e.dataTransfer.getData('taskId');
        const newStatus = list.dataset.status;
        // Capture DOM order before updateTask triggers re-render
        const orderedIds = [...list.querySelectorAll('.task-card')].map(c => c.dataset.id);
        await App.updateTask(id, {
          status: newStatus,
          done: newStatus === 'done',
          completedAt: newStatus === 'done' ? new Date().toISOString() : null
        });
        App.applyColumnOrder(orderedIds);
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

    // 拖曳到擱置側欄卡 → 擱置（桌面）。輕量 drop handler，不走 .task-list 排序流程
    const parkedPanel = document.getElementById('panel-parked');
    if (parkedPanel) {
      parkedPanel.addEventListener('dragover', e => {
        e.preventDefault();
        parkedPanel.classList.add('drag-over');
      });
      parkedPanel.addEventListener('dragleave', e => {
        if (!parkedPanel.contains(e.relatedTarget)) parkedPanel.classList.remove('drag-over');
      });
      parkedPanel.addEventListener('drop', async e => {
        e.preventDefault();
        parkedPanel.classList.remove('drag-over');
        const id = e.dataTransfer.getData('taskId');
        if (id) await App.updateTask(id, { status: 'parked', done: false, completedAt: null });
      });
    }
  }
};
