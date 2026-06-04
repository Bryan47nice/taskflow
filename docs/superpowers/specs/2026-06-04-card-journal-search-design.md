# 卡片 + 近 5 天日誌搜尋（Command Palette）設計文件

- 日期：2026-06-04
- 目標版本：v1.9.0
- 狀態：設計待使用者確認

## Context（為什麼做）

使用者想在 app 內快速查「最近做過哪些事」，懶得開 Obsidian 翻。目前完全沒有搜尋功能。需求分兩段：

1. **搜尋目前頁面的每張卡片** —— 不只標題，**內文也要搜**。
2. **搜尋近 5 天的日誌** —— 因為完成的任務上傳日誌後會被刪除，過去的「單」只存在於日誌 `.md`，所以這段等同搜尋近 5 天的日誌全文。需考慮 UI。

使用者已指定：頂列加一個放大鏡 icon、不同情境的 UI state、Ctrl+F 快捷鍵。

## 需求摘要（已與使用者確認）

| 項目 | 決定 |
|---|---|
| UI 形式 | **指令面板 Overlay**（置中浮層，Cmd-K 風格） |
| 開啟方式 | 頂列放大鏡 icon + **Ctrl/Cmd+F**（覆寫瀏覽器原生 find）；Esc / 點背景關閉 |
| 卡片可搜欄位 | title、body、pdca(plan/do/check/act)、source.snippet、links（全欄位） |
| 日誌範圍 | 今天 + 前 4 天 = 共 5 個日曆天，搜每天日誌 `.md` **全文** |
| 日誌載入 | 開啟面板時一次抓回 5 天日誌並快取，之後打字本地過濾（即時、不卡網路） |
| 結果呈現 | 分兩組：「目前卡片 · N」「近 5 天日誌 · N」，命中字 `<mark>` 高亮 |
| 點卡片結果 | 關面板 → 開該卡片編輯器（同看板點卡）；看板該卡閃高亮定位 |
| 點日誌結果 | 面板內就地展開該天相關段落（唯讀），再點收合 |

## UI 狀態（6 種，已確認）

1. **剛開啟（空查詢）**：提示「搜尋卡片與近 5 天日誌…」+「已預載近 5 天日誌 ✓」。
2. **日誌載入中**：卡片結果先出；日誌組顯示「⏳ 載入日誌中…」，載完重繪日誌組。
3. **有結果**：兩組 + 命中高亮 + 命中欄位/行的摘要。
4. **查無結果**：「找不到符合『{q}』的結果」。
5. **未連線 GitHub**：卡片照搜；日誌組顯示「⚠ 未連線 GitHub，無法搜尋日誌」。
6. **日誌展開**：點日誌結果就地展開該天上下文（唯讀），再點收合。
   （另含 **日誌載入失敗**：日誌組顯示「日誌載入失敗」。）

## 架構

新增單一元件 `components/search.js`（沿用 Review/Triage 物件式風格），職責清楚、自成一單元：

- `init()`：綁定放大鏡按鈕、Ctrl/Cmd+F 全域快捷鍵、Esc、背景點擊、input 事件。
- `open()` / `close()`：切換 `#modal-search` 的 `hidden`；open 時清空輸入、聚焦、渲染空狀態、觸發 `_loadJournals()`。
- `_loadJournals()`：算近 5 天日期，逐日 `GitHubAPI.getRaw(pat, repo, 'taskflow/journal/{date}.md')`，快取為 `_journals=[{date,label,content}]`；維護 `_journalState`（`'loading'|'loaded'|'error'|'no-conn'`）。每次 open 重新抓（5 個小檔，保持新鮮；載入狀態已設計）。
- `_onInput()`：取 query，呼叫 `_searchCards` + `_searchJournals`，`_render()`。本地過濾即時，無需 debounce。
- `_searchCards(q)`：對 `App.tasks` 各欄位（title/body/pdca.*/source.snippet/links）做不分大小寫比對，回傳 `[{task, fieldLabel, snippet}]`。
- `_searchJournals(q)`：對快取日誌每篇找命中行，回傳 `[{date, label, matchedLines, content}]`。
- `_render()`：組分組結果 HTML，命中字以 `_highlight()`（先 escape 再包 `<mark>`）標示。
- 點擊：卡片結果 → `close()` + 開卡片編輯器（重用看板開卡的既有路徑，實作期確認，預期 `PDCA.show(task)` 之類）+ 看板卡片加暫態高亮 class 並 `scrollIntoView`；日誌結果 → toggle 展開該列上下文。
- 鍵盤：`init()` 加 `keydown`，`(e.ctrlKey||e.metaKey) && e.key==='f'` → `preventDefault()` + `open()`；Esc 關閉。

### HTML（index.html）
- 頂列 `header-right` 在「產日誌」前加放大鏡按鈕 `#btn-search`（`.btn-icon` + search svg）。
- 新增 `#modal-search`（overlay）：輸入框 `#search-input`、結果容器 `#search-results`。

### CSS（style.css）
- 指令面板樣式：頂部對齊置中浮層、輸入列、結果分組標頭、結果列、`<mark>` 高亮、展開段落、各狀態文案樣式。沿用既有 `--surface/--border/--primary/--text-muted` 變數與 `.hidden` 慣例。

### 接線（app.js）
- `init()` 序列加 `Search.init()`。
- 既有 `+` 快捷鍵的 modal 清單加入 `'modal-search'`，避免搜尋開著時誤觸新增。

## 資料流

```
Ctrl+F / 放大鏡 → Search.open()
  → 渲染空狀態、聚焦 input
  → _loadJournals()（async，抓近 5 天 .md → 快取；無 pat/repo → no-conn）
打字 → _onInput()
  → _searchCards(q)（本地、即時、全欄位）
  → _searchJournals(q)（本地過濾快取；載入中則該組顯示 loading，載完重繪）
  → _render()（分組 + 高亮）
點卡片結果 → close() + 開卡片編輯器 + 看板高亮
點日誌結果 → 就地展開/收合上下文
Esc / 背景 → close()
```

## 複用清單

| 既有資產 | 用途 | 位置 |
|---|---|---|
| `GitHubAPI.getRaw` | 讀日誌 | lib/github-api.js |
| 近 5 天日期迴圈 | 仿週覆盤 `_datesInRange`/`_weekdayLabel` | components/review.js |
| Modal `.hidden` 開關 / Esc / 背景點擊 | 面板顯隱 | 既有各 modal |
| 看板開卡編輯路徑 | 卡片結果點擊 | components/kanban.js / pdca.js（實作期確認） |
| `App.showToast` | 錯誤提示 | app.js |

## 邊界與錯誤處理

- 空 query → 空狀態（不顯示任何結果列）。
- 無 `pat`/`repo` → 日誌組「⚠ 未連線 GitHub，無法搜尋日誌」；卡片照搜。
- 日誌某天 404 → 該天略過（getRaw 回 null，不丟錯）。
- 日誌抓取網路錯誤 → 日誌組顯示「日誌載入失敗」。
- 日誌仍載入中時打字 → 卡片即時出，日誌組顯示「⏳ 載入日誌中…」，載完自動重繪。
- 查無結果 → 「找不到符合『{q}』的結果」。
- 命中高亮須先 HTML escape 再包 `<mark>`，避免 XSS / 標籤破版。

## 非目標（YAGNI）

- 不做方向鍵上下選 + Enter 開啟（v1 用點擊；之後要再加）。
- 不做跨會話日誌快取/失效機制（每次 open 重抓 5 檔即可）。
- 不做日誌結果的編輯（舊任務已非卡片，唯讀）。
- 不做搜尋範圍可調（固定近 5 天 + 目前卡片）。
- 不搜「已完成並已刪除」但未進日誌的任務（不存在於任何來源）。

## 版本

新功能 → Minor → **v1.9.0**（app.js / CHANGELOG.md / chrome-extension/manifest.json 三處同步）。

## 驗證方式（localhost:3456）

1. 放大鏡 / Ctrl+F 開面板（確認覆寫瀏覽器 find）；Esc / 背景關閉。
2. 打字即時過濾目前卡片，命中 title 與 body/PDCA/source/links 都能搜到並高亮。
3. 日誌：stub `getRaw` 餵近 5 天日誌 → 出現分組結果；點日誌結果展開上下文。
4. 狀態：未連線（清空 pat）→ 日誌組顯示未連線；查無結果文案正確；載入中狀態出現。
5. 點卡片結果 → 開編輯器 + 看板高亮；點日誌結果 → 展開/收合。
6. 版本三處 = 1.9.0。
