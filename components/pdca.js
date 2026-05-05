// === Task Detail + PDCA Modal ===
const PDCA = {
  _task: null,
  _dirty: false,
  _deadlineVal: 'today',
  _dlPicker: null,

  _setDirty(val) {
    this._dirty = val;
    const dot = document.getElementById('pdca-dirty-dot');
    if (dot) dot.classList.toggle('visible', val);
  },

  show(task) {
    this._task = task;
    this._setDirty(false);
    const m = document.getElementById('modal-pdca');

    document.getElementById('pdca-title').textContent = task.title;
    document.getElementById('pdca-urgency').value = task.urgency || 'medium';

    // Estimate (select)
    const estSel = document.getElementById('pdca-estimate');
    const estVal = task.estimate || '30m';
    const estOpts = [...estSel.options].map(o => o.value);
    estSel.value = estOpts.includes(estVal) ? estVal : '30m';

    // Deadline button group
    this._deadlineVal = task.deadline || 'today';
    this._renderDeadlineBtns();

    // Body / links
    const bodyEl = document.getElementById('pdca-body');
    if (task.body || task.links?.length) {
      let html = task.body ? `<p>${this._renderLinks(task.body)}</p>` : '';
      if (task.links?.length) {
        html += task.links.map(l => `<a href="${this._safeUrl(l)}" target="_blank" rel="noopener">${this._esc(l)}</a>`).join('<br>');
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

    // PDCA fields
    const p = task.pdca || {};
    document.getElementById('pdca-plan').value = p.plan || '';
    document.getElementById('pdca-do').value = p.do || '';
    document.getElementById('pdca-check').value = p.check || '';
    document.getElementById('pdca-act').value = p.act || '';

    // Status selector
    document.getElementById('pdca-status').value = task.status || 'todo';

    m.classList.remove('hidden');
  },

  _renderDeadlineBtns() {
    const isDate = !['today', 'tomorrow', 'backlog'].includes(this._deadlineVal);
    document.querySelectorAll('.pdca-dl-btn').forEach(btn => {
      btn.classList.toggle('selected', isDate ? btn.dataset.value === '_date' : btn.dataset.value === this._deadlineVal);
    });
    const inp = document.getElementById('pdca-deadline-input');
    inp.classList.toggle('hidden', !isDate);
    if (isDate && this._dlPicker) this._dlPicker.setDate(this._deadlineVal, false);
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
    const updates = {
      pdca,
      status: newStatus,
      urgency: document.getElementById('pdca-urgency').value,
      estimate: document.getElementById('pdca-estimate').value,
      deadline: this._deadlineVal,
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

  init() {
    document.getElementById('btn-pdca-save').addEventListener('click', () => this.save());
    document.getElementById('btn-pdca-delete').addEventListener('click', () => this.deleteTask());
    document.getElementById('btn-pdca-close').addEventListener('click', () => this.hide());
    document.getElementById('modal-pdca').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-pdca')) this.hide();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !document.getElementById('modal-pdca').classList.contains('hidden')) {
        this.hide();
      }
    });

    // Dirty tracking — PDCA text areas
    ['pdca-plan','pdca-do','pdca-check','pdca-act'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => this._setDirty(true));
    });
    // Status and urgency selects
    ['pdca-status','pdca-urgency'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => this._setDirty(true));
    });
    // Estimate select
    document.getElementById('pdca-estimate').addEventListener('change', () => this._setDirty(true));

    // Flatpickr for deadline date picker
    this._dlPicker = flatpickr('#pdca-deadline-input', {
      minDate: 'today',
      dateFormat: 'Y-m-d',
      onChange: ([date]) => {
        if (!date) return;
        this._deadlineVal = date.toISOString().slice(0, 10);
        this._setDirty(true);
        this._renderDeadlineBtns();
      }
    });

    // Deadline button clicks
    document.querySelectorAll('.pdca-dl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.value === '_date') {
          document.getElementById('pdca-deadline-input').classList.remove('hidden');
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
