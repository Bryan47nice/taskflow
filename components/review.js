// === Review Modal — 覆盤 + 產日誌 ===
const Review = {
  show() {
    document.getElementById('modal-review').classList.remove('hidden');
    document.getElementById('review-content').innerHTML = '<p class="loading">載入中…</p>';
    this._loadJournals();
  },

  hide() {
    document.getElementById('modal-review').classList.add('hidden');
  },

  async _loadJournals() {
    const { pat, repo } = App.settings;
    if (!pat || !repo) {
      document.getElementById('review-content').innerHTML = '<p class="error">請先設定 GitHub 連線</p>';
      return;
    }
    try {
      const files = await GitHubAPI.listDir(pat, repo, 'taskflow/journal');
      const md = files
        .filter(f => f.name.endsWith('.md'))
        .sort((a, b) => b.name.localeCompare(a.name)); // newest first

      if (!md.length) {
        document.getElementById('review-content').innerHTML = '<p class="muted">還沒有日誌記錄</p>';
        return;
      }

      const list = md.map(f => {
        const date = f.name.replace('.md', '');
        return `<button class="journal-item" data-path="${f.path}">${date}</button>`;
      }).join('');
      document.getElementById('review-content').innerHTML = `<div class="journal-list">${list}</div><div id="journal-view" class="journal-view hidden"></div>`;

      document.querySelectorAll('.journal-item').forEach(btn => {
        btn.addEventListener('click', () => this._viewJournal(btn.dataset.path, btn.textContent));
      });
    } catch (e) {
      document.getElementById('review-content').innerHTML = `<p class="error">載入失敗：${e.message}</p>`;
    }
  },

  async _viewJournal(path, title) {
    const viewEl = document.getElementById('journal-view');
    viewEl.innerHTML = '<p class="loading">載入中…</p>';
    viewEl.classList.remove('hidden');
    try {
      const { content } = await GitHubAPI.getRaw(App.settings.pat, App.settings.repo, path);
      viewEl.innerHTML = `<h3>${title}</h3><pre class="journal-md">${this._esc(content)}</pre>`;
    } catch (e) {
      viewEl.innerHTML = `<p class="error">載入失敗：${e.message}</p>`;
    }
  },

  _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  // Generate today's journal markdown and push to GitHub
  async generateAndPush() {
    const today = App.getTodayKey();
    const tasks = App.tasks;
    const done = tasks.filter(t => (t.done || t.status === 'done') && t.dayKey === today);
    const todo = tasks.filter(t => !(t.done || t.status === 'done') && (t.deadline === 'today' || t.dayKey === today));

    let md = `# ${today} 工作日誌\n\n`;

    md += `## 今日完成\n`;
    if (done.length) {
      done.forEach(t => {
        md += `- [x] ${t.title} (${t.estimate || '?'})\n`;
      });
    } else {
      md += `- （無）\n`;
    }

    const withPDCA = done.filter(t => t.pdca && Object.values(t.pdca).some(v => v?.trim()));
    if (withPDCA.length) {
      md += `\n## PDCA\n`;
      withPDCA.forEach(t => {
        md += `\n### 任務：${t.title}\n`;
        if (t.pdca.plan) md += `**Plan**：${t.pdca.plan}\n`;
        if (t.pdca.do) md += `**Do**：${t.pdca.do}\n`;
        if (t.pdca.check) md += `**Check**：${t.pdca.check}\n`;
        if (t.pdca.act) md += `**Act**：${t.pdca.act}\n`;
      });
    }

    md += `\n## 明日計畫\n`;
    if (todo.length) {
      todo.forEach(t => {
        md += `- [ ] ${t.title} (${t.estimate || '?'})\n`;
      });
    } else {
      md += `- （未排）\n`;
    }

    const path = `taskflow/journal/${today}.md`;
    const { pat, repo } = App.settings;
    try {
      const { sha } = await GitHubAPI.getRaw(pat, repo, path);
      await GitHubAPI.putRaw(pat, repo, path, md, sha, `TaskFlow: journal ${today}`);
      App.showToast(`日誌已推送到 ${path}`);
      return md;
    } catch (e) {
      App.showToast(`日誌推送失敗：${e.message}`, 'error');
      return null;
    }
  },

  init() {
    document.getElementById('btn-review').addEventListener('click', () => this.show());
    document.getElementById('btn-review-close').addEventListener('click', () => this.hide());
    document.getElementById('btn-journal').addEventListener('click', async () => {
      const md = await this.generateAndPush();
      if (md) {
        // Also show preview in a temporary window
        const w = window.open('', '_blank', 'width=600,height=700');
        if (w) {
          w.document.write(`<pre style="font-family:monospace;padding:20px">${md.replace(/</g,'&lt;')}</pre>`);
        }
      }
    });
    document.getElementById('modal-review').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-review')) this.hide();
    });
  }
};
