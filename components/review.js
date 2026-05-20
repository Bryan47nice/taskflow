// === Review Modal — 覆盤 + 產日誌 ===
const Review = {

  // ── 覆盤日誌列表 ──────────────────────────────────────────

  show() {
    document.getElementById('modal-review').classList.remove('hidden');
    document.getElementById('review-content').innerHTML = '<p class="loading">載入中…</p>';
    this._loadJournals();
  },

  hide() {
    if (this._isDirty && !confirm('有未儲存的修改，確定要關閉嗎？')) return;
    this._isDirty = false;
    this._currentPath = null;
    this._currentSha = null;
    this._currentContent = null;
    document.getElementById('modal-review').classList.add('hidden');
    document.querySelector('.review-modal-box')?.classList.remove('reading-mode');
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
        `<div class="journal-list-panel"><div class="journal-list">${list}</div></div><div id="journal-view" class="journal-view hidden"></div>`;

      document.querySelectorAll('.journal-item').forEach(btn => {
        btn.addEventListener('click', () => this._viewJournal(btn.dataset.path, btn.textContent));
      });
    } catch (e) {
      document.getElementById('review-content').innerHTML = `<p class="error">載入失敗：${e.message}</p>`;
    }
  },

  _currentPath: null,
  _currentSha: null,
  _currentContent: null,
  _isDirty: false,

  async _viewJournal(path, title) {
    if (this._isDirty) {
      if (!confirm('有未儲存的修改，確定要離開嗎？')) return;
      this._isDirty = false;
    }
    // highlight active item
    document.querySelectorAll('.journal-item').forEach(b =>
      b.classList.toggle('active', b.dataset.path === path)
    );
    const viewEl = document.getElementById('journal-view');
    viewEl.innerHTML = '<p class="loading">載入中…</p>';
    viewEl.classList.remove('hidden');
    document.querySelector('.review-modal-box').classList.add('reading-mode');
    try {
      const { content, sha } = await GitHubAPI.getRaw(App.settings.pat, App.settings.repo, path);
      this._currentPath = path;
      this._currentSha = sha;
      this._currentContent = content;
      this._renderView(viewEl, title, content);
    } catch (e) {
      viewEl.innerHTML = `<p class="error">載入失敗：${e.message}</p>`;
    }
  },

  _renderView(viewEl, title, content) {
    const parsed = this._parseJournalMd(content);
    const doneHtml = parsed.done.length
      ? parsed.done.map(l => `<div class="jv-item">${this._esc(l)}</div>`).join('')
      : '<div class="jv-empty">（無）</div>';
    const todoHtml = parsed.todo.length
      ? parsed.todo.map(l => `<div class="jv-item">${this._esc(l)}</div>`).join('')
      : '<div class="jv-empty">（未排）</div>';
    const pdcaHtml = parsed.pdca.length
      ? parsed.pdca.map(t => `
          <div class="jv-pdca-block">
            <div class="jv-pdca-title">${this._esc(t.title)}</div>
            ${['plan','do','check','act'].map(k => t[k] ? `
              <div class="pdca-field-row">
                <label>${k.charAt(0).toUpperCase()+k.slice(1)}</label>
                <div class="jv-pdca-val">${this._esc(t[k])}</div>
              </div>` : '').join('')}
          </div>`).join('')
      : '';
    const notesHtml = parsed.notes
      ? `<div class="journal-section">
           <div class="journal-section-label">備注</div>
           <div class="jv-notes">${this._esc(parsed.notes)}</div>
         </div>`
      : '';

    viewEl.innerHTML = `
      <div class="jv-header">
        <h3>${this._esc(title)}</h3>
        <button class="jv-mode-btn" id="jv-edit-btn">編輯</button>
      </div>
      <div class="jv-body">
        <div class="journal-section">
          <div class="journal-section-label">今日完成</div>
          <div class="jv-list">${doneHtml}</div>
        </div>
        ${parsed.pdca.length ? `<div class="journal-section">
          <div class="journal-section-label">PDCA 覆盤</div>
          ${pdcaHtml}
        </div>` : ''}
        <div class="journal-section">
          <div class="journal-section-label">明日計畫</div>
          <div class="jv-list">${todoHtml}</div>
        </div>
        ${notesHtml}
      </div>`;
    document.getElementById('jv-edit-btn').addEventListener('click', () =>
      this._renderEdit(viewEl, title, this._currentContent)
    );
  },

  _renderEdit(viewEl, title, content) {
    viewEl.innerHTML = `
      <div class="jv-header">
        <h3>${this._esc(title)}</h3>
        <div class="jv-edit-actions">
          <button class="jv-mode-btn" id="jv-view-btn">檢視</button>
          <button class="btn btn-primary jv-upload-btn" id="jv-upload-btn">上傳</button>
        </div>
      </div>
      <textarea class="journal-md-edit" id="jv-textarea" spellcheck="false"></textarea>`
    document.getElementById('jv-textarea').value = content;
    const ta = document.getElementById('jv-textarea');
    ta.addEventListener('input', () => { this._isDirty = true; });
    document.getElementById('jv-view-btn').addEventListener('click', () => {
      this._currentContent = ta.value;
      this._isDirty = false;
      this._renderView(viewEl, title, ta.value);
    });
    document.getElementById('jv-upload-btn').addEventListener('click', () =>
      this._uploadEditedJournal(ta, title)
    );
  },

  async _uploadEditedJournal(ta, title) {
    const btn = document.getElementById('jv-upload-btn');
    btn.disabled = true;
    btn.textContent = '上傳中…';
    try {
      const newContent = ta.value;
      await GitHubAPI.putRaw(
        App.settings.pat, App.settings.repo,
        this._currentPath, newContent,
        this._currentSha,
        `TaskFlow: update journal ${title}`
      );
      this._currentContent = newContent;
      this._isDirty = false;
      // refresh SHA after upload
      const { sha } = await GitHubAPI.getRaw(App.settings.pat, App.settings.repo, this._currentPath);
      this._currentSha = sha;
      App.showToast('日誌已更新');
    } catch (e) {
      App.showToast(`上傳失敗：${e.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '上傳';
    }
  },

  _parseJournalMd(md) {
    const result = { done: [], todo: [], pdca: [], notes: '' };
    const sections = md.split(/^## /m);
    for (const sec of sections) {
      const lines = sec.split('\n');
      const heading = lines[0].trim();
      const body = lines.slice(1).join('\n');
      if (heading.startsWith('今日完成')) {
        result.done = body.split('\n')
          .filter(l => /^- \[.\]/.test(l.trim()))
          .map(l => l.replace(/^- \[.\]\s*/, '').trim());
      } else if (heading.startsWith('明日計畫')) {
        result.todo = body.split('\n')
          .filter(l => /^- \[.\]/.test(l.trim()))
          .map(l => l.replace(/^- \[.\]\s*/, '').trim());
      } else if (heading.startsWith('PDCA')) {
        const tasks = body.split(/^### /m).filter(t => t.trim());
        result.pdca = tasks.map(t => {
          const tLines = t.split('\n');
          const taskTitle = tLines[0].trim();
          const taskBody = tLines.slice(1).join('\n');
          const get = (key) => {
            const m = taskBody.match(new RegExp(`\\*\\*${key}\\*\\*[：:](.*?)(?=\\n\\*\\*|$)`, 's'));
            return m ? m[1].trim() : '';
          };
          return { title: taskTitle, plan: get('Plan'), do: get('Do'), check: get('Check'), act: get('Act') };
        });
      } else if (heading.startsWith('備注')) {
        result.notes = body.trim();
      }
    }
    return result;
  },

  // ── 日誌編輯器 ────────────────────────────────────────────

  _pdcaTasks: [],         // [{ id, title, plan, do, check, act }]
  _pdcaActive: null,      // current active task id
  _journalDoneTasks: [],  // task objects to delete after journal submit

  showEditor(dateStr = null) {
    const today = App.getTodayKey();
    const date  = dateStr || today;
    const tasks = App.tasks;
    const done       = tasks.filter(t => (t.done || t.status === 'done') &&
      (t.completedAt ? t.completedAt.startsWith(date) : t.dayKey === date));
    this._journalDoneTasks = done;
    // 進行中：不受日期限制，所有 in-progress 都要繼續做
    const inProgress = tasks.filter(t => t.status === 'in-progress');
    // 明日計畫的 todo 一律以「今天」為基準（補填時「明日」= 補填當下隔天，仍從目前 todo 找）
    const todo       = tasks.filter(t => t.status === 'todo' &&
      (t.deadline === 'today' || t.dayKey === today || t.deadline === today));

    // 今日完成（只有 done）
    const doneList = document.getElementById('jf-done-list');
    doneList.innerHTML = '';
    done.map(t => `${t.title}${t.estimate ? ' (' + t.estimate + ')' : ''}`)
        .forEach(text => this._addDoneChip(text));

    // 明日計畫（todo + in-progress 未完成的繼續排）
    const upcoming = [...inProgress, ...todo];
    const todoList = document.getElementById('jf-todo-list');
    todoList.innerHTML = '';
    upcoming.map(t => `${t.title}${t.estimate ? ' (' + t.estimate + ')' : ''}`)
            .forEach(text => this._addDoneChip(text, todoList));

    document.getElementById('jf-notes').value = '';

    // PDCA tabs — done + in-progress，有任何 PDCA 資料的才顯示
    this._pdcaTasks = [...done, ...inProgress]
      .filter(t => t.pdca && Object.values(t.pdca).some(v => v?.trim()))
      .map(t => ({ id: t.id, title: t.title, plan: t.pdca.plan || '', do: t.pdca.do || '', check: t.pdca.check || '', act: t.pdca.act || '', links: t.links || [] }));
    this._pdcaActive = null;
    this._renderPdcaTabs();

    this._journalDateOverride = dateStr;
    document.getElementById('journal-editor-date').textContent = date;
    document.getElementById('modal-journal-editor').classList.remove('hidden');
  },

  // Open journal editor for a past date (backfill). Delegates to showEditor;
  // extra args kept for backward compatibility but ignored — data is recomputed
  // live from App.tasks instead of trusting the (possibly stale) midnight snapshot.
  showEditorForDate(dateStr) {
    this.showEditor(dateStr);
  },

  _addDoneChip(text, list = document.getElementById('jf-done-list')) {
    const chip = document.createElement('div');
    chip.className = 'jf-done-chip';
    chip.innerHTML = `<span title="${this._esc(text)}">${this._esc(text)}</span>`;
    list.appendChild(chip);
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
    const doneChips = [...document.querySelectorAll('#jf-done-list .jf-done-chip span')]
      .map(s => s.textContent.trim()).filter(Boolean);
    const todoChips = [...document.querySelectorAll('#jf-todo-list .jf-done-chip span')]
      .map(s => s.textContent.trim()).filter(Boolean);
    const notes = document.getElementById('jf-notes').value.trim();

    let md = `# ${today} 工作日誌\n\n`;

    md += `## 今日完成\n`;
    if (doneChips.length) {
      doneChips.forEach(l => { md += `- [x] ${l}\n`; });
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
        if (t.links && t.links.length) {
          const linkLines = t.links
            .map(l => typeof l === 'string' ? `- ${l}` : `- [${l.name || l.url}](${l.url})`)
            .join('\n');
          md += `**相關連結**：\n${linkLines}\n`;
        }
      });
    }

    md += `\n## 明日計畫\n`;
    if (todoChips.length) {
      todoChips.forEach(l => { md += `- [ ] ${l}\n`; });
    } else {
      md += `- （未排）\n`;
    }

    if (notes) {
      md += `\n## 備注\n${notes}\n`;
    }

    return md;
  },

  async _uploadJournal() {
    const today = this._journalDateOverride || App.getTodayKey();
    this._journalDateOverride = null;
    const md = this._formToMarkdown();

    const btn = document.getElementById('btn-journal-editor-upload');
    btn.disabled = true;
    btn.textContent = '上傳中…';

    const path = `taskflow/journal/${today}.md`;
    const { pat, repo, obsidianRepo } = App.settings;
    const obsidianPath = `02-Areas/CMoney-流量/工作日誌/${today}.md`;
    try {
      // ── 主 repo 上傳 ──
      let sha = null;
      try { const res = await GitHubAPI.getRaw(pat, repo, path); sha = res.sha; } catch (_) {}
      await GitHubAPI.putRaw(pat, repo, path, md, sha, `TaskFlow: journal ${today}`);

      // ── Obsidian repo 雙推 ──
      if (obsidianRepo) {
        try {
          let obSha = null;
          try { const res = await GitHubAPI.getRaw(pat, obsidianRepo, obsidianPath); obSha = res.sha; } catch (_) {}
          await GitHubAPI.putRaw(pat, obsidianRepo, obsidianPath, md, obSha, `TaskFlow: journal ${today}`);
          App.showToast(`日誌已上傳 → ${path}　+ Obsidian ✓`);
        } catch (e2) {
          App.showToast(`主倉上傳成功，Obsidian 失敗：${e2.message}`, 'error');
        }
      } else {
        App.showToast(`日誌已上傳 → ${path}`);
      }

      if (typeof Reminder !== 'undefined') Reminder.markJournalDone(today);
      // 清除已完成任務（日誌送出即代表該任務週期結束）
      for (const t of this._journalDoneTasks) {
        if (t.id) await App.deleteTask(t.id);
      }
      this._journalDoneTasks = [];
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
