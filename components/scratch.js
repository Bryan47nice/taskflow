// === Scratch Pad + 昨日摘要 ===
const Scratch = {
  _debounce: null,

  render() {
    const el = document.getElementById('panel-scratch');
    if (!el) return;
    const saved = localStorage.getItem('taskflow_scratch') || '';

    el.innerHTML = `
      <div class="side-card-header">📝 便條紙</div>
      <textarea class="scratch-textarea" id="scratch-input"
        placeholder="隨手記下想法…"
        spellcheck="false">${this._esc(saved)}</textarea>`;

    document.getElementById('scratch-input').addEventListener('input', e => {
      clearTimeout(this._debounce);
      this._debounce = setTimeout(() => {
        localStorage.setItem('taskflow_scratch', e.target.value);
      }, 500);
    });

    this._loadYesterdaySummary();
  },

  async _loadYesterdaySummary() {
    const el = document.getElementById('panel-scratch');
    if (!el) return;
    const { pat, repo } = (typeof App !== 'undefined') ? App.settings : {};
    if (!pat || !repo) return;

    try {
      const files = await GitHubAPI.listDir(pat, repo, 'taskflow/journal');
      const sorted = files
        .filter(f => f.name.endsWith('.md'))
        .sort((a, b) => b.name.localeCompare(a.name));
      if (!sorted.length) return;

      const latest = sorted[0];
      const { content } = await GitHubAPI.getRaw(pat, repo, latest.path);
      const date = latest.name.replace('.md', '');
      const doneItems = this._parseDoneItems(content).slice(0, 3);
      if (!doneItems.length) return;

      const summaryEl = document.createElement('div');
      summaryEl.className = 'scratch-yesterday';
      summaryEl.innerHTML = `
        <div class="scratch-yesterday-label">📅 ${date} 完成</div>
        <ul class="scratch-yesterday-list">
          ${doneItems.map(i => `<li>${this._esc(i)}</li>`).join('')}
        </ul>`;
      el.querySelector('.scratch-yesterday')?.remove();
      el.appendChild(summaryEl);
    } catch (_) { /* silently skip if no GitHub connection */ }
  },

  _parseDoneItems(md) {
    const match = md.match(/## 今日完成\n([\s\S]*?)(?=\n## |$)/);
    if (!match) return [];
    return match[1].split('\n')
      .filter(l => /^- \[.\]/.test(l.trim()))
      .map(l => l.replace(/^- \[.\]\s*/, '').trim())
      .filter(Boolean);
  },

  _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },

  init() { this.render(); }
};
