# 週覆盤（Weekly Review）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把現有被動的「覆盤」單篇日誌瀏覽器，改造成「週覆盤」——可選區間、自動彙整一週日誌（完成總覽 + PDCA）、引導寫反思與下週重點，產出 markdown 雙推 GitHub 主倉 + Obsidian。

**Architecture:** 純前端、無 build、無測試框架。重用 `modal-review` 外殼、`_parseJournalMd` 解析器、flatpickr、GitHubAPI、v1.6.0 防覆蓋確認。完成/PDCA 從 GitHub 主倉 `taskflow/journal/{date}.md` 逐日撈取後唯讀彙整；反思/下週重點為可編輯 textarea。

**Tech Stack:** Vanilla JS、flatpickr、GitHub Contents API（`lib/github-api.js`）。

**驗證方式（本專案沒有 test runner）：** 每個 task 用 `node --check` 做語法檢查 + `localhost:3456` preview 用 `preview_eval` 做行為煙霧測試（stub 網路呼叫驗證邏輯，不真的寫 GitHub）。

**設計來源：** `docs/superpowers/specs/2026-06-04-weekly-review-design.md`

---

## File Structure

| 檔案 | 改動 |
|---|---|
| `index.html` | `btn-review` 文字 覆盤→週覆盤；`modal-review` 內容換成週覆盤編輯器骨架 |
| `components/review.js` | 移除單篇瀏覽/編輯 5 個方法；新增週覆盤邏輯；保留 `_parseJournalMd`/`_esc` |
| `style.css` | 移除單篇瀏覽器專用死樣式；加週覆盤樣式（保留 `.jv-item/.jv-empty/.jv-pdca-*`，彙整渲染要用） |
| `app.js` / `CHANGELOG.md` / `chrome-extension/manifest.json` | 版本 v1.8.0 |

---

## Task 1: 改造按鈕 + Modal 骨架，移除舊 JS，show() 開空編輯器

每個 commit 都要讓 app 可正常載入。本 task 一次完成 HTML 換骨架 + JS 移除舊方法 + 新 `show()/hide()`，避免出現「HTML 已換、舊 JS 還抓不到舊元素而報錯」的中間狀態。

**Files:**
- Modify: `index.html`（`btn-review` 文字、`modal-review` 區塊）
- Modify: `components/review.js`（移除舊方法、改寫 show/hide/init）

- [ ] **Step 1: 改 `btn-review` 按鈕文字**

`index.html` 第 41 行：
```html
      <span class="btn-review-text">覆盤</span>
```
改為：
```html
      <span class="btn-review-text">週覆盤</span>
```

- [ ] **Step 2: 換掉 `modal-review` 內容為週覆盤骨架**

`index.html` 第 464–476 行整段替換為：
```html
<div id="modal-review" class="modal hidden">
  <div class="modal-box review-modal-box weekly-box">
    <div class="modal-header">
      <h2>週覆盤</h2>
      <div class="weekly-range">
        <input type="text" id="wk-start" class="journal-editor-date-input" readonly placeholder="起">
        <span class="weekly-range-sep">~</span>
        <input type="text" id="wk-end" class="journal-editor-date-input" readonly placeholder="訖">
      </div>
      <button class="btn-icon" id="btn-review-close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="journal-section">
        <div class="journal-section-label">本週完成總覽</div>
        <div id="wk-done" class="wk-agg"></div>
      </div>
      <div class="journal-section">
        <div class="journal-section-label">PDCA 彙總</div>
        <div id="wk-pdca" class="wk-agg"></div>
      </div>
      <div class="journal-section">
        <div class="journal-section-label">本週反思</div>
        <textarea id="wk-reflection" rows="4" placeholder="本週心得 / 問題 / 學到什麼…"></textarea>
      </div>
      <div class="journal-section">
        <div class="journal-section-label">下週重點</div>
        <textarea id="wk-nextweek" rows="4" placeholder="下週要推進的重點（已帶入目前待辦，可加減）"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="btn-weekly-cancel">取消</button>
      <button class="btn btn-primary" id="btn-weekly-upload">上傳</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: 移除 review.js 單篇瀏覽/編輯方法**

`components/review.js` 中刪除這些方法整段：`_loadJournals`、`_viewJournal`、`_renderView`、`_renderEdit`、`_uploadEditedJournal`，以及狀態欄位 `_currentPath`、`_currentSha`、`_currentContent`（約 22–181 行範圍內）。
**保留** `_parseJournalMd`、`_esc`、`_isDirty`。

- [ ] **Step 4: 改寫 `show()` / `hide()`**

把原本的 `show()`（呼叫 `_loadJournals`）與 `hide()` 換成：
```js
  show() {
    document.getElementById('modal-review').classList.remove('hidden');
    const start = this._weekStart();
    const end   = App.getTodayKey();
    this._weeklyStart = start;
    this._weeklyEnd   = end;
    if (this._wkStartPicker) this._wkStartPicker.setDate(start, false);
    else document.getElementById('wk-start').value = start;
    if (this._wkEndPicker) this._wkEndPicker.setDate(end, false);
    else document.getElementById('wk-end').value = end;
    this._prefillNextWeek();
    this._aggregateRange(start, end);
  },

  hide() {
    if (this._isDirty && !confirm('有未儲存的修改，確定要關閉嗎？')) return;
    this._isDirty = false;
    document.getElementById('modal-review').classList.add('hidden');
  },
```

- [ ] **Step 5: 加日期/帶入 helpers 與 `_prefillNextWeek`（暫時的 `_aggregateRange` 空殼）**

在 review.js 的 Review 物件內新增（`_aggregateRange` 本 task 先放空殼，Task 2 補實作）：
```js
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
    // Task 2 補實作
    document.getElementById('wk-done').innerHTML = '<div class="jv-empty">（彙整功能待實作）</div>';
    document.getElementById('wk-pdca').innerHTML = '';
  },
```

- [ ] **Step 6: 改寫 `init()` 綁定**

把 `init()` 裡與 review modal 相關的綁定改成（保留 PDCA/其他無關綁定不動）：
```js
    document.getElementById('btn-review').addEventListener('click', () => this.show());
    document.getElementById('btn-review-close').addEventListener('click', () => this.hide());
    document.getElementById('btn-weekly-cancel').addEventListener('click', () => this.hide());
    document.getElementById('modal-review').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-review')) this.hide();
    });

    // 週覆盤日期區間
    this._wkStartPicker = flatpickr('#wk-start', {
      dateFormat: 'Y-m-d', maxDate: 'today',
      onChange: ([d]) => { if (!d) return; this._weeklyStart = this._fmtDate(d); this._aggregateRange(this._weeklyStart, this._weeklyEnd); }
    });
    this._wkEndPicker = flatpickr('#wk-end', {
      dateFormat: 'Y-m-d', maxDate: 'today',
      onChange: ([d]) => { if (!d) return; this._weeklyEnd = this._fmtDate(d); this._aggregateRange(this._weeklyStart, this._weeklyEnd); }
    });
    document.getElementById('btn-weekly-upload').addEventListener('click', () => this._uploadWeekly());
    ['wk-reflection','wk-nextweek'].forEach(id =>
      document.getElementById(id).addEventListener('input', () => { this._isDirty = true; })
    );
```
注意：`_uploadWeekly` 於 Task 3 才實作；本 task 先加一個空殼避免 init 時參考錯誤：
```js
  async _uploadWeekly() { /* Task 3 補實作 */ },
```

- [ ] **Step 7: 語法檢查**

Run: `node --check components/review.js`
Expected: 無輸出（通過）

- [ ] **Step 8: 瀏覽器煙霧測試**

確保 preview server 在跑（`preview_start` name `taskflow-preview`），reload 後 `preview_eval`：
```js
(() => {
  document.getElementById('btn-review').click();
  const open = !document.getElementById('modal-review').classList.contains('hidden');
  const r = {
    modalOpen: open,
    title: document.querySelector('#modal-review h2').textContent,
    start: document.getElementById('wk-start').value,
    end: document.getElementById('wk-end').value,
    nextweekPrefilled: document.getElementById('wk-nextweek').value.length >= 0
  };
  Review.hide();
  return r;
})()
```
Expected: `modalOpen:true`、`title:"週覆盤"`、`start` = 本週一、`end` = 今天。並確認 console 無 error（`preview_console_logs` level error → 空）。

- [ ] **Step 9: Commit**

```bash
git add index.html components/review.js
git commit -m "refactor(v1.8.0): 覆盤改造為週覆盤骨架，移除單篇日誌瀏覽器"
```

---

## Task 2: 區間彙整（讀日誌 + 解析 + 渲染完成總覽/PDCA）

**Files:**
- Modify: `components/review.js`（`_aggregateRange` 實作 + 新增 `_renderAggregation`）

- [ ] **Step 1: 用實作取代 `_aggregateRange` 空殼**

```js
  async _aggregateRange(start, end) {
    const doneEl = document.getElementById('wk-done');
    const pdcaEl = document.getElementById('wk-pdca');
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

    const byDay = [];   // { date, label, items: [] }
    const pdca  = [];   // { date, title, plan, do, check, act }
    let coverage = 0;

    for (const date of dates) {
      let content = null;
      try {
        const res = await GitHubAPI.getRaw(pat, repo, `taskflow/journal/${date}.md`);
        content = res.content; // 404 → res.content === null（getRaw 不丟錯）
      } catch (_) { content = null; }
      if (this._aggToken !== token) return; // race 保護：區間已被改掉就放棄
      if (!content) continue;
      coverage++;
      const parsed = this._parseJournalMd(content);
      if (parsed.done.length) byDay.push({ date, label: this._weekdayLabel(date), items: parsed.done });
      parsed.pdca.forEach(t => pdca.push({ date, ...t }));
    }
    if (this._aggToken !== token) return;

    this._weeklyDone = byDay;
    this._weeklyPdca = pdca;
    this._renderAggregation(byDay, pdca, coverage, dates.length);
  },
```

- [ ] **Step 2: 新增 `_renderAggregation`**

```js
  _renderAggregation(byDay, pdca, coverage, totalDays) {
    const doneEl = document.getElementById('wk-done');
    const pdcaEl = document.getElementById('wk-pdca');
    const totalItems = byDay.reduce((n, d) => n + d.items.length, 0);

    doneEl.innerHTML = `
      <div class="wk-agg-meta">共 ${totalItems} 項・本週 ${coverage}/${totalDays} 天有日誌</div>
      ${byDay.length ? byDay.map(d => `
        <div class="wk-day-block">
          <div class="wk-day-head">${d.date}（週${d.label}）</div>
          ${d.items.map(i => `<div class="jv-item">${this._esc(i)}</div>`).join('')}
        </div>`).join('') : '<div class="jv-empty">（無）</div>'}`;

    pdcaEl.innerHTML = pdca.length ? pdca.map(t => `
      <div class="jv-pdca-block">
        <div class="jv-pdca-title">${this._esc(t.title)}（${t.date}）</div>
        ${['plan','do','check','act'].map(k => t[k] ? `
          <div class="pdca-field-row"><label>${k.charAt(0).toUpperCase()+k.slice(1)}</label><div class="jv-pdca-val">${this._esc(t[k])}</div></div>` : '').join('')}
      </div>`).join('') : '<div class="jv-empty">（無 PDCA 記錄）</div>';
  },
```

- [ ] **Step 3: 語法檢查**

Run: `node --check components/review.js`
Expected: 通過

- [ ] **Step 4: 瀏覽器煙霧測試（stub getRaw 餵假日誌）**

reload 後 `preview_eval`：
```js
(async () => {
  const orig = GitHubAPI.getRaw;
  GitHubAPI.getRaw = async (pat, repo, path) => {
    if (path.endsWith('2026-06-03.md')) return { content: '# 2026-06-03 工作日誌\n\n## 今日完成\n- [x] 整理 iOS QA (30m)\n\n## PDCA 覆盤\n\n### 挖看發文限制\n**Plan**：查規則\n**Do**：讀文件\n', sha: 'x' };
    return { content: null, sha: null };
  };
  Review.show();
  await new Promise(r => setTimeout(r, 600));
  const out = {
    doneHtml: document.getElementById('wk-done').innerHTML.includes('整理 iOS QA'),
    metaShown: document.getElementById('wk-done').innerHTML.includes('天有日誌'),
    pdcaShown: document.getElementById('wk-pdca').innerHTML.includes('挖看發文限制'),
    weeklyDoneLen: Review._weeklyDone.length,
    weeklyPdcaLen: Review._weeklyPdca.length
  };
  GitHubAPI.getRaw = orig;
  Review.hide();
  return out;
})()
```
Expected: `doneHtml:true`、`metaShown:true`、`pdcaShown:true`、`weeklyDoneLen>=1`、`weeklyPdcaLen>=1`。console 無 error。

- [ ] **Step 5: Commit**

```bash
git add components/review.js
git commit -m "feat(v1.8.0): 週覆盤區間彙整完成總覽與 PDCA"
```

---

## Task 3: 組 markdown + 上傳（含 v1.6.0 防覆蓋）

**Files:**
- Modify: `components/review.js`（`_weeklyToMarkdown`、`_uploadWeekly` 實作）

- [ ] **Step 1: 新增 `_weeklyToMarkdown`**

```js
  _weeklyToMarkdown() {
    const start = this._weeklyStart, end = this._weeklyEnd;
    const byDay = this._weeklyDone || [];
    const pdca  = this._weeklyPdca || [];
    const reflection = document.getElementById('wk-reflection').value.trim();
    const nextweek = document.getElementById('wk-nextweek').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    const totalItems = byDay.reduce((n, d) => n + d.items.length, 0);

    let md = `# ${start} ~ ${end} 週覆盤\n\n`;
    md += `## 本週完成總覽（共 ${totalItems} 項）\n`;
    if (byDay.length) {
      byDay.forEach(d => {
        md += `### ${d.date}（週${d.label}）\n`;
        d.items.forEach(i => { md += `- [x] ${i}\n`; });
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
```

- [ ] **Step 2: 用實作取代 `_uploadWeekly` 空殼**

```js
  async _uploadWeekly() {
    const start = this._weeklyStart, end = this._weeklyEnd;
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
```

- [ ] **Step 3: 語法檢查**

Run: `node --check components/review.js`
Expected: 通過

- [ ] **Step 4: 瀏覽器煙霧測試（stub 驗證 markdown + 防覆蓋）**

reload 後 `preview_eval`，先驗 markdown 結構，再驗「已存在 → confirm」：
```js
(async () => {
  // 準備假彙整資料
  Review._weeklyStart = '2026-06-01';
  Review._weeklyEnd   = '2026-06-04';
  Review._weeklyDone  = [{ date:'2026-06-03', label:'三', items:['整理 iOS QA (30m)'] }];
  Review._weeklyPdca  = [{ date:'2026-06-03', title:'挖看發文限制', plan:'查規則', do:'讀文件', check:'', act:'' }];
  document.getElementById('wk-reflection').value = '本週節奏偏慢';
  document.getElementById('wk-nextweek').value = '建立飛輪\n埋點確認';
  const md = Review._weeklyToMarkdown();

  // 驗防覆蓋：stub getRaw 回傳已存在 sha、攔截 confirm 回傳 false（取消）
  const origGet = GitHubAPI.getRaw, origPut = GitHubAPI.putRaw, origConfirm = window.confirm;
  GitHubAPI.getRaw = async () => ({ content:'old', sha:'exists123' });
  let putCalled = false;
  GitHubAPI.putRaw = async () => { putCalled = true; return 'newsha'; };
  window.confirm = () => false; // 使用者按取消
  await Review._uploadWeekly();
  GitHubAPI.getRaw = origGet; GitHubAPI.putRaw = origPut; window.confirm = origConfirm;

  return {
    mdHasTitle: md.includes('# 2026-06-01 ~ 2026-06-04 週覆盤'),
    mdHasDone: md.includes('### 2026-06-03（週三）') && md.includes('- [x] 整理 iOS QA (30m)'),
    mdHasPdca: md.includes('## PDCA 彙總') && md.includes('**Plan**：查規則'),
    mdHasReflection: md.includes('## 本週反思\n本週節奏偏慢'),
    mdHasNextweek: md.includes('## 下週重點') && md.includes('- [ ] 建立飛輪'),
    cancelledSoNoPut: putCalled === false
  };
})()
```
Expected: 全部 `true`，`cancelledSoNoPut:true`（已存在且使用者取消 → 沒呼叫 putRaw）。console 無 error。

- [ ] **Step 5: Commit**

```bash
git add components/review.js
git commit -m "feat(v1.8.0): 週覆盤組 markdown 與雙推上傳（含已存在防覆蓋）"
```

---

## Task 4: CSS 清理 + 週覆盤樣式

**Files:**
- Modify: `style.css`

- [ ] **Step 1: 找出單篇日誌瀏覽器的死樣式**

Run（用 Grep 工具或）: `rg -n "\.journal-item|\.journal-list|\.journal-list-panel|\.journal-view|\.jv-header|\.jv-mode-btn|\.jv-edit-actions|\.jv-upload-btn|\.jv-body|\.jv-list|\.journal-md-edit|reading-mode" style.css`
先 Read 這些行所在區塊，確認範圍。

- [ ] **Step 2: 移除死樣式，保留彙整仍要用的**

刪除：`.journal-item`、`.journal-list`、`.journal-list-panel`、`.journal-view`、`.jv-header`、`.jv-mode-btn`、`.jv-edit-actions`、`.jv-upload-btn`、`.jv-body`、`.jv-list`、`.journal-md-edit`、以及 `.review-modal-box.reading-mode`（及其衍生）相關規則。
**務必保留**（週覆盤彙整渲染會用到）：`.jv-item`、`.jv-empty`、`.jv-pdca-block`、`.jv-pdca-title`、`.jv-pdca-val`、`.pdca-field-row`。

- [ ] **Step 3: 新增週覆盤樣式**

在 style.css「Journal editor date picker」區塊附近加入：
```css
/* ── 週覆盤 ── */
.weekly-box .modal-header { gap: 8px; }
.weekly-box .modal-header .btn-icon { margin-left: auto; }
.weekly-range { display: flex; align-items: center; gap: 6px; }
.weekly-range-sep { color: var(--text-muted); font-size: 12px; }
.wk-agg {
  max-height: 200px; overflow-y: auto;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 8px; padding: 8px 10px;
}
.wk-agg-meta { font-size: 11px; color: var(--text-muted); margin-bottom: 6px; }
.wk-day-block { margin-bottom: 8px; }
.wk-day-head { font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 3px; }
```

- [ ] **Step 4: 瀏覽器視覺檢查**

reload 後 `preview_eval` 打開週覆盤，確認版面無破圖、日期區間在標頭、彙整區可捲動、無 console error。確認被刪樣式無殘留參考：
```js
(() => {
  Review.show();
  const r = {
    rangeVisible: !!document.querySelector('.weekly-range'),
    aggBoxes: document.querySelectorAll('.wk-agg').length
  };
  Review.hide();
  return r;
})()
```
Expected: `rangeVisible:true`、`aggBoxes:2`。

- [ ] **Step 5: Commit**

```bash
git add style.css
git commit -m "style(v1.8.0): 移除單篇日誌瀏覽器死樣式，加週覆盤樣式"
```

---

## Task 5: 版本 bump v1.8.0

**Files:**
- Modify: `app.js`、`chrome-extension/manifest.json`、`CHANGELOG.md`

- [ ] **Step 1: `app.js` 第 2 行**

```js
const APP_VERSION = 'v1.8.0';
```

- [ ] **Step 2: `chrome-extension/manifest.json`**

```json
  "version": "1.8.0",
```

- [ ] **Step 3: `CHANGELOG.md` 最上方新增區塊**

```markdown
## v1.8.0 — 2026-06-04
- feat: 「覆盤」改造為「週覆盤」——可自選起訖日期（預設本週一～今天），自動彙整區間內每天日誌的完成項目與 PDCA，並引導填寫本週反思與下週重點（下週重點預帶目前待辦）
- feat: 週覆盤產出 markdown 雙推 GitHub 主倉 taskflow/weekly/ 與 Obsidian {資料夾}/週報/，沿用 v1.6.0 已存在防覆蓋確認；不刪任何任務
- remove: 移除舊「覆盤」單篇日誌瀏覽/編輯功能（與直接看 Obsidian vault 重疊）
```

- [ ] **Step 4: 語法/JSON 檢查**

Run: `node --check app.js && node -e "JSON.parse(require('fs').readFileSync('chrome-extension/manifest.json','utf8'))"`
Expected: 通過

- [ ] **Step 5: Commit**

```bash
git add app.js chrome-extension/manifest.json CHANGELOG.md
git commit -m "chore(v1.8.0): bump version for 週覆盤"
```

---

## Self-Review（plan vs spec）

- **Spec 區塊覆蓋**：按鈕改造(T1) / 編輯器版面(T1) / 日期區間預設本週(T1) / 完成總覽彙整(T2) / PDCA 彙總(T2) / 反思+下週重點 textarea(T1) / 下週重點預帶待辦(T1 `_prefillNextWeek`) / markdown 組裝(T3) / 雙推 + 週報子資料夾(T3) / 防覆蓋(T3) / 不刪任務(T3，無 deleteTask) / 邊界：未設 GitHub(T2)、缺日誌略過+覆蓋率(T2)、race 保護(T2)、Obsidian 失敗/未設 toast(T3) / CSS 清理(T4) / 版本(T5)。全部有對應 task。
- **Placeholder 掃描**：Task 1 的 `_aggregateRange`/`_uploadWeekly` 空殼於 Task 2/3 明確替換，非遺留 placeholder；其餘步驟皆含完整程式碼。
- **型別/命名一致**：`_weeklyStart`/`_weeklyEnd`/`_weeklyDone`/`_weeklyPdca`/`_aggToken`/`_wkStartPicker`/`_wkEndPicker` 全程一致；元素 id `wk-start`/`wk-end`/`wk-done`/`wk-pdca`/`wk-reflection`/`wk-nextweek`/`btn-weekly-upload`/`btn-weekly-cancel` 在 HTML 與 JS 兩邊吻合；`_parseJournalMd` 回傳 `{done,todo,pdca,notes}` 與 T2 使用方式一致。

## 驗證（end-to-end，完成全部 task 後）

1. 點「週覆盤」→ 開窗、區間預設本週一～今天、下週重點已帶入目前待辦。
2. 完成總覽/PDCA 正確彙整、覆蓋率正確；改區間會重新彙整。
3. 上傳：已存在週報 → 跳防覆蓋確認；取消不上傳、確認才覆蓋。
4. 主倉 `taskflow/weekly/` 與 Obsidian `…/週報/` 都產出檔，看板任務未被刪。
5. 版本三處 = 1.8.0。
