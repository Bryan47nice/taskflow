// === Task Detail + PDCA Modal ===
const PDCA = {
  _task: null,
  _dirty: false,
  _deadlineVal: 'today',
  _dlPicker: null,
  _links: [],
  _linksExpanded: false,
  _editingLinkIdx: null,

  _setDirty(val) {
    this._dirty = val;
    const dot = document.getElementById('pdca-dirty-dot');
    if (dot) dot.classList.toggle('visible', val);
  },

  show(task, highlightQ) {
    this._task = task;
    this._setDirty(false);
    this._clearMatchHighlight();
    const m = document.getElementById('modal-pdca');

    document.getElementById('pdca-title').value = task.title || '';
    document.getElementById('pdca-urgency').value = task.urgency || 'medium';

    // 擱置/移回 按鈕文案隨狀態切換
    const parkBtn = document.getElementById('btn-pdca-park');
    if (parkBtn) parkBtn.textContent = (task.status === 'parked') ? '移回待辦' : '擱置';

    // Estimate — show custom input if value not in preset list
    this._setEstimate(task.estimate || '30m');

    // Deadline button group
    this._deadlineVal = task.deadline || 'today';
    this._renderDeadlineBtns();

    // Body / links
    const bodyEl = document.getElementById('pdca-body');
    if (task.body || task.links?.length) {
      let html = task.body ? `<p>${this._renderLinks(task.body)}</p>` : '';
      if (task.links?.length) {
        html += task.links.map(l => {
          const url = typeof l === 'string' ? l : (l.url || '');
          const label = typeof l === 'string' ? l : (l.name || l.url || '');
          return `<a href="${this._safeUrl(url)}" target="_blank" rel="noopener">${this._esc(label)}</a>`;
        }).join('<br>');
      }
      bodyEl.innerHTML = html;
      bodyEl.classList.remove('hidden');
    } else {
      bodyEl.innerHTML = '';
      bodyEl.classList.add('hidden');
    }

    // Source
    const srcEl = document.getElementById('pdca-source');
    if (task.source?.url) {
      srcEl.innerHTML = `來源：<a href="${this._safeUrl(task.source.url)}" target="_blank" rel="noopener">${this._esc(task.source.type || '連結')}</a>`;
      srcEl.classList.remove('hidden');
    } else {
      srcEl.classList.add('hidden');
    }

    // Links section
    this._links = this._normalizeLinks(task.links);
    this._linksExpanded = false;
    this._editingLinkIdx = null;
    this._renderLinksSection();

    // PDCA fields
    const p = task.pdca || {};
    document.getElementById('pdca-plan').value = p.plan || '';
    document.getElementById('pdca-do').value = p.do || '';
    document.getElementById('pdca-check').value = p.check || '';
    document.getElementById('pdca-act').value = p.act || '';

    // Status selector
    document.getElementById('pdca-status').value = task.status || 'todo';

    m.classList.remove('hidden');
    if (highlightQ) this._applyMatchHighlight(highlightQ);
  },

  // ── 搜尋命中標示（從搜尋面板開啟時）──────────────────────────────
  _applyMatchHighlight(q) {
    if (!q) return;
    const ql = q.toLowerCase();

    // 內文區（HTML div）：命中字反白 <mark> + 持久光環
    const bodyEl = document.getElementById('pdca-body');
    if (bodyEl && !bodyEl.classList.contains('hidden') && bodyEl.textContent.toLowerCase().includes(ql)) {
      this._markTextNodes(bodyEl, q);
      bodyEl.classList.add('search-hit');
    }

    // 文字欄位（input / textarea）：每個命中欄位都加持久光環，並聚焦+選取第一個命中
    const fieldIds = ['pdca-title', 'pdca-plan', 'pdca-do', 'pdca-check', 'pdca-act'];
    let firstHit = null;
    for (const id of fieldIds) {
      const f = document.getElementById(id);
      if (!f) continue;
      const idx = (f.value || '').toLowerCase().indexOf(ql);
      if (idx >= 0) {
        f.classList.add('search-hit');
        if (!firstHit) firstHit = { f, idx };
      }
    }
    if (firstHit) {
      const { f, idx } = firstHit;
      f.focus();
      try { f.setSelectionRange(idx, idx + q.length); } catch (_) {}
      f.scrollIntoView({ block: 'center' });
    } else if (bodyEl && !bodyEl.classList.contains('hidden') && bodyEl.querySelector('mark')) {
      bodyEl.querySelector('mark').scrollIntoView({ block: 'center' });
    }
  },

  // 清除上一次的命中光環（每次 show 開頭呼叫，避免殘留到下一張卡）
  _clearMatchHighlight() {
    ['pdca-title', 'pdca-plan', 'pdca-do', 'pdca-check', 'pdca-act', 'pdca-body'].forEach(id => {
      const f = document.getElementById(id);
      if (f) f.classList.remove('search-hit');
    });
  },

  // 在節點內的文字節點包 <mark>（只動文字節點，安全不破壞既有標籤）
  _markTextNodes(root, q) {
    const ql = q.toLowerCase();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const targets = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue.toLowerCase().includes(ql)) targets.push(n);
    }
    for (const textNode of targets) {
      const frag = document.createDocumentFragment();
      let s = textNode.nodeValue, i;
      while ((i = s.toLowerCase().indexOf(ql)) >= 0) {
        if (i > 0) frag.appendChild(document.createTextNode(s.slice(0, i)));
        const mark = document.createElement('mark');
        mark.textContent = s.slice(i, i + q.length);
        frag.appendChild(mark);
        s = s.slice(i + q.length);
      }
      if (s) frag.appendChild(document.createTextNode(s));
      textNode.parentNode.replaceChild(frag, textNode);
    }
  },

  // ── Estimate helpers ──────────────────────────────────────────────

  _PRESET_ESTIMATES: ['15m','30m','45m','1h','1.5h','2h','3h','4h+'],

  _setEstimate(val) {
    const sel = document.getElementById('pdca-estimate');
    const customWrap = document.getElementById('pdca-estimate-custom');
    if (this._PRESET_ESTIMATES.includes(val)) {
      sel.value = val;
      customWrap.classList.add('hidden');
      document.getElementById('pdca-est-num').value = '';
    } else {
      // Custom value e.g. "45m" or "2h" not in presets
      sel.value = '_custom';
      customWrap.classList.remove('hidden');
      const num = parseInt(val, 10);
      const unit = val.endsWith('h') ? 'h' : 'm';
      document.getElementById('pdca-est-num').value = num || '';
      document.getElementById('pdca-est-unit').value = unit;
    }
  },

  _getEstimate() {
    const sel = document.getElementById('pdca-estimate');
    if (sel.value !== '_custom') return sel.value;
    const num = parseInt(document.getElementById('pdca-est-num').value, 10);
    const unit = document.getElementById('pdca-est-unit').value;
    return (num > 0) ? `${num}${unit}` : '30m';
  },

  // ── Deadline helpers ──────────────────────────────────────────────

  _renderDeadlineBtns() {
    const val = this._deadlineVal;

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const todayKey = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    const tom = new Date(now); tom.setDate(tom.getDate() + 1);
    const tomorrowKey = `${tom.getFullYear()}-${pad(tom.getMonth()+1)}-${pad(tom.getDate())}`;

    let effectiveVal = val;
    if (val === todayKey)          effectiveVal = 'today';
    else if (val === tomorrowKey)  effectiveVal = 'tomorrow';

    const isCustomDate = !['today', 'tomorrow', 'backlog', '_date'].includes(effectiveVal);
    const showInput = isCustomDate || effectiveVal === '_date';

    document.querySelectorAll('.pdca-dl-btn').forEach(btn => {
      const v = btn.dataset.value;
      if (v === '_date') {
        btn.classList.toggle('selected', showInput);
      } else {
        btn.classList.toggle('selected', v === effectiveVal);
      }
    });

    const inp = document.getElementById('pdca-deadline-input');
    inp.classList.toggle('hidden', !showInput);
    if (isCustomDate && this._dlPicker) this._dlPicker.setDate(val, false);
  },

  hide(force = false) {
    if (!force && this._dirty) {
      if (!confirm('有未儲存的變更，確定要關閉嗎？')) return;
    }
    document.getElementById('modal-pdca').classList.add('hidden');
    this._task = null;
    this._setDirty(false);
  },

  async save() {
    if (!this._task) return;
    const pdca = {
      plan: document.getElementById('pdca-plan').value,
      do: document.getElementById('pdca-do').value,
      check: document.getElementById('pdca-check').value,
      act: document.getElementById('pdca-act').value
    };
    const newStatus = document.getElementById('pdca-status').value;
    // If user clicked "指定日期" but never picked a date, fall back to 'today'
    const deadlineSave = this._deadlineVal === '_date' ? 'today' : this._deadlineVal;
    // Empty title falls back to original — avoid making a task "nameless"
    const titleRaw = document.getElementById('pdca-title').value.trim();
    const updates = {
      pdca,
      links: this._links.slice(),
      status: newStatus,
      urgency: document.getElementById('pdca-urgency').value,
      estimate: this._getEstimate(),
      deadline: deadlineSave,
      title: titleRaw || this._task.title,
      done: newStatus === 'done',
      completedAt: newStatus === 'done' && !this._task.completedAt ? new Date().toISOString() : this._task.completedAt
    };
    await App.updateTask(this._task.id, updates);
    this._setDirty(false);
    this.hide(true);
    App.showToast('已儲存');
  },

  async deleteTask() {
    if (!this._task) return;
    if (!confirm(`刪除「${this._task.title}」？`)) return;
    await App.deleteTask(this._task.id);
    this.hide(true);
    App.showToast('已刪除');
  },

  async togglePark() {
    if (!this._task) return;
    const parking = this._task.status !== 'parked';
    await App.updateTask(this._task.id, parking
      ? { status: 'parked', done: false, completedAt: null }
      : { status: 'todo' });
    this.hide(true);
    App.showToast(parking ? '已擱置' : '已移回待辦');
  },

  _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  _safeUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') return url;
    } catch (_) {}
    return '#';
  },

  _renderLinks(text) {
    return this._esc(text).replace(
      /https?:\/\/[^\s<]+/g,
      url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`
    );
  },

  _normalizeLinks(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(l => {
      if (typeof l === 'string') return { name: '', url: l };
      return { name: l.name || '', url: l.url || '' };
    });
  },

  _renderLinksSection() {
    const container = document.getElementById('pdca-links-section');
    if (!container) return;
    const VISIBLE = 3;
    const links = this._links;
    const expanded = this._linksExpanded;
    const editIdx = this._editingLinkIdx;

    const effectiveExpanded = (editIdx !== null && editIdx >= VISIBLE) ? true : expanded;
    const visibleLinks = effectiveExpanded ? links : links.slice(0, VISIBLE);
    const hiddenCount = links.length - VISIBLE;

    let html = '<div class="pdca-links-header"><label>相關連結</label></div>';

    visibleLinks.forEach((link, i) => {
      if (editIdx === i) {
        html += `<div class="pdca-link-edit-row">
          <input class="input-name" type="text" placeholder="連結名稱" value="${this._esc(link.name)}" data-field="name">
          <input class="input-url" type="text" placeholder="https://..." value="${this._esc(link.url)}" data-field="url">
          <button class="btn-link-save" data-action="save-link" data-idx="${i}">儲存</button>
          <button class="btn-link-cancel" data-action="cancel-link" data-idx="${i}">取消</button>
        </div>`;
      } else {
        const safeUrl = this._safeUrl(link.url);
        const displayName = this._esc(link.name) || `<span style="color:var(--text-muted);font-style:italic">無名稱</span>`;
        html += `<div class="pdca-link-row">
          <span class="pdca-link-name" title="${this._esc(link.name)}">${displayName}</span>
          <a class="pdca-link-url" href="${safeUrl}" target="_blank" rel="noopener" title="${this._esc(link.url)}">${this._esc(link.url)}</a>
          <div class="pdca-link-actions">
            <button class="btn-icon" style="padding:3px;font-size:13px" data-action="edit-link" data-idx="${i}" title="編輯">✎</button>
            <button class="btn-icon" style="padding:3px;font-size:13px" data-action="delete-link" data-idx="${i}" title="刪除">✕</button>
          </div>
        </div>`;
      }
    });

    if (!effectiveExpanded && hiddenCount > 0) {
      html += `<button class="pdca-links-toggle" data-action="expand-links">▼ 顯示另外 ${hiddenCount} 個連結</button>`;
    } else if (effectiveExpanded && links.length > VISIBLE) {
      html += `<button class="pdca-links-toggle" data-action="collapse-links">▲ 收合</button>`;
    }

    if (editIdx === -1) {
      html += `<div class="pdca-link-edit-row">
        <input class="input-name" type="text" placeholder="連結名稱" data-field="name">
        <input class="input-url" type="text" placeholder="https://..." data-field="url">
        <button class="btn-link-save" data-action="save-link" data-idx="-1">儲存</button>
        <button class="btn-link-cancel" data-action="cancel-link" data-idx="-1">取消</button>
      </div>`;
    } else {
      html += `<button class="pdca-links-add" data-action="add-link">＋ 新增連結</button>`;
    }

    container.innerHTML = html;

    if (editIdx !== null) {
      const editRow = container.querySelector('.pdca-link-edit-row');
      if (editRow) {
        const first = editRow.querySelector('input[data-field="name"]');
        if (first) setTimeout(() => first.focus(), 0);
      }
    }
  },

  _handleLinksClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const idx = parseInt(btn.dataset.idx, 10);

    if (action === 'edit-link') {
      this._editingLinkIdx = idx;
      this._renderLinksSection();
    } else if (action === 'delete-link') {
      this._links.splice(idx, 1);
      if (this._editingLinkIdx === idx) this._editingLinkIdx = null;
      this._setDirty(true);
      this._renderLinksSection();
    } else if (action === 'save-link') {
      const editRow = btn.closest('.pdca-link-edit-row');
      const name = editRow.querySelector('[data-field="name"]').value.trim();
      const url = editRow.querySelector('[data-field="url"]').value.trim();
      if (!url) {
        editRow.querySelector('[data-field="url"]').focus();
        return;
      }
      if (idx === -1) {
        this._links.push({ name, url });
      } else {
        this._links[idx] = { name, url };
      }
      this._editingLinkIdx = null;
      this._setDirty(true);
      this._renderLinksSection();
    } else if (action === 'cancel-link') {
      this._editingLinkIdx = null;
      this._renderLinksSection();
    } else if (action === 'add-link') {
      this._editingLinkIdx = -1;
      this._renderLinksSection();
    } else if (action === 'expand-links') {
      this._linksExpanded = true;
      this._renderLinksSection();
    } else if (action === 'collapse-links') {
      this._linksExpanded = false;
      this._renderLinksSection();
    }
  },

  init() {
    document.getElementById('pdca-links-section').addEventListener('click', e => this._handleLinksClick(e));
    document.getElementById('btn-pdca-save').addEventListener('click', () => this.save());
    document.getElementById('btn-pdca-delete').addEventListener('click', () => this.deleteTask());
    document.getElementById('btn-pdca-park').addEventListener('click', () => this.togglePark());
    document.getElementById('btn-pdca-close').addEventListener('click', () => this.hide());
    document.getElementById('modal-pdca').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-pdca')) this.hide();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !document.getElementById('modal-pdca').classList.contains('hidden')) {
        this.hide();
      }
    });

    // Dirty tracking — title + PDCA text areas
    ['pdca-title','pdca-plan','pdca-do','pdca-check','pdca-act'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => this._setDirty(true));
    });
    // Status and urgency selects
    ['pdca-status','pdca-urgency'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => this._setDirty(true));
    });
    // Estimate select — show/hide custom wrap
    document.getElementById('pdca-estimate').addEventListener('change', () => {
      const isCustom = document.getElementById('pdca-estimate').value === '_custom';
      document.getElementById('pdca-estimate-custom').classList.toggle('hidden', !isCustom);
      if (isCustom) document.getElementById('pdca-est-num').focus();
      this._setDirty(true);
    });
    // Custom estimate inputs
    document.getElementById('pdca-est-num').addEventListener('input', () => this._setDirty(true));
    document.getElementById('pdca-est-unit').addEventListener('change', () => this._setDirty(true));

    // Flatpickr for deadline date picker
    this._dlPicker = flatpickr('#pdca-deadline-input', {
      minDate: 'today',
      dateFormat: 'Y-m-d',
      onChange: ([date]) => {
        if (!date) return;
        const _pad = n => String(n).padStart(2, '0');
        this._deadlineVal = `${date.getFullYear()}-${_pad(date.getMonth()+1)}-${_pad(date.getDate())}`;
        this._setDirty(true);
        this._renderDeadlineBtns();
      }
    });

    // Deadline button clicks
    document.querySelectorAll('.pdca-dl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.value === '_date') {
          // Mark '_date' as active immediately, then open picker
          this._deadlineVal = '_date';
          this._renderDeadlineBtns();
          this._dlPicker.open();
        } else {
          this._deadlineVal = btn.dataset.value;
          document.getElementById('pdca-deadline-input').classList.add('hidden');
          this._setDirty(true);
          this._renderDeadlineBtns();
        }
      });
    });
  }
};
