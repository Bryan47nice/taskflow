# 卡片 + 近 5 天日誌搜尋（Command Palette）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一個指令面板式搜尋（Ctrl+F / 放大鏡開啟），同時搜尋目前看板所有卡片的全欄位內容與近 5 天日誌全文，結果分組顯示、命中高亮。

**Architecture:** 新元件 `components/search.js`（物件式，沿用 Review/Triage 風格）。卡片搜尋對 `App.tasks` 本地即時過濾；近 5 天日誌在開啟面板時用 `GitHubAPI.getRaw` 預載快取，之後本地過濾。重用 `PDCA.show(task)` 開卡片編輯器、`.task-card[data-id]` 做看板高亮。

**Tech Stack:** Vanilla JS、GitHub Contents API（`lib/github-api.js`）。無 build、無測試框架。

**驗證方式：** 每 task 用 `node --check` 語法檢查 + `localhost:3456` preview `preview_eval` 行為煙霧測試（stub 網路呼叫，不寫真實 GitHub）。

**設計來源：** `docs/superpowers/specs/2026-06-04-card-journal-search-design.md`

---

## File Structure

| 檔案 | 改動 |
|---|---|
| `components/search.js` | **新增**：Search 元件（open/close、預載日誌、搜尋、渲染、點擊行為、Ctrl+F） |
| `index.html` | 頂列加 `#btn-search`、加 `#modal-search` overlay、加 `<script src="components/search.js">` |
| `style.css` | 指令面板樣式 + 命中 `<mark>` + 看板卡片閃光 |
| `app.js` | init 加 `Search.init()`；`+` 快捷鍵 modal 清單加 `'modal-search'` |
| `app.js`/`CHANGELOG.md`/`chrome-extension/manifest.json` | 版本 v1.9.0 |
| `.gitignore` | 加 `.superpowers/`（brainstorm 暫存不進版控） |

---

## Task 1: 面板骨架 + 開關 + Ctrl+F + 完整渲染框架

本 task 建立可開關的空面板與完整 `_render`（含分組/狀態框架），資料函式先用空殼，app 可正常載入與開關面板。

**Files:**
- Create: `components/search.js`
- Modify: `index.html`、`app.js`

- [ ] **Step 1: 建立 `components/search.js`（骨架 + 完整渲染 + 渲染輔助）**

```js
// === Search — 指令面板：搜尋目前卡片 + 近 5 天日誌 ===
const Search = {
  _journals: [],          // [{date, label, content}]
  _journalState: 'idle',  // 'idle'|'loading'|'loaded'|'error'|'no-conn'
  _expanded: {},          // {date: true}
  _loadToken: 0,

  open() {
    document.getElementById('modal-search').classList.remove('hidden');
    const input = document.getElementById('search-input');
    input.value = '';
    input.focus();
    this._expanded = {};
    this._journalState = 'idle';
    this._render();
    this._loadJournals();
  },

  close() { document.getElementById('modal-search').classList.add('hidden'); },

  isOpen() { return !document.getElementById('modal-search').classList.contains('hidden'); },

  _onInput() { this._render(); },

  _query() { return (document.getElementById('search-input').value || '').trim(); },

  // ── 渲染（最終版，後續 task 只填資料函式）──
  _render() {
    const q = this._query();
    const el = document.getElementById('search-results');
    if (!q) {
      const hint = this._journalState === 'loaded' ? '已預載近 5 天日誌 ✓'
        : this._journalState === 'loading' ? '載入近 5 天日誌中…'
        : this._journalState === 'no-conn' ? '未連線 GitHub，僅搜尋目前卡片'
        : this._journalState === 'error' ? '日誌載入失敗' : '';
      el.innerHTML = `<div class="search-empty">輸入關鍵字搜尋目前卡片與近 5 天日誌${hint ? `<div class="search-hint">${hint}</div>` : ''}</div>`;
      return;
    }
    const cards = this._searchCards(q);
    const journals = this._journalState === 'loaded' ? this._searchJournals(q) : [];

    if (cards.length === 0 && this._journalState === 'loaded' && journals.length === 0) {
      el.innerHTML = `<div class="search-empty">找不到符合「${this._esc(q)}」的結果</div>`;
      return;
    }

    let html = `<div class="search-group">目前卡片 · ${cards.length}</div>`;
    html += cards.length
      ? cards.map(c => `
          <div class="search-row" data-kind="card" data-id="${this._esc(c.task.id)}">
            <div class="search-row-title">${this._hl(c.task.title, q)}</div>
            ${c.snippet ? `<div class="search-row-sub">${this._esc(c.snippet.label)}：${this._hl(this._clip(c.snippet.val, q), q)}</div>` : ''}
          </div>`).join('')
      : `<div class="search-none">無符合卡片</div>`;

    html += `<div class="search-group">近 5 天日誌${this._journalState === 'loaded' ? ` · ${journals.length}` : ''}</div>`;
    if (this._journalState === 'loading') {
      html += `<div class="search-status">⏳ 載入日誌中…</div>`;
    } else if (this._journalState === 'no-conn') {
      html += `<div class="search-status warn">⚠ 未連線 GitHub，無法搜尋日誌</div>`;
    } else if (this._journalState === 'error') {
      html += `<div class="search-status warn">日誌載入失敗</div>`;
    } else if (journals.length) {
      html += journals.map(j => `
        <div class="search-row" data-kind="journal" data-date="${j.date}">
          <div class="search-row-title">${j.date}（週${j.label}）<span class="search-expand">${this._expanded[j.date] ? '▾ 收合' : '▸ 展開'}</span></div>
          <div class="search-row-sub">${this._hl(j.lines[0], q)}</div>
          ${this._expanded[j.date] ? `<div class="search-context">${this._contextHtml(j.content, q)}</div>` : ''}
        </div>`).join('');
    } else {
      html += `<div class="search-none">無符合日誌</div>`;
    }

    el.innerHTML = html;
    el.querySelectorAll('.search-row[data-kind="card"]').forEach(row =>
      row.addEventListener('click', () => this._openCard(row.dataset.id)));
    el.querySelectorAll('.search-row[data-kind="journal"]').forEach(row =>
      row.addEventListener('click', () => { const d = row.dataset.date; this._expanded[d] = !this._expanded[d]; this._render(); }));
  },

  // ── 資料函式：Task 2/3 補實作，先給空殼 ──
  _searchCards(q) { return []; },
  _searchJournals(q) { return []; },
  async _loadJournals() { this._journalState = 'loaded'; this._journals = []; this._render(); },
  _openCard(id) { /* Task 2 */ },

  // ── 渲染輔助 ──
  _recentDates(n) {
    const out = [];
    const base = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(base); d.setDate(base.getDate() - i);
      out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    }
    return out;
  },
  _weekdayLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return ['日','一','二','三','四','五','六'][d.getDay()];
  },
  _clip(val, q) {
    const s = String(val); const i = s.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return s.slice(0, 60);
    const start = Math.max(0, i - 20);
    return (start > 0 ? '…' : '') + s.slice(start, i + q.length + 40) + (i + q.length + 40 < s.length ? '…' : '');
  },
  _contextHtml(content, q) { return this._hl(content, q).replace(/\n/g, '<br>'); },
  _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
  _hl(raw, q) {
    const safe = this._esc(raw);
    if (!q) return safe;
    const qEsc = this._esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(qEsc, 'gi'), m => `<mark>${m}</mark>`);
  },

  init() {
    document.getElementById('btn-search').addEventListener('click', () => this.open());
    document.getElementById('search-input').addEventListener('input', () => this._onInput());
    document.getElementById('modal-search').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-search')) this.close();
    });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        this.open();
        return;
      }
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });
  }
};
```

- [ ] **Step 2: index.html — 頂列加放大鏡按鈕**

在 `header-right` 內、`<!-- 產日誌 -->` 的 `<button ... id="btn-journal">` 之前插入：
```html
    <!-- 搜尋 -->
    <button class="btn-icon" id="btn-search" title="搜尋（Ctrl+F）">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    </button>
```

- [ ] **Step 3: index.html — 加搜尋面板 overlay**

在 `<!-- ── Toast ── -->` 區塊之前（或任一 modal 區塊旁）插入：
```html
<!-- ======================================== -->
<!-- Modal: Search (command palette)          -->
<!-- ======================================== -->
<div id="modal-search" class="modal hidden">
  <div class="search-box">
    <div class="search-input-row">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="search-input" placeholder="搜尋卡片與近 5 天日誌…" autocomplete="off" spellcheck="false">
      <span class="search-esc">Esc</span>
    </div>
    <div id="search-results" class="search-results"></div>
  </div>
</div>
```

- [ ] **Step 4: index.html — 載入 search.js**

在 `<script src="components/reminder.js"></script>` 之後、`<script src="app.js"></script>` 之前插入：
```html
<script src="components/search.js"></script>
```

- [ ] **Step 5: app.js — init 接線 + `+` 快捷鍵避讓**

在 `app.js` init 的元件初始化序列（`Reminder.init()` 或 `MobileNav.init()` 附近）加：
```js
    Search.init();
```
並在 `_initKeyboardShortcuts` 的 modals 清單加入 `'modal-search'`，即把：
```js
    const modals = ['modal-triage', 'modal-pdca', 'modal-review',
                    'modal-journal-editor', 'modal-settings'];
```
改為：
```js
    const modals = ['modal-triage', 'modal-pdca', 'modal-review',
                    'modal-journal-editor', 'modal-settings', 'modal-search'];
```

- [ ] **Step 6: 語法檢查**

Run: `node --check components/search.js`
Expected: 無輸出（通過）

- [ ] **Step 7: 瀏覽器煙霧測試**

`preview_start`（name `taskflow-preview`）後 reload，`preview_eval`：
```js
(() => {
  Search.open();
  const open = !document.getElementById('modal-search').classList.contains('hidden');
  const emptyText = document.getElementById('search-results').textContent;
  Search.close();
  const closed = document.getElementById('modal-search').classList.contains('hidden');
  return { open, hasInput: !!document.getElementById('search-input'), emptyText: emptyText.slice(0, 20), closed };
})()
```
Expected: `open:true`、`hasInput:true`、`emptyText` 含「輸入關鍵字」、`closed:true`。`preview_console_logs` level error 為空。

- [ ] **Step 8: Commit**

```bash
git add components/search.js index.html app.js
git commit -m "feat(v1.9.0): 搜尋指令面板骨架 + Ctrl+F 開關"
```

---

## Task 2: 卡片全欄位搜尋 + 點擊開卡片 + 看板高亮

**Files:**
- Modify: `components/search.js`（`_searchCards`、`_openCard`）

- [ ] **Step 1: 實作 `_searchCards`（取代空殼）**

```js
  _searchCards(q) {
    const ql = q.toLowerCase();
    const out = [];
    for (const t of (App.tasks || [])) {
      const fields = [];
      if (t.title) fields.push(['標題', t.title]);
      if (t.body) fields.push(['內文', t.body]);
      if (t.pdca) ['plan','do','check','act'].forEach(k => { if (t.pdca[k]) fields.push(['PDCA', t.pdca[k]]); });
      if (t.source && t.source.snippet) fields.push(['來源', t.source.snippet]);
      if (Array.isArray(t.links)) t.links.forEach(l => {
        const s = typeof l === 'string' ? l : (l && (l.name || l.url)) || '';
        if (s) fields.push(['連結', s]);
      });
      let titleHit = false, snippet = null;
      for (const [label, val] of fields) {
        if (String(val).toLowerCase().includes(ql)) {
          if (label === '標題') titleHit = true;
          else if (!snippet) snippet = { label, val: String(val) };
        }
      }
      if (titleHit || snippet) out.push({ task: t, snippet });
    }
    return out;
  },
```

- [ ] **Step 2: 實作 `_openCard`（取代空殼）**

```js
  _openCard(id) {
    const task = (App.tasks || []).find(t => t.id === id);
    if (!task) return;
    this.close();
    if (typeof PDCA !== 'undefined') PDCA.show(task);
    const card = document.querySelector(`.task-card[data-id="${id}"]`);
    if (card) {
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      card.classList.add('search-flash');
      setTimeout(() => card.classList.remove('search-flash'), 1500);
    }
  },
```

- [ ] **Step 3: 語法檢查**

Run: `node --check components/search.js`
Expected: 通過

- [ ] **Step 4: 瀏覽器煙霧測試（注入假任務驗證全欄位搜尋）**

reload 後 `preview_eval`：
```js
(() => {
  App.tasks = [
    { id:'t1', title:'建立飛輪', body:'盤點現有飛輪缺口', status:'todo', pdca:{} },
    { id:'t2', title:'優化儀表板', body:'', status:'done', pdca:{ plan:'建立成長飛輪追蹤' } },
    { id:'t3', title:'無關卡片', body:'其他', status:'todo', pdca:{} }
  ];
  Search.open();
  document.getElementById('search-input').value = '飛輪';
  Search._onInput();
  const html = document.getElementById('search-results').innerHTML;
  const r = {
    cardGroupCount: (document.querySelector('.search-group')||{}).textContent,
    matchedTitle: html.includes('建立<mark>飛輪</mark>'),
    matchedViaPDCA: html.includes('優化儀表板'),
    excludedUnrelated: !html.includes('無關卡片'),
    rows: document.querySelectorAll('.search-row[data-kind="card"]').length
  };
  Search.close();
  return r;
})()
```
Expected: `matchedTitle:true`、`matchedViaPDCA:true`（內文/PDCA 命中也算）、`excludedUnrelated:true`、`rows:2`、`cardGroupCount` 含「目前卡片 · 2」。console 無 error。

- [ ] **Step 5: Commit**

```bash
git add components/search.js
git commit -m "feat(v1.9.0): 卡片全欄位搜尋 + 點擊開編輯器與看板高亮"
```

---

## Task 3: 近 5 天日誌預載 + 搜尋 + 狀態 + 展開

**Files:**
- Modify: `components/search.js`（`_loadJournals`、`_searchJournals`）

- [ ] **Step 1: 實作 `_loadJournals`（取代空殼，預載 + 狀態 + race 保護）**

```js
  async _loadJournals() {
    const { pat, repo } = App.settings;
    if (!pat || !repo) { this._journalState = 'no-conn'; this._journals = []; this._render(); return; }
    this._journalState = 'loading';
    this._journals = [];
    this._render();
    const token = ++this._loadToken;
    const dates = this._recentDates(5);
    const out = [];
    try {
      for (const date of dates) {
        const res = await GitHubAPI.getRaw(pat, repo, `taskflow/journal/${date}.md`);
        if (token !== this._loadToken) return; // 已被新的 open 取代
        if (res.content) out.push({ date, label: this._weekdayLabel(date), content: res.content });
      }
      if (token !== this._loadToken) return;
      this._journals = out;
      this._journalState = 'loaded';
    } catch (_) {
      if (token !== this._loadToken) return;
      this._journalState = 'error';
    }
    this._render();
  },
```

- [ ] **Step 2: 實作 `_searchJournals`（取代空殼）**

```js
  _searchJournals(q) {
    const ql = q.toLowerCase();
    const out = [];
    for (const j of this._journals) {
      const lines = j.content.split('\n').filter(l => l.trim() && l.toLowerCase().includes(ql));
      if (lines.length) out.push({ date: j.date, label: j.label, lines, content: j.content });
    }
    return out;
  },
```

- [ ] **Step 3: 語法檢查**

Run: `node --check components/search.js`
Expected: 通過

- [ ] **Step 4: 瀏覽器煙霧測試（stub getRaw 餵近 5 天日誌 + 驗狀態/展開）**

reload 後 `preview_eval`：
```js
(async () => {
  const orig = GitHubAPI.getRaw;
  GitHubAPI.getRaw = async (pat, repo, path) => {
    if (path.endsWith('.md') && path.includes('journal/')) {
      // 只讓「今天」那篇有內容，其餘 404
      const today = App.getTodayKey();
      if (path.endsWith(`${today}.md`)) return { content:`# ${today} 工作日誌\n\n## 今日完成\n- [x] 建立飛輪 (2h)\n\n## PDCA 覆盤\n### 飛輪設計\n**Plan**：盤點缺口\n`, sha:'x' };
    }
    return { content:null, sha:null };
  };
  App.settings = Object.assign({}, App.settings, { pat:'p', repo:'r' });
  Search.open();
  await new Promise(r => setTimeout(r, 600));
  document.getElementById('search-input').value = '飛輪';
  Search._onInput();
  const html1 = document.getElementById('search-results').innerHTML;
  const journalRow = document.querySelector('.search-row[data-kind="journal"]');
  const dateAttr = journalRow ? journalRow.dataset.date : null;
  // 點展開
  if (journalRow) journalRow.click();
  const html2 = document.getElementById('search-results').innerHTML;
  GitHubAPI.getRaw = orig;
  Search.close();
  return {
    state: Search._journalState,
    journalMatched: html1.includes('建立<mark>飛輪</mark>') || html1.includes('飛輪'),
    journalRowShown: !!journalRow,
    expandedContext: html2.includes('search-context') && html2.includes('PDCA'),
  };
})()
```
Expected: `state:'loaded'`、`journalRowShown:true`、`journalMatched:true`、`expandedContext:true`（點擊後展開顯示上下文）。console 無 error。

- [ ] **Step 5: 未連線狀態驗證**

reload 後 `preview_eval`：
```js
(async () => {
  const savedPat = App.settings.pat, savedRepo = App.settings.repo;
  App.settings = Object.assign({}, App.settings, { pat:'', repo:'' });
  Search.open();
  await new Promise(r => setTimeout(r, 100));
  document.getElementById('search-input').value = 'x';
  Search._onInput();
  const html = document.getElementById('search-results').innerHTML;
  App.settings = Object.assign({}, App.settings, { pat:savedPat, repo:savedRepo });
  Search.close();
  return { state: Search._journalState, noConnShown: html.includes('未連線 GitHub') };
})()
```
Expected: `state:'no-conn'`、`noConnShown:true`。

- [ ] **Step 6: Commit**

```bash
git add components/search.js
git commit -m "feat(v1.9.0): 近 5 天日誌預載搜尋 + 狀態與展開上下文"
```

---

## Task 4: 指令面板樣式

**Files:**
- Modify: `style.css`

- [ ] **Step 1: 加搜尋面板樣式**

在 style.css 末尾（或任一 modal 樣式區塊後）加入：
```css
/* ── Search command palette ── */
#modal-search { align-items: flex-start; }
.search-box {
  width: 92vw; max-width: 560px; margin-top: 10vh;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,.4);
  display: flex; flex-direction: column; max-height: 70vh;
}
.search-input-row { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
.search-input-row svg { color: var(--text-muted); flex-shrink: 0; }
#search-input { flex: 1; border: none; background: transparent; color: var(--text); font-size: 15px; font-family: var(--font-body); outline: none; }
.search-esc { font-size: 11px; color: var(--text-muted); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; flex-shrink: 0; }
.search-results { overflow-y: auto; padding: 8px; }
.search-empty { text-align: center; color: var(--text-muted); font-size: 13px; padding: 28px 12px; }
.search-hint { font-size: 11px; opacity: .7; margin-top: 6px; }
.search-group { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; padding: 10px 8px 4px; }
.search-row { padding: 8px 10px; border-radius: 8px; cursor: pointer; }
.search-row:hover { background: var(--surface2); }
.search-row-title { font-size: 13px; color: var(--text); display: flex; align-items: center; gap: 6px; }
.search-row-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; word-break: break-word; }
.search-expand { font-size: 11px; color: var(--primary); margin-left: auto; flex-shrink: 0; }
.search-context { font-size: 12px; line-height: 1.7; color: var(--text); background: var(--bg); border-left: 2px solid var(--primary); padding: 8px 10px; margin-top: 6px; border-radius: 4px; }
.search-none, .search-status { font-size: 12px; color: var(--text-muted); padding: 4px 10px 8px; }
.search-status.warn { color: var(--high); }
.search-results mark { background: var(--primary); color: var(--surface); padding: 0 2px; border-radius: 2px; }
/* 看板卡片命中閃光 */
.task-card.search-flash { animation: searchFlash 1.5s ease; }
@keyframes searchFlash { 0%,100% { box-shadow: none; } 25%,65% { box-shadow: 0 0 0 2px var(--primary); } }
```

- [ ] **Step 2: 視覺煙霧測試**

reload 後 `preview_eval`：
```js
(() => {
  Search.open();
  const box = document.querySelector('.search-box');
  const cs = box ? getComputedStyle(box) : {};
  const modalCs = getComputedStyle(document.getElementById('modal-search'));
  const r = { boxExists: !!box, maxW: cs.maxWidth, topAligned: modalCs.alignItems };
  Search.close();
  return r;
})()
```
Expected: `boxExists:true`、`maxW:"560px"`、`topAligned:"flex-start"`。console 無 error。

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style(v1.9.0): 搜尋指令面板樣式 + 看板命中閃光"
```

---

## Task 5: 版本 v1.9.0 + .gitignore

**Files:**
- Modify: `app.js`、`chrome-extension/manifest.json`、`CHANGELOG.md`、`.gitignore`

- [ ] **Step 1: `app.js` 第 2 行**

```js
const APP_VERSION = 'v1.9.0';
```

- [ ] **Step 2: `chrome-extension/manifest.json`**

```json
  "version": "1.9.0",
```

- [ ] **Step 3: `CHANGELOG.md` 最上方新增區塊**

```markdown
## v1.9.0 — 2026-06-04
- feat: 新增搜尋指令面板（頂列放大鏡 / Ctrl+F 開啟，Esc 關閉）。可搜尋目前看板所有卡片的全欄位（標題、內文、PDCA、來源摘要、連結），命中即時高亮
- feat: 同步搜尋近 5 天日誌全文（開啟面板時預載快取）；結果分組顯示，點日誌結果可就地展開該天上下文；點卡片結果開啟編輯器並在看板高亮定位
```

- [ ] **Step 4: `.gitignore` 加入 brainstorm 暫存**

若 `.gitignore` 不存在則建立；加入一行：
```
.superpowers/
```

- [ ] **Step 5: 檢查 + Commit**

```bash
node --check app.js && node -e "JSON.parse(require('fs').readFileSync('chrome-extension/manifest.json','utf8'))"
git add app.js chrome-extension/manifest.json CHANGELOG.md .gitignore
git commit -m "chore(v1.9.0): bump version + ignore .superpowers"
```

---

## Self-Review（plan vs spec）

- **Spec 覆蓋**：UI 形式 overlay(T1) / Ctrl+F+Esc+背景(T1) / 放大鏡 icon(T1) / 卡片全欄位搜尋(T2) / 命中高亮(T1 `_hl`) / 近 5 天預載+快取+本地過濾(T3) / 6 狀態：空(T1)、loading(T3)、results(T1渲染)、no-result(T1)、no-conn(T3)、error(T3)、expand(T1+T3) / 點卡片開編輯器+看板高亮(T2) / 點日誌展開(T1 toggle + T3 內容) / `+` 快捷鍵避讓(T1) / 樣式(T4) / 版本(T5)。全部有對應。
- **Placeholder 掃描**：T1 的 `_searchCards`/`_searchJournals`/`_loadJournals`/`_openCard` 空殼於 T2/T3 明確替換，非遺留；其餘步驟皆含完整程式碼。
- **命名/型別一致**：`_journals`/`_journalState`('idle'|'loading'|'loaded'|'error'|'no-conn')/`_expanded`/`_loadToken` 全程一致；元素 id `modal-search`/`search-input`/`search-results`/`btn-search` 在 HTML 與 JS 兩邊吻合；`_searchCards` 回傳 `{task, snippet:{label,val}}`、`_searchJournals` 回傳 `{date,label,lines,content}` 與 `_render` 使用一致；`_hl(raw,q)` 一律吃原始字串（呼叫端不預先 escape，避免雙重轉義）；`PDCA.show(task)` 與 kanban 既有開卡一致。

## 驗證（end-to-end，完成全部 task 後）

1. Ctrl+F / 放大鏡開面板（覆寫瀏覽器 find）；Esc / 背景關閉。
2. 打字即時過濾卡片，title 與 body/PDCA/source/links 命中都搜得到並高亮；點卡片 → 開編輯器 + 看板閃光。
3. 近 5 天日誌（真實設定）出現分組結果；點日誌 → 展開上下文。
4. 狀態：未連線 → 日誌組顯示未連線；查無結果文案；載入中狀態。
5. 版本三處 = 1.9.0；`.superpowers/` 已忽略。
