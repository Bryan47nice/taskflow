// === Settings Modal ===
const Settings = {
  _onSave: null,

  show(onSave) {
    this._onSave = onSave;
    const s = App.settings;
    document.getElementById('s-pat').value = s.pat || '';
    document.getElementById('s-repo').value = s.repo || '';
    document.getElementById('s-obsidian-repo').value = s.obsidianRepo || '';
    document.getElementById('s-obsidian-folder').value = s.obsidianFolder || '';
    document.getElementById('s-hours').value = s.dailyHours || 8;
    document.getElementById('s-claude-key').value = s.claudeKey || '';
    document.getElementById('s-cal-id').value = s.calClientId || '';
    document.getElementById('s-status').textContent = '';
    const impStatus = document.getElementById('s-import-history-status');
    if (impStatus) { impStatus.textContent = ''; impStatus.className = 'settings-hint'; }
    document.getElementById('app-version-display').textContent = `TaskFlow ${APP_VERSION}`;
    document.getElementById('modal-settings').classList.remove('hidden');
  },

  hide() {
    document.getElementById('modal-settings').classList.add('hidden');
  },

  async save() {
    const pat = document.getElementById('s-pat').value.trim();
    const repo = document.getElementById('s-repo').value.trim();
    const obsidianRepo = document.getElementById('s-obsidian-repo').value.trim();
    const obsidianFolder = document.getElementById('s-obsidian-folder').value.trim().replace(/^\/+|\/+$/g, '');
    const dailyHours = parseFloat(document.getElementById('s-hours').value) || 8;
    const claudeKey = document.getElementById('s-claude-key').value.trim();
    const calClientId = document.getElementById('s-cal-id').value.trim();

    if (!pat || !repo) {
      this._setStatus('GitHub PAT 和 Repo 為必填', 'error');
      return;
    }

    this._setStatus('驗證中…', '');
    const ok = await GitHubAPI.ping(pat, repo).catch(() => false);
    if (!ok) {
      this._setStatus('無法連接到此 repo，請確認 PAT 權限與 repo 名稱', 'error');
      return;
    }

    App.saveSettings({ pat, repo, obsidianRepo, obsidianFolder, dailyHours, claudeKey, calClientId });
    this._setStatus('已儲存', 'ok');
    setTimeout(() => {
      this.hide();
      if (this._onSave) this._onSave();
    }, 600);
  },

  _setStatus(msg, type) {
    const el = document.getElementById('s-status');
    el.textContent = msg;
    el.className = `settings-status ${type}`;
  },

  // ── 一次性：從舊日誌匯入歷史完成單 ──────────────────────────────
  // v1.12.0 之前，日誌上傳後任務就被刪掉，過去的成果只存在 journal md。
  // 這裡把那些「今日完成」項目反推成封存記錄，之後才能歸屬長期規劃。
  // 以 journalDate|title 去重，可重複執行不會產生重複資料。
  _parseDoneTitles(md) {
    const lines = String(md || '').split(/\r?\n/);
    const start = lines.findIndex(l => /^##\s+今日完成\s*$/.test(l));
    if (start === -1) return [];
    const out = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (/^##\s+/.test(lines[i])) break;          // 下一個大段落（PDCA 覆盤 / 明日計畫）
      const m = lines[i].match(/^-\s*\[x\]\s+(.+?)\s*$/i);
      if (!m) continue;                             // 明日計畫的 - [ ] 不在此區段，不會誤抓
      let title = m[1];
      if (title === '（無）' || title === '(無)') continue;
      let estimate = '';
      // 只有符合「數字＋m/h」才當估時剝掉，標題本身含括號不會被誤剝
      const em = title.match(/\s*\((\d+(?:\.\d+)?[mh]\+?)\)$/);
      if (em) { estimate = em[1]; title = title.slice(0, em.index).trim(); }
      if (title) out.push({ title, estimate });
    }
    return out;
  },

  // 匯入記錄的 id。刻意由「日期＋標題」推導而非用行序號：行序號會因為
  // 部分匯入或日誌後來被編輯而位移，兩筆不同的歷史單可能拿到同一個 id，
  // 之後 updateArchive(id) 就會改到錯的那筆（歸屬跑到別張單上）。
  _archiveId(date, title, taken) {
    let h = 0;
    const s = `${date}|${title}`;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    const base = `a_${date}_${(h >>> 0).toString(36)}`;
    if (!taken || !taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}_${n}`)) n++;    // 理論上碰不到，防禦性處理
    return `${base}_${n}`;
  },

  async importJournalHistory() {
    const btn = document.getElementById('btn-import-history');
    const el  = document.getElementById('s-import-history-status');
    const set = (msg, cls = '') => { el.textContent = msg; el.className = `settings-hint ${cls}`; };

    const { pat, repo } = App.settings;
    if (!pat || !repo) { set('請先「驗證並儲存」GitHub 設定', 'error'); return; }
    btn.disabled = true;

    try {
      set('讀取現有封存資料…');
      await App.ensureArchivesLoaded();

      set('列出日誌檔…');
      const files = await GitHubAPI.listDir(pat, repo, 'taskflow/journal');
      const dates = files
        .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f.name || ''))
        .map(f => f.name.slice(0, 10))
        .sort();
      if (!dates.length) { set('taskflow/journal 找不到任何日誌檔', 'error'); return; }

      const existing = new Set(App.archiveList().map(r => `${r.journalDate}|${r.title}`));
      const takenIds = new Set(App.archiveList().map(r => r.id));
      const byYear = {};
      let added = 0, skipped = 0, unreadable = 0;

      // 序列執行，不併發 —— 避免撞 GitHub secondary rate limit
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        set(`處理 ${i + 1} / ${dates.length}…（新增 ${added}、跳過 ${skipped}）`);
        let md = '';
        try {
          const res = await GitHubAPI.getRaw(pat, repo, `taskflow/journal/${date}.md`);
          md = res.content || '';
        } catch (_) { unreadable++; continue; }

        this._parseDoneTitles(md).forEach(item => {
          const key = `${date}|${item.title}`;
          if (existing.has(key)) { skipped++; return; }
          existing.add(key);
          const id = this._archiveId(date, item.title, takenIds);
          takenIds.add(id);
          const year = date.slice(0, 4);
          if (!byYear[year]) byYear[year] = [];
          byYear[year].push({
            id,                            // a_ 前綴 = 從舊日誌反推，非原生 task id
            title: item.title,
            planId: null,
            estimate: item.estimate,
            urgency: 'medium',
            completedAt: `${date}T12:00:00.000Z`,   // 日誌只有日期精度，取中午當代表值
            journalDate: date
          });
          added++;
        });
      }

      const tail = unreadable ? `，${unreadable} 份日誌讀取失敗` : '';
      if (!added) {
        set(`匯入完成：沒有新增（已存在 ${skipped} 筆）${tail}`, 'ok');
        return;
      }

      set(`寫入封存檔…（新增 ${added} 筆）`);
      for (const [year, recs] of Object.entries(byYear)) {
        if (!App.archives[year]) App.archives[year] = [];
        App.archives[year].push(...recs);
        App.archives[year].sort((a, b) => String(a.journalDate).localeCompare(String(b.journalDate)));
        await App._persistArchiveYear(year);
      }
      set(`匯入完成：新增 ${added} 筆、跳過 ${skipped} 筆（已存在）${tail}`, 'ok');
      if (typeof Plan !== 'undefined' && Plan.isOpen()) Plan.render();
    } catch (e) {
      // 已寫入的年檔保留，下次執行會因去重而接續，不會重複
      set(`匯入失敗：${e.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  },

  exportSettings() {
    const data = {
      pat: document.getElementById('s-pat').value.trim(),
      repo: document.getElementById('s-repo').value.trim(),
      obsidianRepo: document.getElementById('s-obsidian-repo').value.trim(),
      obsidianFolder: document.getElementById('s-obsidian-folder').value.trim(),
      dailyHours: parseFloat(document.getElementById('s-hours').value) || 8,
      claudeKey: document.getElementById('s-claude-key').value.trim(),
      calClientId: document.getElementById('s-cal-id').value.trim(),
      _exportedAt: new Date().toISOString(),
      _appVersion: APP_VERSION
    };
    if (!data.pat && !data.repo) {
      this._setStatus('沒有可匯出的設定', 'error');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taskflow-settings-${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this._setStatus('已匯出設定檔（含 PAT，請妥善保管）', 'ok');
  },

  async importSettings(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (typeof data !== 'object' || data === null) throw new Error('格式錯誤');
      if (data.pat !== undefined) document.getElementById('s-pat').value = data.pat || '';
      if (data.repo !== undefined) document.getElementById('s-repo').value = data.repo || '';
      if (data.obsidianRepo !== undefined) document.getElementById('s-obsidian-repo').value = data.obsidianRepo || '';
      if (data.obsidianFolder !== undefined) document.getElementById('s-obsidian-folder').value = data.obsidianFolder || '';
      if (data.dailyHours !== undefined) document.getElementById('s-hours').value = data.dailyHours || 8;
      if (data.claudeKey !== undefined) document.getElementById('s-claude-key').value = data.claudeKey || '';
      if (data.calClientId !== undefined) document.getElementById('s-cal-id').value = data.calClientId || '';
      this._setStatus('已匯入，請按「驗證並儲存」確認', 'ok');
    } catch (err) {
      this._setStatus(`匯入失敗：${err.message}`, 'error');
    }
  },

  init() {
    document.getElementById('btn-settings').addEventListener('click', () => this.show());
    document.getElementById('btn-settings-save').addEventListener('click', () => this.save());
    document.getElementById('btn-settings-cancel').addEventListener('click', () => {
      if (App.settings.pat) this.hide();
    });
    document.getElementById('btn-settings-export').addEventListener('click', () => this.exportSettings());
    document.getElementById('btn-import-history')?.addEventListener('click', () => this.importJournalHistory());
    const fileInput = document.getElementById('s-import-file');
    document.getElementById('btn-settings-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      this.importSettings(file);
      e.target.value = '';
    });
    ['s-repo', 's-obsidian-repo'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', e => {
        const v = e.target.value.replace('https://github.com/', '').replace(/\/$/, '');
        if (v !== e.target.value) e.target.value = v;
      });
    });
  }
};
