// === Timer (番茄鐘) ===
const Timer = {
  POMODORO_MS: 25 * 60 * 1000,
  _interval: null,

  // ── State ─────────────────────────────────────────────────────────
  _load() {
    return JSON.parse(localStorage.getItem('taskflow_timer') || 'null') || {
      taskId: null, startedAt: null, elapsedMs: 0, running: false
    };
  },
  _save(s) { localStorage.setItem('taskflow_timer', JSON.stringify(s)); },

  _elapsed(s) {
    if (!s.running || !s.startedAt) return s.elapsedMs;
    return s.elapsedMs + (Date.now() - new Date(s.startedAt).getTime());
  },

  // ── Render ────────────────────────────────────────────────────────
  render() {
    const el = document.getElementById('panel-timer');
    if (!el) return;
    const s = this._load();
    const tasks = (typeof App !== 'undefined' ? App.tasks : [])
      .filter(t => t.status === 'in-progress');

    const elapsed = this._elapsed(s);
    const remaining = Math.max(0, this.POMODORO_MS - elapsed);
    const pct = Math.min(100, (elapsed / this.POMODORO_MS) * 100);
    const isRunning = s.running;
    const isDone = elapsed >= this.POMODORO_MS;

    const timeStr = this._fmt(isDone ? 0 : remaining);
    const activeTask = tasks.find(t => t.id === s.taskId) || tasks[0] || null;

    const taskOptions = tasks.map(t =>
      `<option value="${t.id}"${t.id === s.taskId ? ' selected' : ''}>${this._esc(t.title)}</option>`
    ).join('');

    el.innerHTML = `
      <div class="side-card-header">🍅 番茄鐘</div>
      ${tasks.length
        ? `<select class="timer-task-select" id="timer-task-sel">${taskOptions}</select>`
        : `<p class="timer-no-task">無進行中任務</p>`
      }
      <div class="timer-ring-wrap">
        <svg class="timer-ring" viewBox="0 0 80 80">
          <circle class="timer-ring-bg" cx="40" cy="40" r="34"/>
          <circle class="timer-ring-fg${isDone ? ' done' : ''}" cx="40" cy="40" r="34"
            stroke-dasharray="${2 * Math.PI * 34}"
            stroke-dashoffset="${2 * Math.PI * 34 * (1 - pct / 100)}"/>
        </svg>
        <div class="timer-ring-time${isDone ? ' done' : ''}">${timeStr}</div>
      </div>
      <div class="timer-actions">
        <button class="timer-btn timer-btn-main" id="timer-toggle">
          ${isDone ? '🔄 重置' : isRunning ? '⏸ 暫停' : '▶ 開始'}
        </button>
        ${(isRunning || elapsed > 0) && !isDone
          ? `<button class="timer-btn timer-btn-stop" id="timer-stop">■ 停止</button>` : ''}
      </div>
      <div class="timer-pomodoros">
        今日已專注 <strong id="timer-pomo-count">${this._pomodorosToday()}</strong> 顆 🍅
      </div>`;

    // bind events
    el.querySelector('#timer-task-sel')?.addEventListener('change', e => {
      const s2 = this._load(); s2.taskId = e.target.value; this._save(s2);
    });
    el.querySelector('#timer-toggle')?.addEventListener('click', () => this.toggle());
    el.querySelector('#timer-stop')?.addEventListener('click', () => this.stop());

    this._syncTimerBar(s, timeStr, activeTask);
  },

  _syncTimerBar(s, timeStr, activeTask) {
    const bar = document.getElementById('timer-bar');
    if (!bar) return;
    if (s.running) {
      bar.classList.remove('hidden');
      document.getElementById('timer-bar-time').textContent = timeStr;
      document.getElementById('timer-bar-task').textContent = activeTask?.title || '';
      document.getElementById('timer-bar-toggle').textContent = '⏸';
    } else {
      bar.classList.add('hidden');
    }
  },

  // ── Controls ──────────────────────────────────────────────────────
  toggle() {
    const s = this._load();
    if (s.running) {
      // pause
      s.elapsedMs = this._elapsed(s);
      s.startedAt = null;
      s.running = false;
    } else {
      if (this._elapsed(s) >= this.POMODORO_MS) {
        // reset
        s.elapsedMs = 0;
        s.startedAt = null;
        s.running = false;
        this._save(s);
        this.render();
        return;
      }
      s.startedAt = new Date().toISOString();
      s.running = true;
      // auto-assign first in-progress task if none selected
      if (!s.taskId && typeof App !== 'undefined') {
        const t = App.tasks.find(t => t.status === 'in-progress');
        if (t) s.taskId = t.id;
      }
    }
    this._save(s);
    this._startTick();
    this.render();
  },

  stop() {
    const s = this._load();
    const elapsed = Math.round(this._elapsed(s) / 60000);
    if (s.taskId && elapsed > 0 && typeof App !== 'undefined') {
      const task = App.tasks.find(t => t.id === s.taskId);
      if (task) App.updateTask(s.taskId, { actualMinutes: (task.actualMinutes || 0) + elapsed });
    }
    s.elapsedMs = 0; s.startedAt = null; s.running = false; s.taskId = null;
    this._save(s);
    clearInterval(this._interval);
    this._interval = null;
    this.render();
  },

  _startTick() {
    if (this._interval) return;
    this._interval = setInterval(() => {
      const s = this._load();
      if (!s.running) { clearInterval(this._interval); this._interval = null; return; }
      const elapsed = this._elapsed(s);
      if (elapsed >= this.POMODORO_MS) {
        // pomodoro complete
        s.running = false; s.elapsedMs = this.POMODORO_MS; s.startedAt = null;
        this._save(s);
        this._recordPomodoro();
        clearInterval(this._interval); this._interval = null;
      }
      this.render();
    }, 1000);
  },

  _recordPomodoro() {
    const today = (typeof App !== 'undefined') ? App.getTodayKey() : new Date().toISOString().slice(0,10);
    const key = 'taskflow_pomodoros';
    const p = JSON.parse(localStorage.getItem(key) || '{}');
    p[today] = (p[today] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(p));
  },

  _pomodorosToday() {
    const today = (typeof App !== 'undefined') ? App.getTodayKey() : new Date().toISOString().slice(0,10);
    const p = JSON.parse(localStorage.getItem('taskflow_pomodoros') || '{}');
    return p[today] || 0;
  },

  _fmt(ms) {
    const s = Math.ceil(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  },

  _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },

  // ── Init ──────────────────────────────────────────────────────────
  init() {
    this.render();
    // resume tick if timer was running on page reload
    const s = this._load();
    if (s.running) this._startTick();
    // mobile timer-bar toggle
    document.getElementById('timer-bar')?.addEventListener('click', () => {
      if (typeof MobileNav !== 'undefined') MobileNav.switchTab('focus');
    });
    document.getElementById('timer-bar-toggle')?.addEventListener('click', e => {
      e.stopPropagation(); this.toggle();
    });
  }
};
