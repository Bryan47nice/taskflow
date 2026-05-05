// === Triage Modal — 4-step task classification ===
const Triage = {
  _step: 1,
  _data: {},
  _onSave: null,
  _dlPicker: null,

  show(prefill = {}, onSave) {
    this._onSave = onSave;
    this._data = {
      title: prefill.text || '',
      urgency: 'medium',
      estimate: '30m',
      deadline: 'today',
      source: prefill.source ? {
        type: prefill.source,
        url: prefill.url || '',
        snippet: (prefill.text || '').slice(0, 120)
      } : null,
      body: prefill.text || ''
    };

    // Init deadline flatpickr once
    if (!this._dlPicker) {
      this._dlPicker = flatpickr('#t-dl-date', {
        minDate: 'today',
        dateFormat: 'Y-m-d',
        onChange: ([date]) => {
          if (!date) return;
          this._data.deadline = date.toISOString().slice(0, 10);
          document.querySelectorAll('.dl-btn').forEach(b => b.classList.remove('selected'));
          document.querySelector('.dl-btn[data-value="_date"]').classList.add('selected');
        }
      });
    }

    this._goStep(1);
    document.getElementById('modal-triage').classList.remove('hidden');
    setTimeout(() => document.getElementById('t-title')?.focus(), 50);
  },

  hide() {
    document.getElementById('modal-triage').classList.add('hidden');
  },

  _goStep(n) {
    this._step = n;
    document.querySelectorAll('.triage-step').forEach(el => {
      el.classList.toggle('hidden', parseInt(el.dataset.step) !== n);
    });
    document.getElementById('t-step-indicator').textContent = `${n} / 4`;

    if (n === 1) {
      const inp = document.getElementById('t-title');
      inp.value = this._data.title;
    }
    if (n === 2) this._renderUrgency();
    if (n === 3) this._renderEstimate();
    if (n === 4) this._renderDeadline();
  },

  _renderUrgency() {
    document.querySelectorAll('.urg-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.value === this._data.urgency);
    });
  },

  _renderEstimate() {
    document.querySelectorAll('.est-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.value === this._data.estimate);
    });
    // Reset custom wrap when rendering
    const isStandard = ['15m','30m','1h','2h','3h','4h+'].includes(this._data.estimate);
    const wrap = document.getElementById('t-custom-est-wrap');
    if (isStandard) {
      wrap.classList.add('hidden');
      document.getElementById('t-custom-est-num').value = '';
    } else {
      wrap.classList.remove('hidden');
    }
  },

  _renderDeadline() {
    const isDate = !['today','tomorrow','backlog'].includes(this._data.deadline);
    document.querySelectorAll('.dl-btn').forEach(btn => {
      btn.classList.toggle('selected', isDate ? btn.dataset.value === '_date' : btn.dataset.value === this._data.deadline);
    });
    if (isDate && this._dlPicker) this._dlPicker.setDate(this._data.deadline, false);
  },

  _next() {
    if (this._step === 1) {
      const title = document.getElementById('t-title').value.trim();
      if (!title) {
        this._shake('t-title');
        const errEl = document.getElementById('t-title-error');
        if (errEl) errEl.textContent = '請輸入任務名稱';
        document.getElementById('t-title').classList.add('input-error');
        document.getElementById('t-title').focus();
        return;
      }
      const errEl = document.getElementById('t-title-error');
      if (errEl) errEl.textContent = '';
      document.getElementById('t-title').classList.remove('input-error');
      this._data.title = title;
    }
    if (this._step < 4) this._goStep(this._step + 1);
    else this._save();
  },

  _back() {
    if (this._step > 1) this._goStep(this._step - 1);
    else this.hide();
  },

  async _save() {
    const task = App.createTask(this._data);
    await App.addTask(task);
    this.hide();
    App.showToast('任務已新增');
  },

  _shake(id) {
    const el = document.getElementById(id);
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
  },

  async _aiSuggest() {
    const key = App.settings.claudeKey;
    if (!key) { App.showToast('請先在設定中填入 Claude API key', 'error'); return; }
    const text = this._data.body || document.getElementById('t-title').value;
    if (!text) { App.showToast('沒有內容可分析', 'error'); return; }

    const btn = document.getElementById('btn-ai-suggest');
    btn.textContent = '✨ 分析中…';
    btn.disabled = true;
    try {
      const title = await ClaudeAPI.suggestTitle(key, text, this._data.source?.type);
      document.getElementById('t-title').value = title;
      this._data.title = title;
    } catch (e) {
      App.showToast(`AI 建議失敗：${e.message}`, 'error');
    } finally {
      btn.textContent = '✨ AI 建議';
      btn.disabled = false;
    }
  },

  init() {
    // Step navigation
    document.getElementById('btn-triage-next').addEventListener('click', () => this._next());
    document.getElementById('btn-triage-back').addEventListener('click', () => this._back());
    document.getElementById('btn-triage-cancel').addEventListener('click', () => this.hide());
    document.getElementById('btn-ai-suggest').addEventListener('click', () => this._aiSuggest());

    // Enter in title field = next
    document.getElementById('t-title').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._next();
    });

    // Urgency buttons
    document.querySelectorAll('.urg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._data.urgency = btn.dataset.value;
        this._renderUrgency();
      });
    });

    // Global keyboard shortcuts for triage modal
    document.addEventListener('keydown', e => {
      if (document.getElementById('modal-triage').classList.contains('hidden')) return;
      if (e.key === 'Escape') { this.hide(); return; }
      // Step 2: 1/2/3 for urgency (auto-advance)
      if (this._step === 2 && ['1','2','3'].includes(e.key)) {
        const map = { '1': 'high', '2': 'medium', '3': 'low' };  // 1=P0, 2=P1, 3=P2
        this._data.urgency = map[e.key];
        this._renderUrgency();
        setTimeout(() => this._next(), 200);
        return;
      }
      // Steps 3 & 4: Enter advances (skip if custom estimate num field focused)
      if (e.key === 'Enter' && (this._step === 3 || this._step === 4)) {
        const active = document.activeElement;
        if (active && active.id === 't-custom-est-num') return; // let user type
        e.preventDefault();
        this._next();
      }
    });

    // Estimate buttons
    document.querySelectorAll('.est-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._data.estimate = btn.dataset.value;
        this._renderEstimate();
      });
    });

    // Custom estimate — number + unit
    document.getElementById('btn-custom-est').addEventListener('click', () => {
      document.getElementById('t-custom-est-wrap').classList.remove('hidden');
      document.getElementById('t-custom-est-num').focus();
    });
    ['t-custom-est-num', 't-custom-est-unit'].forEach(id => {
      const evtType = id === 't-custom-est-num' ? 'input' : 'change';
      document.getElementById(id).addEventListener(evtType, () => {
        const num = parseInt(document.getElementById('t-custom-est-num').value, 10);
        const unit = document.getElementById('t-custom-est-unit').value;
        if (num > 0) {
          this._data.estimate = `${num}${unit}`;
          // Deselect preset buttons
          document.querySelectorAll('.est-btn').forEach(b => b.classList.remove('selected'));
        }
      });
    });

    // Deadline buttons
    document.querySelectorAll('.dl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.value === '_date') {
          document.getElementById('t-dl-date').classList.remove('hidden');
          if (this._dlPicker) this._dlPicker.open();
        } else {
          this._data.deadline = btn.dataset.value;
          this._renderDeadline();
        }
      });
    });

    // FAB button opens triage
    document.getElementById('btn-fab').addEventListener('click', () => this.show({}, null));

    // Close on overlay click
    document.getElementById('modal-triage').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-triage')) this.hide();
    });
  }
};
