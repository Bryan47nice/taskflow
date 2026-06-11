// === TaskFlow App — main state management ===
const APP_VERSION = 'v1.11.0';

const App = {
  tasks: [],
  tasksSha: null,
  plans: [],
  plansSha: null,
  settings: {},
  _saveTimer: null,
  _planSaveTimer: null,

  // ── Init ──────────────────────────────────────────────────────────
  async init() {
    Theme.init();
    this.settings = this._loadSettings();

    Settings.init();
    Kanban.init();
    Triage.init();
    PDCA.init();
    Review.init();
    Calendar.init();
    Timer.init();
    StatsPanel.init();
    MobileNav.init();
    if (typeof Plan !== 'undefined') Plan.init();

    if (!this.settings.pat || !this.settings.repo) {
      Settings.show(() => this.init());
      return;
    }

    this._showLoading(true);
    try {
      await this._loadTasks();
      await this._loadPlans();
    } catch (e) {
      this.showToast(`載入失敗：${e.message}`, 'error');
    } finally {
      this._showLoading(false);
    }

    Kanban.render(this.tasks);
    this._updateHeader();
    this._handleURLParams();
    // Refresh side panels now that tasks are loaded
    if (typeof Timer !== 'undefined') Timer.render();
    if (typeof StatsPanel !== 'undefined') StatsPanel.refresh();
    this._initPanelResize();
    this._initKeyboardShortcuts();
    if (typeof Reminder !== 'undefined') Reminder.init();
    if (typeof Search !== 'undefined') Search.init();
  },

  _initPanelResize() {
    const handle = document.getElementById('resize-handle');
    const panel  = document.getElementById('side-panel');
    if (!handle || !panel) return;

    // Restore saved width
    const saved = localStorage.getItem('taskflow_panel_width');
    if (saved && window.innerWidth > 1023) panel.style.width = saved + 'px';

    let startX, startW;

    handle.addEventListener('mousedown', e => {
      if (window.innerWidth <= 1023) return;
      startX = e.clientX;
      startW = panel.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = e => {
        const delta = startX - e.clientX;   // drag left → panel wider
        const w = Math.min(560, Math.max(220, startW + delta));
        panel.style.width = w + 'px';
      };
      const onUp = () => {
        handle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem('taskflow_panel_width', panel.offsetWidth);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });

    // Double-click to reset to default width
    handle.addEventListener('dblclick', () => {
      panel.style.width = '';
      localStorage.removeItem('taskflow_panel_width');
    });
  },

  _initKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      if (e.key !== '+') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const modals = ['modal-triage', 'modal-pdca', 'modal-review',
                      'modal-journal-editor', 'modal-settings', 'modal-search'];
      if (modals.some(id => !document.getElementById(id)?.classList.contains('hidden'))) return;
      e.preventDefault();
      Triage.show({}, null);
    });
  },

  _handleURLParams() {
    const params = new URLSearchParams(location.search);
    if (params.get('triage') === '1') {
      Triage.show({
        text: params.get('text') || '',
        source: params.get('source') || '',
        url: params.get('url') || ''
      });
      history.replaceState({}, '', location.pathname);
    }
  },

  // ── Settings ──────────────────────────────────────────────────────
  _loadSettings() {
    try { return JSON.parse(localStorage.getItem('taskflow_settings') || '{}'); }
    catch (_) { return {}; }
  },

  saveSettings(s) {
    this.settings = s;
    localStorage.setItem('taskflow_settings', JSON.stringify(s));
  },

  // ── Stats (stored locally, no server needed) ──────────────────────
  getStats() {
    try { return JSON.parse(localStorage.getItem('taskflow_stats') || '{"days":[],"dailyHours":8}'); }
    catch (_) { return { days: [], dailyHours: 8 }; }
  },

  _saveStats(stats) {
    localStorage.setItem('taskflow_stats', JSON.stringify(stats));
  },

  // ── Tasks (GitHub-backed) ─────────────────────────────────────────
  async _loadTasks() {
    const { content, sha } = await GitHubAPI.getJSON(
      this.settings.pat, this.settings.repo, 'taskflow/tasks.json'
    );
    this.tasks = content || [];
    this.tasksSha = sha;
  },

  async _persistTasks() {
    try {
      this.tasksSha = await GitHubAPI.putJSON(
        this.settings.pat, this.settings.repo, 'taskflow/tasks.json',
        this.tasks, this.tasksSha, `TaskFlow: update ${this.getTodayKey()}`
      );
    } catch (e) {
      if (!e.message.includes('409')) throw e;
      // SHA 過期 — 重抓後重試一次
      const { sha } = await GitHubAPI.getJSON(
        this.settings.pat, this.settings.repo, 'taskflow/tasks.json'
      );
      this.tasksSha = sha;
      this.tasksSha = await GitHubAPI.putJSON(
        this.settings.pat, this.settings.repo, 'taskflow/tasks.json',
        this.tasks, this.tasksSha, `TaskFlow: update ${this.getTodayKey()}`
      );
    }
  },

  // Debounced save — batches rapid changes into one API call
  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    document.getElementById('save-indicator').classList.remove('hidden');
    this._saveTimer = setTimeout(async () => {
      try {
        await this._persistTasks();
        document.getElementById('save-indicator').textContent = '已同步';
        setTimeout(() => document.getElementById('save-indicator').classList.add('hidden'), 1500);
      } catch (e) {
        document.getElementById('save-indicator').textContent = '同步失敗';
        document.getElementById('save-indicator').classList.add('error');
        this.showToast(`同步失敗：${e.message}`, 'error');
      }
    }, 1200);
  },

  // ── Plans (GitHub-backed, separate file) ──────────────────────────
  async _loadPlans() {
    const { content, sha } = await GitHubAPI.getJSON(
      this.settings.pat, this.settings.repo, 'taskflow/plans.json'
    );
    this.plans = content || [];
    this.plansSha = sha;
  },

  async _persistPlans() {
    try {
      this.plansSha = await GitHubAPI.putJSON(
        this.settings.pat, this.settings.repo, 'taskflow/plans.json',
        this.plans, this.plansSha, `TaskFlow: update plans ${this.getTodayKey()}`
      );
    } catch (e) {
      if (!e.message.includes('409')) throw e;
      // SHA 過期 — 重抓後重試一次
      const { sha } = await GitHubAPI.getJSON(
        this.settings.pat, this.settings.repo, 'taskflow/plans.json'
      );
      this.plansSha = sha;
      this.plansSha = await GitHubAPI.putJSON(
        this.settings.pat, this.settings.repo, 'taskflow/plans.json',
        this.plans, this.plansSha, `TaskFlow: update plans ${this.getTodayKey()}`
      );
    }
  },

  // Debounced save for plans (separate timer/file from tasks)
  _schedulePlanSave() {
    if (this._planSaveTimer) clearTimeout(this._planSaveTimer);
    const ind = document.getElementById('save-indicator');
    ind.classList.remove('hidden', 'error');
    ind.textContent = '同步中…';
    this._planSaveTimer = setTimeout(async () => {
      try {
        await this._persistPlans();
        ind.textContent = '已同步';
        setTimeout(() => ind.classList.add('hidden'), 1500);
      } catch (e) {
        ind.textContent = '同步失敗';
        ind.classList.add('error');
        this.showToast(`同步失敗：${e.message}`, 'error');
      }
    }, 1200);
  },

  generatePlanId() {
    return `pl_${Date.now()}_${Math.random().toString(16).slice(2,5)}`;
  },

  createPlan(data) {
    return {
      id: this.generatePlanId(),
      title: data.title || '',
      why: data.why || '',
      status: 'active',
      targetPeriod: data.targetPeriod || '',
      order: null,
      createdAt: new Date().toISOString(),
      completedAt: null
    };
  },

  async addPlan(plan) {
    this.plans.push(plan);
    this._schedulePlanSave();
    if (typeof Plan !== 'undefined') Plan.render();
  },

  async updatePlan(id, updates) {
    const idx = this.plans.findIndex(p => p.id === id);
    if (idx === -1) return;
    const prev = this.plans[idx];
    this.plans[idx] = { ...prev, ...updates };
    if (updates.status === 'done' && prev.status !== 'done') {
      this.plans[idx].completedAt = new Date().toISOString();
    }
    this._schedulePlanSave();
    if (typeof Plan !== 'undefined') Plan.render();
  },

  async deletePlan(id) {
    this.plans = this.plans.filter(p => p.id !== id);
    // 解除子任務歸屬，不連坐刪除；未排程(planned)者轉回一般 backlog todo，避免變孤兒
    let tasksChanged = false;
    this.tasks.forEach(t => {
      if (t.planId === id) {
        t.planId = null;
        if (t.status === 'planned') { t.status = 'todo'; t.deadline = 'backlog'; }
        tasksChanged = true;
      }
    });
    this._schedulePlanSave();
    if (tasksChanged) {
      this._scheduleSave();
      Kanban.render(this.tasks);
    }
    if (typeof Plan !== 'undefined') Plan.render();
  },

  // ── CRUD ──────────────────────────────────────────────────────────
  async addTask(task) {
    this.tasks.push(task);
    this._scheduleSave();
    Kanban.render(this.tasks);
    this._updateHeader();
  },

  async updateTask(id, updates) {
    const idx = this.tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    const prev = this.tasks[idx];
    this.tasks[idx] = { ...prev, ...updates };
    // Track daily completion log when task moves to done
    if (updates.status === 'done' && prev.status !== 'done') {
      this.tasks[idx].completedAt = new Date().toISOString();
      this._recordDailyLog('done');
    }
    this._scheduleSave();
    Kanban.render(this.tasks);
    this._updateHeader();
    if (typeof StatsPanel !== 'undefined') StatsPanel.refresh();
    if (typeof Plan !== 'undefined' && Plan.isOpen()) Plan.render();
  },

  _recordDailyLog(event) {
    const today = this.getTodayKey();
    const log = JSON.parse(localStorage.getItem('taskflow_daily_log') || '{}');
    if (!log[today]) log[today] = { done: 0, scheduled: 0 };
    if (event === 'done') log[today].done++;
    // Update scheduled count from current tasks
    log[today].scheduled = this.tasks.filter(t =>
      t.status !== 'parked' && t.status !== 'planned' &&
      (t.deadline === 'today' || t.dayKey === today || t.deadline === today)
    ).length;
    localStorage.setItem('taskflow_daily_log', JSON.stringify(log));
  },

  applyColumnOrder(orderedIds) {
    orderedIds.forEach((id, idx) => {
      const task = this.tasks.find(t => t.id === id);
      if (task) task.order = idx;
    });
    this._scheduleSave();
    Kanban.render(this.tasks);
  },

  async deleteTask(id) {
    this.tasks = this.tasks.filter(t => t.id !== id);
    this._scheduleSave();
    Kanban.render(this.tasks);
    this._updateHeader();
    if (typeof Plan !== 'undefined' && Plan.isOpen()) Plan.render();
  },

  // ── Task factory ──────────────────────────────────────────────────
  getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  generateId() {
    return `t_${Date.now()}_${Math.random().toString(16).slice(2,5)}`;
  },

  createTask(data) {
    return {
      id: this.generateId(),
      title: data.title || '',
      body: data.body || '',
      links: data.links || [],
      urgency: data.urgency || 'medium',
      estimate: data.estimate || '30m',
      deadline: data.deadline || 'today',
      status: data.status || 'todo',
      done: false,
      source: data.source || null,
      pdca: { plan: '', do: '', check: '', act: '' },
      createdAt: new Date().toISOString(),
      completedAt: null,
      dayKey: this.getTodayKey(),
      actualMinutes: 0,
      planId: data.planId || null
    };
  },

  // ── Header display ────────────────────────────────────────────────
  _updateHeader() {
    const today = this.getTodayKey();
    document.getElementById('header-date').textContent = today;

    const stats = { ...this.getStats(), dailyHours: this.settings.dailyHours || 8 };
    const todayTasks = this.tasks.filter(t => t.status !== 'planned' && (t.deadline === 'today' || t.dayKey === today || t.deadline === today));
    let available = HonestLimit.calculateAvailable(todayTasks, stats);
    const meetMin = Calendar.getMeetingMinutes();
    if (meetMin > 0) available = Math.max(0, available - meetMin);
    const completed = HonestLimit.completedMinutesToday(this.tasks, today);
    const scheduled = HonestLimit.scheduledMinutesToday(this.tasks);
    document.getElementById('work-hours').textContent = HonestLimit.getMessage(completed, available, scheduled);
  },

  // ── UI helpers ────────────────────────────────────────────────────
  showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast show ${type}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  },

  _showLoading(on) {
    document.getElementById('loading-overlay').classList.toggle('hidden', !on);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
