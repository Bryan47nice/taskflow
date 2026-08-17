// === TaskFlow App — main state management ===
const APP_VERSION = 'v1.15.0';

// Obsidian 日誌資料夾。設定頁留空時的內建預設；要放在別的路徑就到設定頁填。
const DEFAULT_OBSIDIAN_FOLDER = '工作日誌';

const App = {
  tasks: [],
  tasksSha: null,
  plans: [],
  plansSha: null,
  archives: {},          // { '2026': [archiveRecord, ...] } — 按年分片，懶載入
  archiveShas: {},       // { '2026': 'sha...' }
  _archivesLoaded: false,
  _archiveLoadPromise: null,
  _archiveDirty: new Set(),
  _archiveSaveTimer: null,
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
    if (typeof PlanPick !== 'undefined') PlanPick.init();

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
    // 封存記錄同樣解除歸屬（沒有 status，不需要像 planned task 那樣轉回 backlog）
    Object.entries(this.archives).forEach(([year, list]) => {
      let changed = false;
      list.forEach(r => { if (r.planId === id) { r.planId = null; changed = true; } });
      if (changed) this._scheduleArchiveSave(year);
    });
    this._schedulePlanSave();
    if (tasksChanged) {
      this._scheduleSave();
      Kanban.render(this.tasks);
    }
    if (typeof Plan !== 'undefined') Plan.render();
  },

  // ── Archive (已入日誌的歷史完成單) ─────────────────────────────────
  // 日誌上傳後任務會離開 tasks.json，但長期規劃需要看得到歷史貢獻，
  // 所以改成先封存到 taskflow/archive/YYYY.json 再刪。記錄刻意精簡
  // （全文留在 journal md，靠 journalDate 指回去），按年分片避免單檔
  // 撞 Contents API 的 1MB 上限。只有進規劃視圖 / 跑匯入才載入。
  ARCHIVE_DIR: 'taskflow/archive',

  _archivePath(year) {
    return `${this.ARCHIVE_DIR}/${year}.json`;
  },

  // 年份取自 journalDate（而非 completedAt），避免補產跨年日誌時寫錯年檔
  _yearOf(journalDate) {
    return String(journalDate || this.getTodayKey()).slice(0, 4);
  },

  // 懶載入入口。已載入直接回；同時多處呼叫共用同一個 in-flight promise。
  ensureArchivesLoaded() {
    if (this._archivesLoaded) return Promise.resolve();
    if (this._archiveLoadPromise) return this._archiveLoadPromise;
    this._archiveLoadPromise = this._loadArchives()
      .then(() => { this._archivesLoaded = true; })
      .finally(() => { this._archiveLoadPromise = null; });
    return this._archiveLoadPromise;
  },

  async _loadArchives() {
    const { pat, repo } = this.settings;
    if (!pat || !repo) throw new Error('未連線 GitHub');
    // 目錄不存在時 listDir 已回 []，視為還沒有任何封存
    const files = await GitHubAPI.listDir(pat, repo, this.ARCHIVE_DIR);
    const years = files
      .filter(f => /^\d{4}\.json$/.test(f.name || ''))
      .map(f => f.name.slice(0, 4));
    for (const year of years) {
      const { content, sha } = await GitHubAPI.getJSON(pat, repo, this._archivePath(year));
      this.archives[year] = Array.isArray(content) ? content : [];
      this.archiveShas[year] = sha;
    }
  },

  async _persistArchiveYear(year) {
    const { pat, repo } = this.settings;
    const path = this._archivePath(year);
    const list = this.archives[year] || [];
    try {
      this.archiveShas[year] = await GitHubAPI.putJSON(
        pat, repo, path, list, this.archiveShas[year] || null,
        `TaskFlow: archive ${year}`
      );
    } catch (e) {
      if (!e.message.includes('409')) throw e;
      // SHA 過期 — 重抓後重試一次
      const { sha } = await GitHubAPI.getJSON(pat, repo, path);
      this.archiveShas[year] = await GitHubAPI.putJSON(
        pat, repo, path, list, sha, `TaskFlow: archive ${year}`
      );
    }
  },

  // Debounced save；多個年份同時變動時一次 flush
  _scheduleArchiveSave(year) {
    this._archiveDirty.add(year);
    if (this._archiveSaveTimer) clearTimeout(this._archiveSaveTimer);
    const ind = document.getElementById('save-indicator');
    ind.classList.remove('hidden', 'error');
    ind.textContent = '同步中…';
    this._archiveSaveTimer = setTimeout(async () => {
      const years = [...this._archiveDirty];
      this._archiveDirty.clear();
      try {
        for (const y of years) await this._persistArchiveYear(y);
        ind.textContent = '已同步';
        setTimeout(() => ind.classList.add('hidden'), 1500);
      } catch (e) {
        ind.textContent = '同步失敗';
        ind.classList.add('error');
        this.showToast(`同步失敗：${e.message}`, 'error');
      }
    }, 1200);
  },

  // 攤平成單一陣列供搜尋 / 挑單器使用
  archiveList() {
    return Object.values(this.archives).flat();
  },

  archiveOf(planId) {
    if (!planId) return [];
    return this.archiveList()
      .filter(r => r.planId === planId)
      .sort((a, b) => String(b.journalDate || '').localeCompare(String(a.journalDate || '')));
  },

  updateArchive(id, updates) {
    for (const [year, list] of Object.entries(this.archives)) {
      const idx = list.findIndex(r => r.id === id);
      if (idx === -1) continue;
      list[idx] = { ...list[idx], ...updates };
      this._scheduleArchiveSave(year);
      return list[idx];
    }
    return null;
  },

  _archiveRecordFromTask(task, journalDate) {
    return {
      id: task.id,
      title: task.title || '',
      planId: task.planId || null,
      estimate: task.estimate || '',
      urgency: task.urgency || 'medium',
      completedAt: task.completedAt || new Date().toISOString(),
      journalDate
    };
  },

  // 把一批已完成任務封存。刻意「不」走 debounce —— 呼叫端（日誌上傳）
  // 要等實際寫入成功才敢刪任務，寫失敗就整批不動、任務留在看板上。
  async archiveTasks(tasks, journalDate) {
    if (!tasks || !tasks.length) return;
    await this.ensureArchivesLoaded();

    const snapshot = {};   // 失敗時還原，避免留下沒寫進 repo 的幽靈記錄
    const touched = new Set();

    tasks.forEach(t => {
      const year = this._yearOf(journalDate);
      if (!this.archives[year]) this.archives[year] = [];
      if (snapshot[year] === undefined) snapshot[year] = [...this.archives[year]];
      const key = `${journalDate}|${t.title || ''}`;
      const dup = this.archives[year].some(r => `${r.journalDate}|${r.title}` === key);
      if (dup) return;   // 同一天重複上傳日誌不會長出重複記錄
      this.archives[year].push(this._archiveRecordFromTask(t, journalDate));
      touched.add(year);
    });

    if (!touched.size) return;
    try {
      for (const year of touched) await this._persistArchiveYear(year);
    } catch (e) {
      Object.entries(snapshot).forEach(([year, list]) => { this.archives[year] = list; });
      throw e;
    }
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
    // 日誌編輯器開著時改歸屬（◇ 徽章快選 / ＋新規劃）要就地反映，兩條路徑都走這裡
    if ('planId' in updates && typeof Review !== 'undefined') Review.refreshPlanBadges();
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
