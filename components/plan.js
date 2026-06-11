// === Long-term Plans (母子單 / Epic 視圖) ===
// 規劃(母單)存於 App.plans / taskflow/plans.json；子任務以 task.planId 指向母單。
// 子任務預設 status='planned'（躺在規劃裡，不進今日看板/工時），按「排入今日」才進日常流程。
const Plan = {
  _selectedId: null,   // 右欄目前展開的規劃
  _editingId: null,    // modal 正在編輯的規劃（null = 新建）
  _showArchived: false,

  // ── View toggle ───────────────────────────────────────────────────
  isOpen() {
    const v = document.getElementById('plan-view');
    return v && !v.classList.contains('hidden');
  },

  open() {
    document.getElementById('plan-view').classList.remove('hidden');
    document.querySelector('.app-layout')?.classList.add('hidden');
    document.body.classList.add('plan-open');
    // 預設選第一個 active 規劃
    if (!this._selectedId || !App.plans.find(p => p.id === this._selectedId)) {
      const first = App.plans.find(p => p.status !== 'archived');
      this._selectedId = first ? first.id : null;
    }
    this.render();
  },

  close() {
    document.getElementById('plan-view').classList.add('hidden');
    document.querySelector('.app-layout')?.classList.remove('hidden');
    document.body.classList.remove('plan-open');
  },

  toggleView() {
    this.isOpen() ? this.close() : this.open();
  },

  // ── Data helpers ──────────────────────────────────────────────────
  childrenOf(planId) {
    return App.tasks.filter(t => t.planId === planId);
  },

  progressOf(planId) {
    const kids = this.childrenOf(planId);
    const done = kids.filter(t => t.status === 'done').length;
    const total = kids.length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  },

  // ── Render ────────────────────────────────────────────────────────
  render() {
    if (!this.isOpen()) return;
    this._renderList();
    this._renderDetail();
  },

  _renderList() {
    const wrap = document.getElementById('plan-list');
    if (!wrap) return;

    const plans = App.plans
      .filter(p => this._showArchived || p.status !== 'archived')
      .sort((a, b) => {
        const rank = s => (s === 'active' ? 0 : s === 'done' ? 1 : 2);
        const r = rank(a.status) - rank(b.status);
        if (r !== 0) return r;
        return (a.createdAt || '') > (b.createdAt || '') ? -1 : 1;
      });

    if (!plans.length) {
      wrap.innerHTML = `<div class="plan-list-empty">還沒有任何長期規劃<br>點右上「＋ 新規劃」開始</div>`;
      return;
    }

    wrap.innerHTML = plans.map(p => {
      const { done, total, pct } = this.progressOf(p.id);
      const active = p.id === this._selectedId ? ' selected' : '';
      const statusBadge = p.status === 'active' ? ''
        : `<span class="plan-card-status ${p.status}">${p.status === 'done' ? '已完成' : '封存'}</span>`;
      const period = p.targetPeriod ? `<span class="plan-card-period">${this._esc(p.targetPeriod)}</span>` : '';
      return `
        <div class="plan-card${active}" data-plan-id="${p.id}">
          <div class="plan-card-top">
            <span class="plan-card-title">${this._esc(p.title) || '（未命名規劃）'}</span>
            ${statusBadge}
          </div>
          <div class="plan-card-meta">${period}<span class="plan-card-count">${total} 項子單</span></div>
          <div class="plan-progress">
            <div class="plan-progress-bar"><div class="plan-progress-fill" style="width:${pct}%"></div></div>
            <span class="plan-progress-label">${done}/${total}</span>
          </div>
        </div>`;
    }).join('');
  },

  _renderDetail() {
    const el = document.getElementById('plan-detail');
    if (!el) return;

    const plan = App.plans.find(p => p.id === this._selectedId);
    if (!plan) {
      el.innerHTML = `<div class="plan-detail-empty">← 從左側選一個規劃，或新增一個</div>`;
      return;
    }

    const kids = this.childrenOf(plan.id);
    const { done, total, pct } = this.progressOf(plan.id);

    const groups = {
      planned:  { label: '規劃中（未排程）', rows: [] },
      active:   { label: '進行中', rows: [] },
      done:     { label: '已完成', rows: [] }
    };
    const urgOrd = { high: 0, medium: 1, low: 2 };
    kids.sort((a, b) => (urgOrd[a.urgency] ?? 1) - (urgOrd[b.urgency] ?? 1));
    kids.forEach(t => {
      const g = t.status === 'done' ? 'done' : t.status === 'planned' ? 'planned' : 'active';
      groups[g].rows.push(this._childRow(t, g));
    });

    const statusLabel = { active: '進行中', done: '已完成', archived: '封存' };
    const periodChip = plan.targetPeriod
      ? `<span class="plan-detail-period">${this._esc(plan.targetPeriod)}</span>` : '';

    const groupsHtml = ['planned', 'active', 'done'].map(k => {
      const g = groups[k];
      if (!g.rows.length) return '';
      return `<div class="plan-group">
          <div class="plan-group-label">${g.label} <span class="count">${g.rows.length}</span></div>
          ${g.rows.join('')}
        </div>`;
    }).join('') || `<div class="plan-detail-empty-kids">這個規劃底下還沒有子單。<br>用下方輸入框開第一張單。</div>`;

    el.innerHTML = `
      <div class="plan-detail-head">
        <div class="plan-detail-titles">
          <h2>${this._esc(plan.title) || '（未命名規劃）'}</h2>
          <div class="plan-detail-sub">
            ${periodChip}
            <span class="plan-detail-statusbadge ${plan.status}">${statusLabel[plan.status] || ''}</span>
          </div>
        </div>
        <div class="plan-detail-actions">
          <button class="btn btn-secondary" data-action="edit-plan">編輯</button>
        </div>
      </div>
      ${plan.why ? `<div class="plan-detail-why">${this._esc(plan.why).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="plan-detail-progress">
        <div class="plan-progress-bar lg"><div class="plan-progress-fill" style="width:${pct}%"></div></div>
        <span class="plan-progress-label">${done}/${total}（${pct}%）</span>
      </div>
      <div class="plan-children">${groupsHtml}</div>
      <div class="plan-add-child">
        <input id="plan-add-child-input" type="text" placeholder="新增子任務，按 Enter 開單" maxlength="120" autocomplete="off">
        <button class="btn btn-primary" data-action="add-child">＋ 開單</button>
      </div>`;
  },

  _childRow(t, group) {
    const est = t.estimate ? `<span class="plan-child-est">${this._esc(t.estimate)}</span>` : '';
    let action = '';
    if (group === 'planned') {
      action = `<button class="plan-child-btn schedule" data-action="schedule" data-id="${t.id}" title="排入今日">排入今日</button>`;
    } else if (group === 'active') {
      action = `<button class="plan-child-btn unschedule" data-action="unschedule" data-id="${t.id}" title="移回規劃（未排程）">移回規劃</button>`;
    }
    return `
      <div class="plan-child-row urgency-${t.urgency || 'medium'}" data-action="open-task" data-id="${t.id}">
        <span class="urgency-dot"></span>
        <span class="plan-child-title">${this._esc(t.title)}</span>
        ${est}
        ${action}
      </div>`;
  },

  // ── Actions ───────────────────────────────────────────────────────
  selectPlan(id) {
    this._selectedId = id;
    this.render();
  },

  async scheduleToToday(id) {
    await App.updateTask(id, { status: 'todo', deadline: 'today', dayKey: App.getTodayKey() });
    this.render();
    App.showToast('已排入今日');
  },

  async unschedule(id) {
    await App.updateTask(id, { status: 'planned', deadline: 'backlog', done: false, completedAt: null });
    this.render();
    App.showToast('已移回規劃');
  },

  async addChild() {
    const inp = document.getElementById('plan-add-child-input');
    if (!inp || !this._selectedId) return;
    const title = inp.value.trim();
    if (!title) { inp.focus(); return; }
    const task = App.createTask({ title, planId: this._selectedId, status: 'planned', deadline: 'backlog' });
    await App.addTask(task);
    inp.value = '';
    this.render();
    setTimeout(() => document.getElementById('plan-add-child-input')?.focus(), 0);
  },

  openTask(id) {
    const t = App.tasks.find(x => x.id === id);
    if (t) PDCA.show(t);
  },

  // ── Plan modal (create / edit) ────────────────────────────────────
  openModal(id) {
    this._editingId = id || null;
    const plan = id ? App.plans.find(p => p.id === id) : null;
    document.getElementById('plan-modal-title').textContent = plan ? '編輯規劃' : '新規劃';
    document.getElementById('plan-f-title').value = plan?.title || '';
    document.getElementById('plan-f-why').value = plan?.why || '';
    document.getElementById('plan-f-period').value = plan?.targetPeriod || '';
    document.getElementById('plan-f-status').value = plan?.status || 'active';
    document.getElementById('plan-f-status-wrap').style.display = plan ? '' : 'none';
    document.getElementById('btn-plan-modal-delete').style.display = plan ? '' : 'none';
    document.getElementById('modal-plan').classList.remove('hidden');
    setTimeout(() => document.getElementById('plan-f-title').focus(), 50);
  },

  closeModal() {
    document.getElementById('modal-plan').classList.add('hidden');
    this._editingId = null;
  },

  async saveModal() {
    const title = document.getElementById('plan-f-title').value.trim();
    if (!title) { document.getElementById('plan-f-title').focus(); return; }
    const data = {
      title,
      why: document.getElementById('plan-f-why').value,
      targetPeriod: document.getElementById('plan-f-period').value.trim()
    };
    if (this._editingId) {
      await App.updatePlan(this._editingId, {
        ...data,
        status: document.getElementById('plan-f-status').value
      });
    } else {
      const plan = App.createPlan(data);
      await App.addPlan(plan);
      this._selectedId = plan.id;
    }
    this.closeModal();
    this.render();
    App.showToast('規劃已儲存');
  },

  async deleteFromModal() {
    if (!this._editingId) return;
    const plan = App.plans.find(p => p.id === this._editingId);
    const kids = this.childrenOf(this._editingId).length;
    const msg = kids
      ? `刪除規劃「${plan?.title || ''}」？\n底下 ${kids} 張子單不會被刪除，會解除歸屬（未排程的轉回無期限待辦）。`
      : `刪除規劃「${plan?.title || ''}」？`;
    if (!confirm(msg)) return;
    const delId = this._editingId;
    await App.deletePlan(delId);
    if (this._selectedId === delId) this._selectedId = null;
    this.closeModal();
    this.render();
    App.showToast('規劃已刪除');
  },

  // ── Init / event wiring ───────────────────────────────────────────
  init() {
    document.getElementById('btn-plan-view')?.addEventListener('click', () => this.toggleView());
    document.getElementById('btn-plan-back')?.addEventListener('click', () => this.close());
    document.getElementById('btn-plan-new')?.addEventListener('click', () => this.openModal(null));

    const archChk = document.getElementById('plan-show-archived');
    archChk?.addEventListener('change', () => { this._showArchived = archChk.checked; this.render(); });

    // List clicks → select plan
    document.getElementById('plan-list')?.addEventListener('click', e => {
      const card = e.target.closest('[data-plan-id]');
      if (card) this.selectPlan(card.dataset.planId);
    });

    // Detail clicks (delegation)
    document.getElementById('plan-detail')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'schedule')        { e.stopPropagation(); this.scheduleToToday(id); }
      else if (action === 'unschedule') { e.stopPropagation(); this.unschedule(id); }
      else if (action === 'open-task')  this.openTask(id);
      else if (action === 'edit-plan')  this.openModal(this._selectedId);
      else if (action === 'add-child')  this.addChild();
    });
    document.getElementById('plan-detail')?.addEventListener('keydown', e => {
      if (e.target.id === 'plan-add-child-input' && e.key === 'Enter') {
        e.preventDefault();
        this.addChild();
      }
    });

    // Plan modal
    document.getElementById('btn-plan-modal-close')?.addEventListener('click', () => this.closeModal());
    document.getElementById('btn-plan-modal-cancel')?.addEventListener('click', () => this.closeModal());
    document.getElementById('btn-plan-modal-save')?.addEventListener('click', () => this.saveModal());
    document.getElementById('btn-plan-modal-delete')?.addEventListener('click', () => this.deleteFromModal());
    document.getElementById('modal-plan')?.addEventListener('click', e => {
      if (e.target === document.getElementById('modal-plan')) this.closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !document.getElementById('modal-plan')?.classList.contains('hidden')) {
        this.closeModal();
      }
    });
  },

  _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};
