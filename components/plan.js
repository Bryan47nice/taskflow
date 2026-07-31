// === Long-term Plans (母子單 / Epic 視圖) ===
// 規劃(母單)存於 App.plans / taskflow/plans.json；子任務以 task.planId 指向母單。
// 子任務預設 status='planned'（躺在規劃裡，不進今日看板/工時），按「排入今日」才進日常流程。
const Plan = {
  _selectedId: null,   // 右欄目前展開的規劃
  _editingId: null,    // modal 正在編輯的規劃（null = 新建）
  _showArchived: false,
  _archiveState: 'idle',   // idle | loading | loaded | error — 封存資料載入狀態
  _archiveError: '',
  _journalCache: {},       // { '2026-07-23': md 全文 | null(失敗) }
  _journalLoading: new Set(),
  _expanded: new Set(),    // 展開日誌的封存記錄 id

  // ── View toggle ───────────────────────────────────────────────────
  isOpen() {
    const v = document.getElementById('plan-view');
    return v && !v.classList.contains('hidden');
  },

  // 先把視圖與看板子單畫出來（不等網路），再補上懶載入的封存歷史單
  async open() {
    document.getElementById('plan-view').classList.remove('hidden');
    document.querySelector('.app-layout')?.classList.add('hidden');
    document.body.classList.add('plan-open');
    // 預設選第一個 active 規劃
    if (!this._selectedId || !App.plans.find(p => p.id === this._selectedId)) {
      const first = App.plans.find(p => p.status !== 'archived');
      this._selectedId = first ? first.id : null;
    }

    if (App._archivesLoaded) this._archiveState = 'loaded';
    else if (this._archiveState !== 'loading') this._archiveState = 'loading';
    this.render();

    if (!App._archivesLoaded) {
      try {
        await App.ensureArchivesLoaded();
        this._archiveState = 'loaded';
      } catch (e) {
        this._archiveState = 'error';
        this._archiveError = e.message || '未知錯誤';
      }
      this.render();
    }
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

  // 已入日誌的歷史完成單（存於 taskflow/archive/YYYY.json）
  archivedOf(planId) {
    return App.archiveOf ? App.archiveOf(planId) : [];
  },

  // 歷史單一律視為已完成，分子分母都計入，讓進度條反映真實累積
  progressOf(planId) {
    const kids = this.childrenOf(planId);
    const arch = this.archivedOf(planId).length;
    const done = kids.filter(t => t.status === 'done').length + arch;
    const total = kids.length + arch;
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
    const archived = this.archivedOf(plan.id);
    const { done, total, pct } = this.progressOf(plan.id);

    const groups = {
      planned:  { label: '規劃中（未排程）', rows: [] },
      active:   { label: '進行中', rows: [] },
      done:     { label: '已完成', rows: [] },
      archived: { label: '已存檔（歷史）', rows: [] }
    };
    const urgOrd = { high: 0, medium: 1, low: 2 };
    kids.sort((a, b) => (urgOrd[a.urgency] ?? 1) - (urgOrd[b.urgency] ?? 1));
    kids.forEach(t => {
      const g = t.status === 'done' ? 'done' : t.status === 'planned' ? 'planned' : 'active';
      groups[g].rows.push(this._childRow(t, g));
    });
    archived.forEach(r => groups.archived.rows.push(this._archivedRow(r)));

    const statusLabel = { active: '進行中', done: '已完成', archived: '封存' };
    const periodChip = plan.targetPeriod
      ? `<span class="plan-detail-period">${this._esc(plan.targetPeriod)}</span>` : '';

    // 封存資料的載入狀態提示（只在歷史區相關時顯示）
    const archNotice =
      this._archiveState === 'loading' ? `<div class="plan-arch-notice">⏳ 載入封存資料…</div>` :
      this._archiveState === 'error'   ? `<div class="plan-arch-notice warn">⚠ 封存資料載入失敗（${this._esc(this._archiveError)}），僅顯示看板上的子單</div>` : '';

    const groupsHtml = ['planned', 'active', 'done', 'archived'].map(k => {
      const g = groups[k];
      if (!g.rows.length) return '';
      return `<div class="plan-group${k === 'archived' ? ' plan-group-archived' : ''}">
          <div class="plan-group-label">${g.label} <span class="count">${g.rows.length}</span></div>
          ${g.rows.join('')}
        </div>`;
    }).join('') || `<div class="plan-detail-empty-kids">這個規劃底下還沒有子單。<br>用下方輸入框開第一張單，或按上方「＋ 加入既有單」把看板上／已完成的單勾進來。</div>`;

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
          <button class="btn btn-secondary" data-action="pick-existing">＋ 加入既有單</button>
          <button class="btn btn-secondary" data-action="edit-plan">編輯</button>
        </div>
      </div>
      ${plan.why ? `<div class="plan-detail-why">${this._esc(plan.why).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="plan-detail-progress">
        <div class="plan-progress-bar lg"><div class="plan-progress-fill" style="width:${pct}%"></div></div>
        <span class="plan-progress-label">${done}/${total}（${pct}%）</span>
      </div>
      ${archNotice}
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

  // 歷史（已入日誌）子單。封存記錄本身是唯讀的，只能改歸屬；
  // 點列展開當天日誌全文，讓歷史單不只是一行死字串。
  _archivedRow(r) {
    const open = this._expanded.has(r.id);
    const date = r.journalDate || '';
    const est = r.estimate ? `<span class="plan-child-est">${this._esc(r.estimate)}</span>` : '';

    let panel = '';
    if (open) {
      if (this._journalLoading.has(date)) {
        panel = `<div class="plan-journal-dump loading">⏳ 載入日誌中…</div>`;
      } else if (this._journalCache[date]) {
        panel = `<pre class="plan-journal-dump">${this._esc(this._journalCache[date])}</pre>`;
      } else {
        panel = `<div class="plan-journal-dump warn">日誌載入失敗（${this._esc(date)}.md）</div>`;
      }
    }

    return `
      <div class="plan-child-row archived urgency-${r.urgency || 'medium'}"
           data-action="toggle-journal" data-id="${r.id}" data-date="${this._esc(date)}">
        <span class="plan-arch-caret${open ? ' open' : ''}">▸</span>
        <span class="plan-child-title">${this._esc(r.title)}</span>
        ${est}
        <span class="plan-arch-date">${this._fmtDate(date)}</span>
        <button class="plan-child-btn unschedule" data-action="remove-archived" data-id="${r.id}"
                title="從這個規劃移除（不會刪掉日誌記錄）">移除歸屬</button>
      </div>
      ${panel}`;
  },

  _fmtDate(d) {
    const parts = String(d || '').split('-');
    return parts.length === 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : (d || '');
  },

  async toggleJournal(recId, date) {
    if (this._expanded.has(recId)) {
      this._expanded.delete(recId);
      this.render();
      return;
    }
    this._expanded.add(recId);

    // 已快取（含快取過的失敗）就直接畫，不重打 API
    if (this._journalCache[date] !== undefined) { this.render(); return; }

    this._journalLoading.add(date);
    this.render();
    try {
      const { pat, repo } = App.settings;
      const { content } = await GitHubAPI.getRaw(pat, repo, `taskflow/journal/${date}.md`);
      this._journalCache[date] = content || null;
    } catch (_) {
      this._journalCache[date] = null;
    } finally {
      this._journalLoading.delete(date);
      this.render();
    }
  },

  removeArchived(id) {
    App.updateArchive(id, { planId: null });
    this._expanded.delete(id);
    this.render();
    App.showToast('已從規劃移除');
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
    // 取消 / Esc 關窗時清掉待歸屬的單，避免殘留到下次開窗誤綁
    if (typeof PlanPick !== 'undefined') PlanPick._pendingTaskId = null;
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
      // 從看板「＋ 新規劃…」進來的：新規劃建好後把那張單歸進去
      const pending = typeof PlanPick !== 'undefined' ? PlanPick._pendingTaskId : null;
      if (pending) {
        await App.updateTask(pending, { planId: plan.id });
        App.showToast(`已建立《${plan.title}》並歸入該單`);
        PlanPick._pendingTaskId = null;
        this.closeModal();
        this.render();
        return;
      }
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
      if (action === 'schedule')             { e.stopPropagation(); this.scheduleToToday(id); }
      else if (action === 'unschedule')      { e.stopPropagation(); this.unschedule(id); }
      else if (action === 'remove-archived') { e.stopPropagation(); this.removeArchived(id); }
      else if (action === 'toggle-journal')  this.toggleJournal(id, btn.dataset.date);
      else if (action === 'open-task')       this.openTask(id);
      else if (action === 'edit-plan')       this.openModal(this._selectedId);
      else if (action === 'pick-existing')   PlanPick.openPicker(this._selectedId);
      else if (action === 'add-child')       this.addChild();
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
