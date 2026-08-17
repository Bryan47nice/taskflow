// === Review Modal — 覆盤 + 產日誌 ===
const Review = {

  // ── 週覆盤 ────────────────────────────────────────────────

  _isDirty: false,
  _weeklyStart: null,
  _weeklyEnd: null,
  _weeklyDone: [],
  _weeklyPdca: [],
  _aggToken: null,

  show() {
    document.getElementById('modal-review').classList.remove('hidden');
    const start = this._weekStart();
    const end   = App.getTodayKey();
    this._weeklyStart = start;
    this._weeklyEnd   = end;
    if (this._wkStartPicker) { this._wkStartPicker.set('maxDate', end); this._wkStartPicker.setDate(start, false); }
    else document.getElementById('wk-start').value = start;
    if (this._wkEndPicker) { this._wkEndPicker.set('minDate', start); this._wkEndPicker.set('maxDate', 'today'); this._wkEndPicker.setDate(end, false); }
    else document.getElementById('wk-end').value = end;
    this._prefillNextWeek();
    this._aggregateRange(start, end);
  },

  hide() {
    if (this._isDirty && !confirm('有未儲存的修改，確定要關閉嗎？')) return;
    this._isDirty = false;
    document.getElementById('modal-review').classList.add('hidden');
  },

  _fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  _weekStart() {
    const d = new Date();
    const back = (d.getDay() + 6) % 7; // 週一=0
    d.setDate(d.getDate() - back);
    return this._fmtDate(d);
  },
  _weekdayLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return ['日','一','二','三','四','五','六'][d.getDay()];
  },
  // YYYY-MM-DD → M/D。規劃推進那一節每列都帶日期，寫全長會太吵。
  _mdDate(dateStr) {
    const p = String(dateStr || '').split('-');
    return p.length === 3 ? `${parseInt(p[1])}/${parseInt(p[2])}` : String(dateStr || '');
  },
  _datesInRange(start, end) {
    const out = [];
    const e = new Date(end + 'T00:00:00');
    for (let d = new Date(start + 'T00:00:00'); d <= e; d.setDate(d.getDate() + 1)) {
      out.push(this._fmtDate(new Date(d)));
    }
    return out;
  },
  _prefillNextWeek() {
    const ta = document.getElementById('wk-nextweek');
    if (!ta || ta.value.trim()) return; // 不覆蓋使用者已打的內容
    const todos = (App.tasks || [])
      .filter(t => t.status === 'todo')
      .map(t => `${t.title}${t.estimate ? ' (' + t.estimate + ')' : ''}`);
    ta.value = todos.join('\n');
  },

  async _aggregateRange(start, end) {
    const doneEl = document.getElementById('wk-done');
    const pdcaEl = document.getElementById('wk-pdca');
    if (start > end) { // YYYY-MM-DD 字串比較即等同日期比較
      doneEl.innerHTML = '<div class="jv-empty wk-warn">⚠ 結束日不能早於開始日</div>';
      pdcaEl.innerHTML = '';
      this._weeklyDone = []; this._weeklyPdca = [];
      return;
    }
    const { pat, repo } = App.settings;
    if (!pat || !repo) {
      doneEl.innerHTML = '<div class="jv-empty">請先設定 GitHub 連線</div>';
      pdcaEl.innerHTML = '';
      return;
    }
    doneEl.innerHTML = '<p class="loading">彙整中…</p>';
    pdcaEl.innerHTML = '';

    const dates = this._datesInRange(start, end);
    const token = `${start}~${end}`;
    this._aggToken = token;

    const byDay = [];   // { date, label, items: [{ text, plan }] }
    const pdca  = [];   // { date, title, plan, do, check, act }
    let coverage = 0;

    // 封存記錄拿來補規劃歸屬。它比日誌 md 的小標更新 —— 事後用規劃頁
    // 「加入既有單」改過的歸屬只寫進封存記錄，日誌不會回頭改；v1.13.0
    // 之前的日誌也根本沒有小標。載入失敗就只靠小標，不要讓整個彙整掛掉。
    try { if (App.ensureArchivesLoaded) await App.ensureArchivesLoaded(); } catch (_) {}
    if (this._aggToken !== token) return;

    // 平行抓。PDCA 內文只存在 md 裡，抓的次數省不掉，但沒有理由一天一個
    // round trip 慢慢等 —— 區間拉長時差別很明顯。
    const fetched = await Promise.all(dates.map(async date => {
      try {
        const res = await GitHubAPI.getRaw(pat, repo, `taskflow/journal/${date}.md`);
        return { date, content: res.content }; // 404 → content === null（getRaw 不丟錯）
      } catch (_) { return { date, content: null }; }
    }));
    if (this._aggToken !== token) return; // race 保護：區間已被改掉就放棄

    const archIdx = this._archivePlanIndex();

    for (const { date, content } of fetched) {
      if (!content) continue;
      coverage++;
      const parsed = this._parseJournalMd(content);
      const items = parsed.done.map(it => ({
        text: it.text,
        // 封存記錄優先，日誌小標次之
        plan: this._planTitle(archIdx.get(`${date}|${this._stripEstimate(it.text)}`)) || it.plan
      }));
      if (items.length) byDay.push({ date, label: this._weekdayLabel(date), items });
      parsed.pdca.forEach(t => pdca.push({ date, ...t }));
    }

    this._weeklyDone = byDay;
    this._weeklyPdca = pdca;
    this._renderAggregation(byDay, pdca, coverage, dates.length);
  },

  // 「journalDate|標題」→ planId。只收有歸屬的，查不到就讓呼叫端退回日誌小標。
  _archivePlanIndex() {
    const idx = new Map();
    const list = (typeof App !== 'undefined' && App.archiveList) ? App.archiveList() : [];
    list.forEach(r => {
      if (r.planId && r.journalDate) idx.set(`${r.journalDate}|${r.title}`, r.planId);
    });
    return idx;
  },

  // 剝掉日誌條目尾巴的估時，還原成封存記錄裡的標題。規則與 settings.js
  // 的歷史匯入一致：只有「數字＋m/h」才算估時，標題自帶括號不會被誤剝。
  _stripEstimate(text) {
    const m = String(text || '').match(/\s*\((\d+(?:\.\d+)?[mh]\+?)\)$/);
    return m ? text.slice(0, m.index).trim() : String(text || '').trim();
  },

  // 規劃名 → 該規劃本週完成的項目。未歸屬的另外計數，用來看有多少工作
  // 沒有掛在任何長期目標底下。
  _planSummary(byDay) {
    const byPlan = new Map();
    let unassigned = 0;
    byDay.forEach(d => d.items.forEach(i => {
      if (!i.plan) { unassigned++; return; }
      if (!byPlan.has(i.plan)) byPlan.set(i.plan, []);
      byPlan.get(i.plan).push({ date: d.date, text: i.text });
    }));
    return { byPlan, unassigned };
  },

  _renderAggregation(byDay, pdca, coverage, totalDays) {
    const doneEl = document.getElementById('wk-done');
    const pdcaEl = document.getElementById('wk-pdca');
    const totalItems = byDay.reduce((n, d) => n + d.items.length, 0);
    const { byPlan, unassigned } = this._planSummary(byDay);

    // 規劃推進放在逐日清單之前：「這週把哪些長期目標往前推了」比
    // 「星期三做了什麼」更接近週覆盤要回答的問題
    const planBlock = byPlan.size ? `
      <div class="wk-plan-summary">
        <div class="wk-plan-summary-head">本週規劃推進</div>
        ${[...byPlan.entries()].map(([name, items]) => `
          <div class="wk-plan-row">
            <span class="plan-badge">◇ ${this._esc(name)}</span>
            <span class="wk-plan-count">${items.length} 項</span>
          </div>`).join('')}
        ${unassigned ? `<div class="wk-plan-row wk-plan-row-none">
          <span class="wk-plan-none-label">未歸屬</span>
          <span class="wk-plan-count">${unassigned} 項</span>
        </div>` : ''}
      </div>` : '';

    doneEl.innerHTML = `
      <div class="wk-agg-meta">共 ${totalItems} 項・本週 ${coverage}/${totalDays} 天有日誌</div>
      ${planBlock}
      ${byDay.length ? byDay.map(d => `
        <div class="wk-day-block">
          <div class="wk-day-head">${d.date}（週${d.label}）</div>
          ${d.items.map(i => `<div class="jv-item">${this._esc(i.text)}${
            i.plan ? `<span class="plan-badge jv-item-plan">◇ ${this._esc(i.plan)}</span>` : ''
          }</div>`).join('')}
        </div>`).join('') : '<div class="jv-empty">（無）</div>'}`;

    pdcaEl.innerHTML = pdca.length ? pdca.map(t => `
      <div class="jv-pdca-block">
        <div class="jv-pdca-title">${this._esc(t.title)}（${t.date}）</div>
        ${['plan','do','check','act'].map(k => t[k] ? `
          <div class="pdca-field-row"><label>${k.charAt(0).toUpperCase()+k.slice(1)}</label><div class="jv-pdca-val">${this._esc(t[k])}</div></div>` : '').join('')}
      </div>`).join('') : '<div class="jv-empty">（無 PDCA 記錄）</div>';
  },

  _weeklyToMarkdown() {
    const start = this._weeklyStart, end = this._weeklyEnd;
    const byDay = this._weeklyDone || [];
    const pdca  = this._weeklyPdca || [];
    const reflection = document.getElementById('wk-reflection').value.trim();
    const nextweek = document.getElementById('wk-nextweek').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    const totalItems = byDay.reduce((n, d) => n + d.items.length, 0);

    const { byPlan, unassigned } = this._planSummary(byDay);

    let md = `# ${start} ~ ${end} 週覆盤\n\n`;

    if (byPlan.size) {
      md += `## 本週規劃推進\n`;
      byPlan.forEach((items, name) => {
        md += `\n### ◇ ${name}（${items.length} 項）\n`;
        items.forEach(i => { md += `- ${i.text}（${this._mdDate(i.date)}）\n`; });
      });
      if (unassigned) md += `\n未歸屬：${unassigned} 項\n`;
      md += `\n`;
    }

    md += `## 本週完成總覽（共 ${totalItems} 項）\n`;
    if (byDay.length) {
      byDay.forEach(d => {
        md += `### ${d.date}（週${d.label}）\n`;
        d.items.forEach(i => { md += `- [x] ${i.text}\n`; });
      });
    } else {
      md += `- （無）\n`;
    }

    if (pdca.length) {
      md += `\n## PDCA 彙總\n`;
      pdca.forEach(t => {
        md += `\n### ${t.title}（${t.date}）\n`;
        if (t.plan)  md += `**Plan**：${t.plan}\n`;
        if (t.do)    md += `**Do**：${t.do}\n`;
        if (t.check) md += `**Check**：${t.check}\n`;
        if (t.act)   md += `**Act**：${t.act}\n`;
      });
    }

    if (reflection) md += `\n## 本週反思\n${reflection}\n`;
    if (nextweek.length) {
      md += `\n## 下週重點\n`;
      nextweek.forEach(i => { md += `- [ ] ${i}\n`; });
    }
    return md;
  },

  async _uploadWeekly() {
    const start = this._weeklyStart, end = this._weeklyEnd;
    if (start > end) { App.showToast('結束日不能早於開始日', 'error'); return; }
    const md = this._weeklyToMarkdown();

    const btn = document.getElementById('btn-weekly-upload');
    btn.disabled = true;
    btn.textContent = '上傳中…';

    const file = `${start}_${end}.md`;
    const path = `taskflow/weekly/${file}`;
    const { pat, repo, obsidianRepo, obsidianFolder } = App.settings;
    const folder = (obsidianFolder || DEFAULT_OBSIDIAN_FOLDER).replace(/^\/+|\/+$/g, '');
    const obsidianPath = `${folder}/週報/${file}`;

    // 先抓 SHA 當「已存在」判斷（沿用 v1.6.0 防覆蓋）
    let sha = null, obSha = null;
    try { const res = await GitHubAPI.getRaw(pat, repo, path); sha = res.sha; } catch (_) {}
    if (obsidianRepo) {
      try { const res = await GitHubAPI.getRaw(pat, obsidianRepo, obsidianPath); obSha = res.sha; } catch (_) {}
    }
    if ((sha || obSha) &&
        !confirm(`⚠ ${start} ~ ${end} 週覆盤已存在，請先到 Obsidian 確認是否要覆蓋。\n\n確定要覆蓋嗎？`)) {
      btn.disabled = false;
      btn.textContent = '上傳';
      return;
    }

    try {
      await GitHubAPI.putRaw(pat, repo, path, md, sha, `TaskFlow: weekly ${start}~${end}`);
      if (obsidianRepo) {
        try {
          await GitHubAPI.putRaw(pat, obsidianRepo, obsidianPath, md, obSha, `TaskFlow: weekly ${start}~${end}`);
          App.showToast(`週覆盤已上傳 → ${path}　+ Obsidian ✓`);
        } catch (e2) {
          App.showToast(`主倉上傳成功，Obsidian 失敗：${e2.message}`, 'error');
        }
      } else {
        App.showToast(`週覆盤已上傳 → ${path}（⚠ 未設定 Obsidian repo，未同步）`, 'error');
      }
      this._isDirty = false;
      this.hide();
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
        // v1.13.0 起這一段可能被 `### ◇ 規劃名` / `### 未歸屬` 小標分組；
        // 更早的日誌是扁平清單，跑起來就是 group 一路是空字串。
        let group = '';
        result.done = [];
        body.split('\n').forEach(line => {
          const t = line.trim();
          const h = t.match(/^###\s+(.+)$/);
          if (h) {
            const name = h[1].trim();
            group = name === '未歸屬' ? '' : name.replace(/^◇\s*/, '').trim();
            return;
          }
          if (/^- \[.\]/.test(t)) {
            result.done.push({ text: t.replace(/^- \[.\]\s*/, '').trim(), plan: group });
          }
        });
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
    // 完成清單一律取「目前完成欄全部」——使用者可自選這份成果要產成哪一天的日誌
    // （含補產昨天還累積在 done 欄、尚未被清掉的項目）。上傳後一律清除這些任務。
    const done = tasks.filter(t => t.done || t.status === 'done');
    this._journalDoneTasks = done;
    // 進行中：不受日期限制，所有 in-progress 都要繼續做
    const inProgress = tasks.filter(t => t.status === 'in-progress');
    // 明日計畫的 todo 一律以「今天」為基準（補填時「明日」= 補填當下隔天，仍從目前 todo 找）
    const todo       = tasks.filter(t => t.status === 'todo' &&
      (t.deadline === 'today' || t.dayKey === today || t.deadline === today));

    // 今日完成（只有 done）。planId 帶在 chip 上，產 md 時才依規劃分組；
    // 帶 taskId 才掛得上 ◇ 徽章，讓漏歸屬的單在這裡就能補
    const doneList = document.getElementById('jf-done-list');
    doneList.innerHTML = '';
    done.forEach(t => this._addDoneChip(
      `${t.title}${t.estimate ? ' (' + t.estimate + ')' : ''}`, doneList, t.planId, t.id
    ));

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
      .map(t => ({ id: t.id, title: t.title, planId: t.planId || null, plan: t.pdca.plan || '', do: t.pdca.do || '', check: t.pdca.check || '', act: t.pdca.act || '', links: t.links || [] }));
    this._pdcaActive = null;
    this._renderPdcaTabs();

    this._journalDate = date;
    if (this._datePicker) this._datePicker.setDate(date, false);
    else document.getElementById('journal-editor-date-input').value = date;
    this._checkJournalExists(date);
    document.getElementById('modal-journal-editor').classList.remove('hidden');
  },

  // 檢查所選日期是否已有日誌（主倉 + Obsidian 倉），有就顯示警示。回傳布林。
  async _checkJournalExists(date) {
    const warn = document.getElementById('journal-editor-exists-warn');
    const { pat, repo, obsidianRepo, obsidianFolder } = App.settings;
    if (!pat || !repo) { warn.classList.add('hidden'); return false; }
    try {
      const mainPath = `taskflow/journal/${date}.md`;
      const mainRes = await GitHubAPI.getRaw(pat, repo, mainPath);
      let exists = !!mainRes.sha;
      if (!exists && obsidianRepo) {
        const folder = (obsidianFolder || DEFAULT_OBSIDIAN_FOLDER).replace(/^\/+|\/+$/g, '');
        const obRes = await GitHubAPI.getRaw(pat, obsidianRepo, `${folder}/${date}.md`);
        exists = !!obRes.sha;
      }
      // 競態保護：檢查回來時若使用者已改成別的日期，忽略這次結果
      if (date !== this._journalDate) return false;
      warn.classList.toggle('hidden', !exists);
      return exists;
    } catch (_) {
      warn.classList.add('hidden');
      return false;
    }
  },

  // Open journal editor for a past date (backfill). Delegates to showEditor;
  // extra args kept for backward compatibility but ignored — data is recomputed
  // live from App.tasks instead of trusting the (possibly stale) midnight snapshot.
  showEditorForDate(dateStr) {
    this.showEditor(dateStr);
  },

  _addDoneChip(text, list = document.getElementById('jf-done-list'), planId = null, taskId = null) {
    const chip = document.createElement('div');
    chip.className = 'jf-done-chip';
    if (planId) chip.dataset.planId = planId;
    if (taskId) chip.dataset.taskId = taskId;
    chip.innerHTML = `<span class="jf-chip-text" title="${this._esc(text)}">${this._esc(text)}</span>`;
    if (taskId) {
      chip.insertAdjacentHTML('beforeend', this._chipPlanBadge(planId));
      this._wireChipBadge(chip);
    }
    list.appendChild(chip);
  },

  // 日誌編輯器的規劃徽章。沿用看板的 .plan-badge 外觀，但未歸屬一律顯示成
  // 看得見的「◇ 未歸屬」—— 看板那顆是 opacity:0、靠 .task-card:hover 才浮現，
  // 這裡沒有 .task-card 祖先，照抄會變成看不見也點不到，而「把漏歸屬的單挑出來」
  // 正是這個編輯器要做的事。
  _chipPlanBadge(planId) {
    const name = this._planTitle(planId);
    return name
      ? `<button type="button" class="plan-badge jf-plan-badge" title="${this._esc(name)}｜點擊改歸屬">◇ ${this._esc(name)}</button>`
      : `<button type="button" class="plan-badge jf-plan-badge jf-plan-badge-empty" title="點擊歸到長期規劃">◇ 未歸屬</button>`;
  },

  _wireChipBadge(chip) {
    const badge = chip.querySelector('.plan-badge');
    if (!badge) return;
    badge.addEventListener('click', e => {
      e.stopPropagation();
      if (typeof PlanPick !== 'undefined') PlanPick.openQuick(chip.dataset.taskId, badge);
    });
  },

  // 由 App.updateTask 在編輯器開著時呼叫：歸屬一改就地更新，不用關掉重開。
  // 快選 popover 與「＋ 新規劃…」兩條路徑最後都走 updateTask，所以一個接點全包。
  refreshPlanBadges() {
    const modal = document.getElementById('modal-journal-editor');
    if (!modal || modal.classList.contains('hidden')) return;
    const tasks = (typeof App !== 'undefined' && App.tasks) ? App.tasks : [];

    document.querySelectorAll('#jf-done-list .jf-done-chip[data-task-id]').forEach(chip => {
      const task = tasks.find(t => t.id === chip.dataset.taskId);
      if (!task) return;
      const planId = task.planId || '';
      if (planId) chip.dataset.planId = planId;
      else delete chip.dataset.planId;
      chip.querySelector('.plan-badge')?.remove();
      chip.insertAdjacentHTML('beforeend', this._chipPlanBadge(planId));
      this._wireChipBadge(chip);
    });

    // PDCA 區塊的「所屬規劃」是開窗當下的快照，不同步的話同一份日誌
    // 上半段（今日完成分組）跟下半段（PDCA）會對不起來
    this._pdcaTasks.forEach(t => {
      const task = tasks.find(x => x.id === t.id);
      if (task) t.planId = task.planId || null;
    });
  },

  // 規劃名稱。查不到（規劃已被刪）就回空字串，該單併回「未歸屬」，
  // 不要寫出一個孤兒 id 當標題。
  _planTitle(planId) {
    if (!planId || typeof App === 'undefined' || !App.plans) return '';
    const p = App.plans.find(x => x.id === planId);
    return p ? (p.title || '').trim() : '';
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
  _formToMarkdown(dateStr) {
    this._savePdcaFields(); // 儲存目前編輯中的 tab
    const today = dateStr || App.getTodayKey();
    const doneChips = [...document.querySelectorAll('#jf-done-list .jf-done-chip')]
      .map(c => ({
        text: c.querySelector('.jf-chip-text').textContent.trim(),
        plan: this._planTitle(c.dataset.planId)
      }))
      .filter(c => c.text);
    const todoChips = [...document.querySelectorAll('#jf-todo-list .jf-chip-text')]
      .map(s => s.textContent.trim()).filter(Boolean);
    const notes = document.getElementById('jf-notes').value.trim();

    let md = `# ${today} 工作日誌\n\n`;

    // 今日完成：有任何一張歸屬到規劃時才分組，全部未歸屬就維持原本的扁平清單
    // （不要讓從來沒用規劃的日子憑空多一層小標）。標題字串一律原樣不動 ——
    // settings.js 的歷史匯入以「日期＋標題」去重，動到標題會長出重複封存記錄。
    md += `## 今日完成\n`;
    if (!doneChips.length) {
      md += `- （無）\n`;
    } else if (!doneChips.some(c => c.plan)) {
      doneChips.forEach(c => { md += `- [x] ${c.text}\n`; });
    } else {
      const groups = new Map();   // 規劃名 → 標題陣列；'' = 未歸屬
      doneChips.forEach(c => {
        if (!groups.has(c.plan)) groups.set(c.plan, []);
        groups.get(c.plan).push(c.text);
      });
      const named = [...groups.keys()].filter(Boolean);   // 依完成欄出現順序
      const keys = groups.has('') ? [...named, ''] : named;   // 未歸屬永遠殿後
      keys.forEach(k => {
        md += `\n### ${k ? '◇ ' + k : '未歸屬'}\n`;
        groups.get(k).forEach(t => { md += `- [x] ${t}\n`; });
      });
    }

    const activePdca = this._pdcaTasks.filter(t =>
      t.plan.trim() || t.do.trim() || t.check.trim() || t.act.trim()
    );
    if (activePdca.length) {
      md += `\n## PDCA 覆盤\n`;
      activePdca.forEach(t => {
        md += `\n### ${t.title}\n`;
        // 歸屬寫成獨立欄位而非接在標題後面：標題是週覆盤彙整的識別字串，
        // 保持乾淨；這行也剛好能被既有的 **欄位**：值 解析法讀到
        const planName = this._planTitle(t.planId);
        if (planName)       md += `**所屬規劃**：${planName}\n`;
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
    const today = this._journalDate || App.getTodayKey();
    const md = this._formToMarkdown(today);

    const btn = document.getElementById('btn-journal-editor-upload');
    btn.disabled = true;
    btn.textContent = '上傳中…';

    const path = `taskflow/journal/${today}.md`;
    const { pat, repo, obsidianRepo, obsidianFolder } = App.settings;
    const folder = (obsidianFolder || DEFAULT_OBSIDIAN_FOLDER).replace(/^\/+|\/+$/g, '');
    const obsidianPath = `${folder}/${today}.md`;

    // ── 先抓 SHA（順便當「已存在」判斷）：任一倉已有日誌就先提醒，避免靜默覆蓋 ──
    let sha = null, obSha = null;
    try { const res = await GitHubAPI.getRaw(pat, repo, path); sha = res.sha; } catch (_) {}
    if (obsidianRepo) {
      try { const res = await GitHubAPI.getRaw(pat, obsidianRepo, obsidianPath); obSha = res.sha; } catch (_) {}
    }
    if ((sha || obSha) &&
        !confirm(`⚠ ${today} 已有日誌，請先到 Obsidian 確認是否要覆蓋。\n\n確定要覆蓋嗎？`)) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:4px"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>上傳`;
      return;
    }

    try {
      // ── 主 repo 上傳 ──
      await GitHubAPI.putRaw(pat, repo, path, md, sha, `TaskFlow: journal ${today}`);

      // ── Obsidian repo 雙推 ──
      if (obsidianRepo) {
        try {
          await GitHubAPI.putRaw(pat, obsidianRepo, obsidianPath, md, obSha, `TaskFlow: journal ${today}`);
          App.showToast(`日誌已上傳 → ${path}　+ Obsidian ✓`);
        } catch (e2) {
          App.showToast(`主倉上傳成功，Obsidian 失敗：${e2.message}`, 'error');
        }
      } else {
        // obsidianRepo 未設定：明確警示，避免看起來跟「雙推成功」一樣而誤以為已同步
        App.showToast(`日誌已上傳 → ${path}（⚠ 未設定 Obsidian repo，未同步）`, 'error');
      }

      if (typeof Reminder !== 'undefined') Reminder.markJournalDone(today);

      // 先封存再刪除：長期規劃要看得到這些歷史貢獻。封存失敗就整批不刪，
      // 任務留在完成欄可重試上傳 —— 寧可重複也不要讓成果憑空消失。
      try {
        await App.archiveTasks(this._journalDoneTasks, today);
      } catch (e) {
        App.showToast(`日誌已上傳，但封存失敗：${e.message}；任務保留在看板上`, 'error');
        return;
      }

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
    // 週覆盤按鈕
    document.getElementById('btn-review').addEventListener('click', () => this.show());
    document.getElementById('btn-review-close').addEventListener('click', () => this.hide());
    document.getElementById('btn-weekly-cancel').addEventListener('click', () => this.hide());
    document.getElementById('modal-review').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-review')) this.hide();
    });

    // 週覆盤日期區間（不允許選未來；結束日不可早於開始日，反之亦然）
    this._wkStartPicker = flatpickr('#wk-start', {
      dateFormat: 'Y-m-d', maxDate: 'today',
      onChange: ([d]) => {
        if (!d) return;
        this._weeklyStart = this._fmtDate(d);
        if (this._wkEndPicker) this._wkEndPicker.set('minDate', this._weeklyStart);
        this._aggregateRange(this._weeklyStart, this._weeklyEnd);
      }
    });
    this._wkEndPicker = flatpickr('#wk-end', {
      dateFormat: 'Y-m-d', maxDate: 'today',
      onChange: ([d]) => {
        if (!d) return;
        this._weeklyEnd = this._fmtDate(d);
        if (this._wkStartPicker) this._wkStartPicker.set('maxDate', this._weeklyEnd);
        this._aggregateRange(this._weeklyStart, this._weeklyEnd);
      }
    });
    document.getElementById('btn-weekly-upload').addEventListener('click', () => this._uploadWeekly());
    ['wk-reflection','wk-nextweek'].forEach(id =>
      document.getElementById(id).addEventListener('input', () => { this._isDirty = true; })
    );

    // 產日誌按鈕 → 開編輯器（不直接推）
    document.getElementById('btn-journal').addEventListener('click', () => this.showEditor());

    // 日誌日期選擇器（可自選要產哪一天的日誌；不允許選未來）
    this._datePicker = flatpickr('#journal-editor-date-input', {
      dateFormat: 'Y-m-d',
      maxDate: 'today',
      onChange: ([date]) => {
        if (!date) return;
        const _pad = n => String(n).padStart(2, '0');
        const ds = `${date.getFullYear()}-${_pad(date.getMonth()+1)}-${_pad(date.getDate())}`;
        this._journalDate = ds;
        this._checkJournalExists(ds);
      }
    });

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
