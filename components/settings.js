// === Settings Modal ===
const Settings = {
  _onSave: null,

  show(onSave) {
    this._onSave = onSave;
    const s = App.settings;
    document.getElementById('s-pat').value = s.pat || '';
    document.getElementById('s-repo').value = s.repo || '';
    document.getElementById('s-obsidian-repo').value = s.obsidianRepo || '';
    document.getElementById('s-hours').value = s.dailyHours || 8;
    document.getElementById('s-claude-key').value = s.claudeKey || '';
    document.getElementById('s-cal-id').value = s.calClientId || '';
    document.getElementById('s-status').textContent = '';
    document.getElementById('modal-settings').classList.remove('hidden');
  },

  hide() {
    document.getElementById('modal-settings').classList.add('hidden');
  },

  async save() {
    const pat = document.getElementById('s-pat').value.trim();
    const repo = document.getElementById('s-repo').value.trim();
    const obsidianRepo = document.getElementById('s-obsidian-repo').value.trim();
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

    App.saveSettings({ pat, repo, obsidianRepo, dailyHours, claudeKey, calClientId });
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

  init() {
    document.getElementById('btn-settings').addEventListener('click', () => this.show());
    document.getElementById('btn-settings-save').addEventListener('click', () => this.save());
    document.getElementById('btn-settings-cancel').addEventListener('click', () => {
      if (App.settings.pat) this.hide();
    });
    ['s-repo', 's-obsidian-repo'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', e => {
        const v = e.target.value.replace('https://github.com/', '').replace(/\/$/, '');
        if (v !== e.target.value) e.target.value = v;
      });
    });
  }
};
