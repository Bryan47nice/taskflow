// === Plan Picking — 看板 ↔ 長期規劃 的歸屬入口 ===
// 兩個 UI 共用「列規劃 / 寫歸屬」邏輯，所以放同一支：
//   A. openQuick(taskId, anchorEl) — 看板卡片點 ◇ 徽章彈出的快選 popover
//   B. openPicker(planId)          — 規劃詳情「＋ 加入既有單」的多選挑單器
const PlanPick = {
  _pendingTaskId: null,   // 「＋ 新規劃…」流程中暫存待歸屬的任務 id
  _quickTaskId: null,
  _pickPlanId: null,
  _query: '',
  _checked: new Set(),    // 'task:<id>' / 'arch:<id>'
  _historyDays: 90,

  // ── A. 快選 popover ────────────────────────────────────────────────
  openQuick(taskId, anchorEl) {
    const task = App.tasks.find(t => t.id === taskId);
    if (!task) return;
    this._quickTaskId = taskId;

    const pop = document.getElementById('plan-quick-pick');
    const plans = App.plans.filter(p => p.status !== 'archived');

    // 目前歸屬的規劃若已 done/封存也要列出來，否則看不到自己歸在哪
    if (task.planId && !plans.some(p => p.id === task.planId)) {
      const cur = App.plans.find(p => p.id === task.planId);
      if (cur) plans.unshift(cur);
    }

    const rows = plans.length
      ? plans.map(p => `
          <button class="pqp-row${p.id === task.planId ? ' current' : ''}" data-plan="${p.id}">
            <span class="pqp-check">${p.id === task.planId ? '✓' : ''}</span>
            <span class="pqp-title">${this._esc(p.title) || '（未命名規劃）'}</span>
          </button>`).join('')
      : `<div class="pqp-empty">還沒有任何長期規劃</div>`;

    pop.innerHTML = `
      <div class="pqp-head">歸到長期規劃</div>
      <div class="pqp-rows">${rows}</div>
      <div class="pqp-foot">
        ${task.planId ? `<button class="pqp-action" data-plan="">✕ 移除歸屬</button>` : ''}
        <button class="pqp-action" data-action="new-plan">＋ 新規劃…</button>
      </div>`;

    pop.classList.remove('hidden');
    this._positionQuick(pop, anchorEl);
  },

  _positionQuick(pop, anchorEl) {
    // 先顯示才量得到尺寸；超出視窗下緣就翻到徽章上方
    const r = anchorEl.getBoundingClientRect();
    const h = pop.offsetHeight, w = pop.offsetWidth;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
  },

  closeQuick() {
    document.getElementById('plan-quick-pick')?.classList.add('hidden');
    this._quickTaskId = null;
  },

  async _assignQuick(planId) {
    const id = this._quickTaskId;
    if (!id) return;
    this.closeQuick();
    await App.updateTask(id, { planId: planId || null });
    if (planId) {
      const plan = App.plans.find(p => p.id === planId);
      App.showToast(`已歸到《${plan?.title || '規劃'}》`);
    } else {
      App.showToast('已移除規劃歸屬');
    }
  },

  // 「＋ 新規劃…」：記下待歸屬的單，交給 Plan modal，存檔後由它回頭綁定
  _newPlanForQuick() {
    this._pendingTaskId = this._quickTaskId;
    this.closeQuick();
    Plan.openModal(null);
  },

  // ── B. 加入既有單 modal ────────────────────────────────────────────
  async openPicker(planId) {
    if (!planId) return;
    this._pickPlanId = planId;
    this._query = '';
    this._checked.clear();
    document.getElementById('modal-plan-pick').classList.remove('hidden');
    document.getElementById('plan-pick-search').value = '';
    this._renderPicker();
    setTimeout(() => document.getElementById('plan-pick-search')?.focus(), 50);

    // 封存資料可能還沒載入（例如規劃頁載入失敗過）——補抓一次再重繪
    if (!App._archivesLoaded) {
      try { await App.ensureArchivesLoaded(); this._renderPicker(); } catch (_) { this._renderPicker(); }
    }
  },

  closePicker() {
    document.getElementById('modal-plan-pick').classList.add('hidden');
    this._pickPlanId = null;
    this._checked.clear();
  },

  // 候選：不屬於本規劃的看板單 + 封存記錄
  _candidates() {
    const q = this._query.trim().toLowerCase();
    const match = title => !q || String(title || '').toLowerCase().includes(q);

    const tasks = App.tasks
      .filter(t => t.planId !== this._pickPlanId && match(t.title))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    let archived = App.archiveList()
      .filter(r => r.planId !== this._pickPlanId && match(r.title))
      .sort((a, b) => String(b.journalDate || '').localeCompare(String(a.journalDate || '')));

    // 歷史單量大，沒搜尋時只列近 N 天，避免一開就幾百列
    const totalArchived = archived.length;
    let truncated = 0;
    if (!q) {
      const cutoff = this._cutoffDate(this._historyDays);
      const recent = archived.filter(r => String(r.journalDate || '') >= cutoff);
      truncated = totalArchived - recent.length;
      archived = recent;
    }
    return { tasks, archived, truncated, totalArchived };
  },

  _cutoffDate(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  _renderPicker() {
    const body = document.getElementById('plan-pick-body');
    if (!body || !this._pickPlanId) return;
    const { tasks, archived, truncated, totalArchived } = this._candidates();

    const taskRows = tasks.map(t => {
      const otherPlan = t.planId ? App.plans.find(p => p.id === t.planId) : null;
      const note = otherPlan
        ? `<span class="pp-note moving">現屬：${this._esc(otherPlan.title)}</span>` : '';
      const statusLabel = { planned: '規劃中', 'in-progress': '進行中', done: '已完成', parked: '擱置' }[t.status] || '待辦';
      return this._row(`task:${t.id}`, t.title, t.urgency, `<span class="pp-note">${statusLabel}</span>${note}`);
    }).join('');

    const archRows = archived.map(r =>
      this._row(`arch:${r.id}`, r.title, r.urgency, `<span class="pp-note">${this._fmtDate(r.journalDate)}</span>`)
    ).join('');

    const archHint = this._query.trim()
      ? ''
      : (truncated > 0
          ? `<div class="pp-hint">近 ${this._historyDays} 天，另有 ${truncated} 筆更早的（搜尋可找全部）</div>`
          : '');

    const archLoadFail = !App._archivesLoaded
      ? `<div class="pp-hint warn">⚠ 封存資料未載入，歷史單可能不完整</div>` : '';

    body.innerHTML = `
      <div class="pp-group">
        <div class="pp-group-label">看板中 <span class="count">${tasks.length}</span></div>
        ${taskRows || '<div class="pp-empty">沒有符合的看板單</div>'}
      </div>
      <div class="pp-group">
        <div class="pp-group-label">已完成（歷史）<span class="count">${archived.length}</span></div>
        ${archLoadFail}
        ${archHint}
        ${archRows || `<div class="pp-empty">${totalArchived ? '沒有符合的歷史單' : '還沒有封存的歷史單（可在設定頁從舊日誌匯入）'}</div>`}
      </div>`;

    this._updatePickCount();
  },

  // 刻意用 div 而非 label 包 checkbox：label 會把 click 轉發給內層 checkbox，
  // 導致委派 handler 觸發兩次（開→關），勾不起來。checkbox 純顯示、不吃事件。
  _row(key, title, urgency, meta) {
    const on = this._checked.has(key);
    return `
      <div class="pp-row urgency-${urgency || 'medium'}${on ? ' checked' : ''}" data-key="${key}"
           role="checkbox" aria-checked="${on}" tabindex="0">
        <input type="checkbox" tabindex="-1" ${on ? 'checked' : ''}>
        <span class="urgency-dot"></span>
        <span class="pp-title">${this._esc(title)}</span>
        ${meta}
      </div>`;
  },

  _updatePickCount() {
    const btn = document.getElementById('btn-plan-pick-confirm');
    if (!btn) return;
    const n = this._checked.size;
    btn.textContent = n ? `加入 ${n} 張` : '加入';
    btn.disabled = n === 0;
  },

  _toggle(key) {
    if (this._checked.has(key)) this._checked.delete(key);
    else this._checked.add(key);
    const on = this._checked.has(key);
    const row = document.querySelector(`.pp-row[data-key="${key}"]`);
    if (row) {
      row.classList.toggle('checked', on);
      row.setAttribute('aria-checked', String(on));
      const box = row.querySelector('input[type="checkbox"]');
      if (box) box.checked = on;
    }
    this._updatePickCount();
  },

  async confirmPicker() {
    const planId = this._pickPlanId;
    if (!planId || !this._checked.size) return;
    const keys = [...this._checked];
    const n = keys.length;
    this.closePicker();

    for (const key of keys) {
      const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      if (kind === 'task') await App.updateTask(id, { planId });
      else App.updateArchive(id, { planId });
    }
    Plan.render();
    App.showToast(`已加入 ${n} 張`);
  },

  _fmtDate(d) {
    const parts = String(d || '').split('-');
    return parts.length === 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : (d || '');
  },

  // ── Init ──────────────────────────────────────────────────────────
  init() {
    // 快選 popover
    const pop = document.getElementById('plan-quick-pick');
    pop?.addEventListener('click', e => {
      const row = e.target.closest('[data-plan], [data-action]');
      if (!row) return;
      if (row.dataset.action === 'new-plan') this._newPlanForQuick();
      else this._assignQuick(row.dataset.plan);
    });
    // 點外面 / Esc / 捲動看板 → 關閉
    document.addEventListener('mousedown', e => {
      if (pop?.classList.contains('hidden')) return;
      if (!e.target.closest('#plan-quick-pick') && !e.target.closest('.plan-badge')) this.closeQuick();
    });
    document.addEventListener('scroll', () => this.closeQuick(), true);

    // 挑單器
    document.getElementById('btn-plan-pick-close')?.addEventListener('click', () => this.closePicker());
    document.getElementById('btn-plan-pick-cancel')?.addEventListener('click', () => this.closePicker());
    document.getElementById('btn-plan-pick-confirm')?.addEventListener('click', () => this.confirmPicker());
    document.getElementById('modal-plan-pick')?.addEventListener('click', e => {
      if (e.target === document.getElementById('modal-plan-pick')) this.closePicker();
    });
    document.getElementById('plan-pick-search')?.addEventListener('input', e => {
      this._query = e.target.value;
      this._renderPicker();
    });
    document.getElementById('plan-pick-body')?.addEventListener('click', e => {
      const row = e.target.closest('.pp-row');
      if (row) this._toggle(row.dataset.key);
    });
    // 鍵盤可操作（row 是 role=checkbox）
    document.getElementById('plan-pick-body')?.addEventListener('keydown', e => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const row = e.target.closest('.pp-row');
      if (!row) return;
      e.preventDefault();
      this._toggle(row.dataset.key);
    });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!document.getElementById('plan-quick-pick')?.classList.contains('hidden')) { this.closeQuick(); return; }
      if (!document.getElementById('modal-plan-pick')?.classList.contains('hidden')) this.closePicker();
    });
  },

  _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};
