// === End-of-day Reminder & Failsafe ===
const Reminder = {
  _HOLIDAYS_KEY: 'taskflow_tw_holidays',
  _DONE_KEY:     'taskflow_journal_done',
  _REMINDED_KEY: 'taskflow_reminded',
  _SNAPSHOT_KEY: 'taskflow_eod_snapshot',
  _bannerDismissedThisSession: false,

  // ── Public API ───────────────────────────────────────────────
  markJournalDone(dateKey) {
    const date = dateKey || ((typeof App !== 'undefined') ? App.getTodayKey() : this._dateKey(new Date()));
    localStorage.setItem(this._DONE_KEY, JSON.stringify({ date }));
    const snap = JSON.parse(localStorage.getItem(this._SNAPSHOT_KEY) || 'null');
    if (snap && snap.date <= date) localStorage.removeItem(this._SNAPSHOT_KEY);
    document.getElementById('reminder-banner')?.classList.add('hidden');
  },

  // ── Init ─────────────────────────────────────────────────────
  async init() {
    this._bindButtons();
    await this._checkMissedJournal();
    this._tick();
    setInterval(() => this._tick(), 60_000);
  },

  _bindButtons() {
    document.getElementById('btn-reminder-journal-now')?.addEventListener('click', () => {
      this._closeModal();
      document.getElementById('btn-journal')?.click();
    });

    document.getElementById('btn-reminder-dismiss')?.addEventListener('click', () => {
      this._closeModal();
      const today = (typeof App !== 'undefined') ? App.getTodayKey() : this._dateKey(new Date());
      localStorage.setItem(this._REMINDED_KEY, JSON.stringify({ date: today, level: 'dismissed' }));
    });

    document.getElementById('btn-reminder-banner-journal')?.addEventListener('click', () => {
      const snap = JSON.parse(localStorage.getItem(this._SNAPSHOT_KEY) || 'null');
      if (snap && typeof Review !== 'undefined' && Review.showEditorForDate) {
        Review.showEditorForDate(snap.date);
      } else {
        document.getElementById('btn-journal')?.click();
      }
    });

    document.getElementById('btn-reminder-banner-done')?.addEventListener('click', () => {
      const snap = JSON.parse(localStorage.getItem(this._SNAPSHOT_KEY) || 'null');
      this.markJournalDone(snap?.date);
    });

    document.getElementById('btn-reminder-banner-dismiss')?.addEventListener('click', () => {
      this._bannerDismissedThisSession = true;
      document.getElementById('reminder-banner')?.classList.add('hidden');
    });
  },

  // ── Core Tick (runs every minute) ────────────────────────────
  async _tick() {
    const now  = new Date();
    const h    = now.getHours();
    const today = (typeof App !== 'undefined') ? App.getTodayKey() : this._dateKey(now);

    // Midnight snapshot window: 00:00–00:59
    if (h === 0) { await this._maybeTakeSnapshot(); return; }

    await this._checkMissedJournal();

    // Evening window only
    if (h < 18 || h > 23) return;
    if (this._hasJournal(today)) return;

    const isWorkday = await this._isWorkday(now);
    if (!isWorkday) return;

    const reminded     = JSON.parse(localStorage.getItem(this._REMINDED_KEY) || 'null');
    const todayLevel   = reminded?.date === today ? reminded.level : null;
    if (todayLevel === 'dismissed') return;

    if (h >= 18 && h < 19 && !todayLevel) {
      this._showToast();
      localStorage.setItem(this._REMINDED_KEY, JSON.stringify({ date: today, level: 'toast' }));
    } else if (h >= 19 && todayLevel !== 'modal') {
      this._showModal();
      localStorage.setItem(this._REMINDED_KEY, JSON.stringify({ date: today, level: 'modal' }));
    }
  },

  // ── Page-load: check for unfinished yesterday ────────────────
  async _checkMissedJournal() {
    if (this._bannerDismissedThisSession) return;
    const snap = JSON.parse(localStorage.getItem(this._SNAPSHOT_KEY) || 'null');
    if (!snap) return;

    const today = (typeof App !== 'undefined') ? App.getTodayKey() : this._dateKey(new Date());
    if (snap.date >= today) return;

    const done = JSON.parse(localStorage.getItem(this._DONE_KEY) || 'null');
    if (done?.date >= snap.date) { localStorage.removeItem(this._SNAPSHOT_KEY); return; }

    this._showMissedBanner(snap);
  },

  // ── Midnight snapshot ────────────────────────────────────────
  async _maybeTakeSnapshot() {
    const yesterday = this._dateKey(new Date(Date.now() - 86_400_000));

    const existing = JSON.parse(localStorage.getItem(this._SNAPSHOT_KEY) || 'null');
    if (existing?.date === yesterday) return;

    const done = JSON.parse(localStorage.getItem(this._DONE_KEY) || 'null');
    if (done?.date >= yesterday) return;

    const isWorkday = await this._isWorkday(new Date(Date.now() - 86_400_000));
    if (!isWorkday) return;

    const tasks = typeof App !== 'undefined' ? App.tasks : [];
    localStorage.setItem(this._SNAPSHOT_KEY, JSON.stringify({
      date:       yesterday,
      doneTasks:  tasks.filter(t => t.status === 'done'),
      doingTasks: tasks.filter(t => t.status === 'doing'),
      takenAt:    new Date().toISOString()
    }));
  },

  // ── UI ───────────────────────────────────────────────────────
  _showToast() {
    if (typeof App !== 'undefined') App.showToast('⏰ 18:00 了，記得產今日日誌！', 'info', 12_000);
  },

  _showModal()  { document.getElementById('reminder-modal')?.classList.remove('hidden'); },
  _closeModal() { document.getElementById('reminder-modal')?.classList.add('hidden'); },

  _showMissedBanner(snap) {
    const banner = document.getElementById('reminder-banner');
    if (!banner) return;
    const el = id => document.getElementById(id);
    const dateEl  = el('reminder-banner-date');
    const countEl = el('reminder-banner-count');
    // 即時掃 App.tasks 統計目前 done 任務數 — 與補填 modal 帶入的清單一致
    // （補填路徑不按 completedAt 過濾，把累積在 done 的事都抓回來給用戶確認）
    const liveDoneCount = (typeof App !== 'undefined' ? App.tasks : [])
      .filter(t => t.done || t.status === 'done')
      .length;
    if (dateEl)  dateEl.textContent  = snap.date;
    if (countEl) countEl.textContent = liveDoneCount;
    banner.classList.remove('hidden');
  },

  // ── Helpers ──────────────────────────────────────────────────
  _hasJournal(dateKey) {
    const done = JSON.parse(localStorage.getItem(this._DONE_KEY) || 'null');
    return done?.date === dateKey;
  },

  _dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  },

  async _isWorkday(date) {
    const dow     = date.getDay();
    const yyyymmdd = this._dateKey(date).replace(/-/g, '');
    const year    = date.getFullYear();
    const holidays = await this._getHolidays(year);
    if (!holidays) return dow >= 1 && dow <= 5;
    const entry = holidays.find(h => h.date === yyyymmdd);
    if (!entry) return dow >= 1 && dow <= 5;
    return !entry.isHoliday; // false = workday (incl. 補班), true = holiday/rest
  },

  async _getHolidays(year) {
    const key    = `${this._HOLIDAYS_KEY}_${year}`;
    const cached = JSON.parse(localStorage.getItem(key) || 'null');
    if (cached && Date.now() - cached.ts < 30 * 86_400_000) return cached.data;
    try {
      const res  = await fetch(`https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`);
      if (!res.ok) return null;
      const data = await res.json();
      localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
      return data;
    } catch { return null; }
  }
};
