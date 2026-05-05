// === Review Modal — 覆盤 + 產日誌 ===
const Review = {

  // ── 覆盤日誌列表 ──────────────────────────────────────────

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
        .sort((a, b) => b.name.localeCompare(a.name));

      if (!md.length) {
        document.getElementById('review-content').innerHTML = '<p class="muted">還沒有日誌記錄</p>';
        return;
      }

      const list = md.map(f => {
        const date = f.name.replace('.md', '');
        return `<button class="journal-item" data-path="${f.path}">${date}</button>`;
      }).join('');
      document.getElementById('review-content').innerHTML =
        `<div class="journal-list">${list}</div><div id="journal-view" class="journal-view hidden"></div>`;

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

  // ── 日誌編輯器 ────────────────────────────────────────────

  _pdcaTasks: [],      // [{ id, title, plan, do, check, act }]
  _pdcaActive: null,   // current active task id

  showEditor() {
    const today = App.getTodayKey();
    const tasks = App.tasks;
    const done       = tasks.filter(t => (t.done || t.status === 'done') && t.dayKey === today);
    const inProgress = tasks.filter(t => t.status === 'in-progress' && (t.deadline === 'today' || t.dayKey === today));
    const todo       = tasks.filter(t => t.status === 'todo' && (t.deadline === 'today' || t.dayKey === today));

    // 今日完成（只有 done）
    document.getElementById('jf-done').value = done.length
      ? done.map(t => `${t.title}${t.estimate ? ' (' + t.estimate + ')' : ''}`).join('\n')
      : '';

    // 明日計畫（todo + in-progress 未完成的繼續排）
    const upcoming = [...inProgress, ...todo];
    document.getElementById('jf-todo').value = upcoming.length
      ? upcoming.map(t => `${t.title}${t.estimate ? ' (' + t.estimate + ')' : ''}`).join('\n')
      : '';

    document.getElementById('jf-notes').value = '';

    // PDCA tabs — done + in-progress，有任何 PDCA 資料的才顯示
    this._pdcaTasks = [...done, ...inProgress]
      .filter(t => t.pdca && Object.values(t.pdca).some(v => v?.trim()))
      .map(t => ({ id: t.id, title: t.title, plan: t.pdca.plan || '', do: t.pdca.do || '', check: t.pdca.check || '', act: t.pdca.act || '' }));
    this._pdcaActive = null;
    this._renderPdcaTabs();

    document.getElementById('journal-editor-date').textContent = today;
    document.getElementById('modal-journal-editor').classList.remove('hidden');
    document.getElementById('jf-done').focus();
  },

  _renderPdcaTabs() {
    const tabsEl   = document.getElementById('jf-pdca-tabs');
    const fieldsEl = document.getElementById('jf-pdca-fields');

    if (!this._pdcaTasks.length) {
      tabsEl.innerHTML = '<span class="journal-pdca-no-tasks">今日尚無 PDCA 記錄</span>';
      fieldsEl.classList.add('hidden');
      return;
    }

    tabsEl.innerHTML = this._pdcaTasks.map(t =>
      `<button class="journal-pdca-tab${t.id === this._pdcaActive ? ' active' : ''}" data-id="${t.id}" title="${this._esc(t.title)}">${this._esc(t.title)}</button>`
    ).join('');

    tabsEl.querySelectorAll('.journal-pdca-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._savePdcaFields(); // 切換前先存目前欄位
        this._switchPdcaTab(btn.dataset.id);
      });
    });

    // Auto-select first if none active
    if (!this._pdcaActive && this._pdcaTasks.length) {
      this._switchPdcaTab(this._pdcaTasks[0].id);
    } else {
      fieldsEl.classList.remove('hidden');
      this._loadPdcaFields(this._pdcaActive);
    }
  },

  _switchPdcaTab(id) {
    this._pdcaActive = id;
    document.querySelectorAll('.journal-pdca-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.id === id)
    );
    document.getElementById('jf-pdca-fields').classList.remove('hidden');
    this._loadPdcaFields(id);
  },

  _loadPdcaFields(id) {
    const t = this._pdcaTasks.find(x => x.id === id);
    if (!t) return;
    document.getElementById('jf-pdca-plan').value  = t.plan;
    document.getElementById('jf-pdca-do').value    = t.do;
    document.getElementById('jf-pdca-check').value = t.check;
    document.getElementById('jf-pdca-act').value   = t.act;
  },

  _savePdcaFields() {
    if (!this._pdcaActive) return;
    const t = this._pdcaTasks.find(x => x.id === this._pdcaActive);
    if (!t) return;
    t.plan  = document.getElementById('jf-pdca-plan').value;
    t.do    = document.getElementById('jf-pdca-do').value;
    t.check = document.getElementById('jf-pdca-check').value;
    t.act   = document.getElementById('jf-pdca-act').value;
  },

  hideEditor() {
    document.getElementById('modal-journal-editor').classList.add('hidden');
  },

  // 將表單欄位組合成 Markdown（上傳時才轉）
  _formToMarkdown() {
    this._savePdcaFields(); // 儲存目前編輯中的 tab
    const today = App.getTodayKey();
    const done  = document.getElementById('jf-done').value.trim();
    const todo  = document.getElementById('jf-todo').value.trim();
    const notes = document.getElementById('jf-notes').value.trim();

    let md = `# ${today} 工作日誌\n\n`;

    md += `## 今日完成\n`;
    if (done) {
      done.split('\n').filter(l => l.trim()).forEach(l => { md += `- [x] ${l.trim()}\n`; });
    } else {
      md += `- （無）\n`;
    }

    const activePdca = this._pdcaTasks.filter(t =>
      t.plan.trim() || t.do.trim() || t.check.trim() || t.act.trim()
    );
    if (activePdca.length) {
      md += `\n## PDCA 覆盤\n`;
      activePdca.forEach(t => {
        md += `\n### ${t.title}\n`;
        if (t.plan.trim())  md += `**Plan**：${t.plan.trim()}\n`;
        if (t.do.trim())    md += `**Do**：${t.do.trim()}\n`;
        if (t.check.trim()) md += `**Check**：${t.check.trim()}\n`;
        if (t.act.trim())   md += `**Act**：${t.act.trim()}\n`;
      });
    }

    md += `\n## 明日計畫\n`;
    if (todo) {
      todo.split('\n').filter(l => l.trim()).forEach(l => { md += `- [ ] ${l.trim()}\n`; });
    } else {
      md += `- （未排）\n`;
    }

    if (notes) {
      md += `\n## 備注\n${notes}\n`;
    }

    return md;
  },

  async _uploadJournal() {
    const today = App.getTodayKey();
    const md = this._formToMarkdown();

    const btn = document.getElementById('btn-journal-editor-upload');
    btn.disabled = true;
    btn.textContent = '上傳中…';

    const path = `taskflow/journal/${today}.md`;
    const { pat, repo } = App.settings;
    try {
      let sha = null;
      try {
        const res = await GitHubAPI.getRaw(pat, repo, path);
        sha = res.sha;
      } catch (_) { /* 新檔案 */ }

      await GitHubAPI.putRaw(pat, repo, path, md, sha, `TaskFlow: journal ${today}`);
      App.showToast(`日誌已上傳 → ${path}`);
      this.hideEditor();
    } catch (e) {
      App.showToast(`上傳失敗：${e.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:4px"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>上傳`;
    }
  },

  _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  // ── Init ──────────────────────────────────────────────────

  init() {
    // 覆盤按鈕
    document.getElementById('btn-review').addEventListener('click', () => this.show());
    document.getElementById('btn-review-close').addEventListener('click', () => this.hide());
    document.getElementById('modal-review').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-review')) this.hide();
    });

    // 產日誌按鈕 → 開編輯器（不直接推）
    document.getElementById('btn-journal').addEventListener('click', () => this.showEditor());

    // 日誌編輯器
    document.getElementById('btn-journal-editor-close').addEventListener('click', () => this.hideEditor());
    document.getElementById('btn-journal-editor-cancel').addEventListener('click', () => this.hideEditor());
    document.getElementById('btn-journal-editor-upload').addEventListener('click', () => this._uploadJournal());
    document.getElementById('modal-journal-editor').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-journal-editor')) this.hideEditor();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !document.getElementById('modal-journal-editor').classList.contains('hidden')) {
        this.hideEditor();
      }
    });
  }
};
