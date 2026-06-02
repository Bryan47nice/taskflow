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
