# 長期規劃 ↔ 看板雙向綁定（含歷史單封存）設計文件

- 日期：2026-07-30
- 目標版本：v1.12.0
- 狀態：設計待使用者確認

## Context（為什麼做）

v1.11.0 加了「長期規劃」（母子單 / Epic）視圖，但使用者實際用起來覺得不好用，原因是它跟日常看板幾乎是兩個各自獨立的世界：

1. **從單的角度歸屬規劃太深** —— 唯一入口是開 PDCA 詳情、拉到底找「所屬規劃」下拉（[pdca.js:182](../../../components/pdca.js)）。看板上一眼看不出可以歸屬，也沒有快速操作。
2. **從規劃的角度完全無法選既有單** —— 規劃詳情只有「＋ 開單」建全新子任務（[plan.js:193](../../../components/plan.js)）。已經在看板上跑的單，沒有任何方式勾進規劃。
3. **歷史單根本不可能出現在規劃裡** —— 這是地基問題。日誌上傳成功後，程式會把所有 done 任務從 `tasks.json` **直接刪除**（[review.js:499-503](../../../components/review.js)），過去的成果只以文字形式存在 `taskflow/journal/YYYY-MM-DD.md`。所以一個做了三個月的長期規劃，底下永遠只看得到「還沒做完的」，真正已經完成、已經寫進日誌的貢獻全部不見，進度條也失真。

使用者明確要求：歸屬要能「從單」也能「從規劃」兩邊設定，且**已經編進工作日誌的過去的單也必須出現在長期規劃裡**。

## 需求摘要（已與使用者確認）

| 項目 | 決定 |
|---|---|
| 歷史單資料層 | **封存取代刪除**。日誌上傳後不再直接 delete，改為先寫入新檔 `taskflow/archive/YYYY.json` 後才刪 task |
| archive 記錄內容 | **精簡記錄**（標題＋完成日為主），全文靠 `journalDate` 指回日誌 md，不重複存 body / PDCA |
| archive 分片 | **按年分片**，避免單檔無限成長撞 GitHub Contents API 的 1 MB 上限 |
| archive 載入時機 | **懶載入**，只有進長期規劃視圖或跑匯入時才抓；日常看板啟動完全不碰 |
| 舊日誌（上線前已刪的單） | **一次性全數匯入**：設定頁按鈕掃全部 `journal/*.md` 的「今日完成」建 archive |
| 看板端入口 | **點卡片上的 ◇ 徽章**彈快選；未歸屬的卡顯示淡的 ◇ 佔位 |
| 規劃端入口 | 規劃詳情「＋ 加入既有單」→ 多選挑單器，同時含看板中的單與歷史單 |
| 歷史單計進度 | **計入**（分母分子都算），但子單清單獨立分成「已存檔（歷史）」一組 |
| 歷史列可展開 | **要**。點歷史列 inline 展開該天日誌全文（抓一次、快取） |

### 成本評估（為什麼是精簡＋分片＋懶載入）

`GitHubAPI.getJSON` 走 Contents API 的 `content` 欄位，只對 1 MB 以下的檔案回傳內容。以每工作日完成 5 張、約 1,250 張/年估算：

| 存法 | 單筆 | 一年 | 結果 |
|---|---|---|---|
| 整包任務（含 body + PDCA 四欄） | 0.6–2 KB | ~1.3 MB | 第一年就撞上限 |
| 精簡記錄 | ~150 B | ~180 KB | 撐 5 年以上仍寬裕 |

再加按年分片（每年重開一檔，永不累積）與懶載入（開場延遲 0），成本可視為零。git 體積方面，每天一次 append-only 的 JSON 寫入對 delta 壓縮友善，與現有「每天一份日誌 md」同量級。

## 資料模型

### 新增檔案 `taskflow/archive/YYYY.json`

陣列，每筆為一則封存記錄：

```js
{
  id: 't_1750000000_abc',        // 沿用原任務 id（匯入產生的用 'a_' 前綴，見下）
  title: '把 Chrome extension 上架',
  planId: 'pl_1749000000_x1y',   // null = 未歸屬任何規劃
  estimate: '2h',                // 可能為 ''
  urgency: 'medium',             // 供清單左側優先級圓點沿用既有樣式
  completedAt: '2026-07-23T09:12:33.000Z',
  journalDate: '2026-07-23'      // 指回 taskflow/journal/2026-07-23.md
}
```

年份一律取自 `journalDate` 的前 4 碼（不用 `completedAt`，避免補產昨日日誌時跨年錯檔）。

### `App` 新增狀態

```js
archives: {},        // { '2026': [record, ...] }
archiveShas: {},     // { '2026': 'sha...' }
_archivesLoaded: false,
_archiveSaveTimer: null,
```

### `task` 欄位

不變。既有的 `planId` 繼續是唯一歸屬欄位（單一規劃，不做多對多）。

## 架構

改動集中在既有元件，新增一支挑單器元件避免 `plan.js` 過度膨脹。

### `app.js` — archive 存取層（約 +90 行）

沿用既有 tasks / plans 的三段式寫法（load / persist + 409 retry / debounced save）：

- `_loadArchives()` —— `listDir('taskflow/archive')` 取得有哪些年檔，逐檔 `getJSON` 填入 `archives` / `archiveShas`，設 `_archivesLoaded = true`。目錄不存在（404）時 `listDir` 已回 `[]`，視為空。
- `_persistArchiveYear(year)` —— `putJSON` 寫單一年檔，沿用「409 → 重抓 sha → 重試一次」模式。
- `_scheduleArchiveSave(year)` —— debounce 1200ms，共用 `#save-indicator`。多個年份同時變動時以 Set 收集待寫年份，一次 flush。
- `ensureArchivesLoaded()` —— 對外的懶載入入口，已載入就直接 resolve。
- `archiveList()` —— 把 `archives` 攤平成單一陣列（供搜尋 / 查詢）。
- `archiveOf(planId)` —— 過濾出屬於某規劃的封存記錄，按 `journalDate` 新→舊排序。
- `updateArchive(id, updates)` —— 找到記錄所在年份、更新欄位、`_scheduleArchiveSave(year)`。
- `archiveTasks(tasks, journalDate)` —— 把一批 task 轉成封存記錄推進對應年檔，**回傳 Promise，等實際 persist 成功才 resolve**（不走 debounce，因為呼叫方要靠它決定能不能刪任務）。

### `review.js` — 上傳日誌流程改順序（約 +12 行 / 改 5 行）

現況（[review.js:499-503](../../../components/review.js)）是日誌上傳成功後直接迴圈 `App.deleteTask`。改為：

```
日誌上傳成功
  → await App.archiveTasks(this._journalDoneTasks, today)
      → 成功：迴圈 App.deleteTask（維持現行行為）
      → 失敗：不刪任何任務，toast「日誌已上傳，但封存失敗：<訊息>；任務保留在看板上」
```

失敗時任務留在完成欄，使用者可重試上傳（日誌覆蓋確認流程已存在）。**寧可重複也不要憑空消失**——這是整個改動風險最高的一點。

### `kanban.js` — ◇ 徽章可點（約 +25 行）

- `_planBadge(planId)` 改成回傳 `<button class="plan-badge" data-action="pick-plan">◇ 名稱</button>`。
- `planId` 為空時不再回空字串，改回傳 `<button class="plan-badge plan-badge-empty" data-action="pick-plan" title="歸到長期規劃">◇</button>`。
- CSS：`.plan-badge-empty { opacity: 0 }`、`.task-card:hover .plan-badge-empty { opacity: .45 }`；`@media (hover: none)` 下改為常駐 `opacity: .3`（手機沒有 hover）。
- 事件：在既有的卡片 `click` handler 之前處理 —— `data-action="pick-plan"` 命中時 `e.stopPropagation()` 並開 `PlanPick.openQuick(taskId, badgeEl)`，避免誤開 PDCA。同時對徽章 `mousedown` 也 `stopPropagation()`，避免觸發卡片拖曳。
- 手機 swipe（`_addSwipe`）不受影響，因為 swipe 判定在卡片層、徽章事件已攔下。

### `components/plan-pick.js` — 新元件（新檔，約 200 行）

一支元件同時負責兩個挑選 UI，因為兩者共用「規劃清單」與「歸屬寫入」邏輯：

**A. 快選 popover（看板端）**

- `openQuick(taskId, anchorEl)` —— 在共用浮層 `#plan-quick-pick` 渲染：目前歸屬打勾的 active 規劃清單 →「移除歸屬」→「＋ 新規劃…」。以 `anchorEl.getBoundingClientRect()` 定位在徽章下方，視窗邊界時翻轉。
- 選規劃 → `App.updateTask(id, { planId })` → toast「已歸到《X》」；「移除歸屬」→ `planId: null`。
- 「＋ 新規劃…」→ 關 popover、把 taskId 記在 `PlanPick._pendingTaskId`、呼叫 `Plan.openModal(null)`。`Plan.saveModal()` 在**新建**分支成功後檢查 `PlanPick?._pendingTaskId`，有值就 `App.updateTask(那個 id, { planId: 新規劃.id })` 並清空。使用者按取消 / Esc 關掉 modal 時，`Plan.closeModal()` 一併清空 `_pendingTaskId`，避免殘留到下一次開窗誤綁。
- 點外面 / Esc / 滾動看板 → 關閉。

**B. 加入既有單 modal（規劃端）**

- `openPicker(planId)` —— 開 `#modal-plan-pick`：頂部搜尋框，下方兩區清單，底部「加入 N 張」。
- **看板中** 區：`App.tasks` 中 `planId !== 目前規劃` 的單。已屬於別的規劃者右側標示現規劃名（「現屬：X」），勾選代表搬家。
- **已完成（歷史）** 區：`App.archiveList()` 中 `planId !== 目前規劃` 的記錄，顯示 `標題 · M/D`。
- **預設只列近 90 天的歷史單**（避免一開就幾百列），區塊標題顯示「已完成（歷史）· 近 90 天，共 N 筆；搜尋可找全部」。搜尋框有字時改為全時間範圍過濾。
- 搜尋：標題不分大小寫子字串比對，本地即時過濾（archive 已在記憶體）。
- 「加入 N 張」→ 看板單走 `App.updateTask`、歷史單走 `App.updateArchive`，完成後關窗、`Plan.render()`、toast「已加入 N 張」。

### `plan.js` — 四組清單 + 歷史列展開（約 +90 行）

- `childrenOf(planId)` 不變（仍只回看板上的 task）；新增 `archivedOf(planId)` 代理 `App.archiveOf(planId)`。
- `progressOf(planId)` 改為把封存記錄一併計入：`done = 看板 done 數 + 封存數`、`total = 看板總數 + 封存數`（封存記錄一律視為已完成）。
- `open()` 改為 `async`：先把視圖切出來並 render 一次（看板上的子單立刻看得到，不用等網路），再 `await App.ensureArchivesLoaded()`，成功後 re-render 補上歷史區。載入中歷史區顯示「⏳ 載入封存資料…」，失敗顯示「⚠ 封存資料載入失敗，僅顯示看板上的子單」。`toggleView()` 呼叫端不需 await（fire-and-forget），因為 render 已在 async 內自行收尾。
- `_renderDetail()` 的分組從三組擴為四組，新增 `archived: { label: '已存檔（歷史）' }`，排在最後。
- `_archivedRow(rec)` —— `<div class="plan-child-row archived">` 顯示優先級圓點、標題、`M/D` 完成日、「移除歸屬」按鈕、以及一個展開箭頭。
- 展開歷史列 → `_toggleJournal(date, rowEl)`：`GitHubAPI.getRaw(pat, repo, 'taskflow/journal/<date>.md')`，結果快取在 `this._journalCache[date]`，以 `<pre class="plan-journal-dump">` 純文字（escape 後）inline 顯示在該列下方，再點收合。載入中顯示「⏳ 載入日誌中…」，失敗顯示「日誌載入失敗」。**不做 markdown 渲染**，保持範圍收斂。
- 詳情頭部「編輯」旁加 `＋ 加入既有單` 按鈕 → `PlanPick.openPicker(this._selectedId)`。
- 事件委派新增 `remove-archived`（`App.updateArchive(id, { planId: null })`）與 `toggle-journal`。

### `settings.js` — 一次性匯入（約 +80 行）

設定頁 body 末端（版號顯示上方）加「歷史資料」區塊：一個 `從日誌匯入歷史完成單` 按鈕、一行狀態文字、一行說明「掃描 taskflow/journal 全部日誌，把『今日完成』的項目建成封存記錄，之後可在長期規劃裡歸屬。可重複執行，不會產生重複資料。」

`importJournalHistory()` 流程：

1. 未設 PAT / repo → 按鈕 disabled（不可能發生，但防呆）。
2. `await App.ensureArchivesLoaded()`。
3. `listDir('taskflow/journal')` → 過濾 `\.md$` 且檔名符合 `YYYY-MM-DD` → 按日期排序。
4. 逐檔 `getRaw`，狀態文字更新「處理 12 / 57…」（序列執行，不併發，避免 secondary rate limit）。
5. 解析（見下）→ 產生候選記錄。
6. **去重**：以 `journalDate + '|' + title` 為 key 比對該年檔已有記錄，已存在就跳過。
7. 按年分組，逐年 `putJSON` 寫入。
8. 結束狀態文字：「匯入完成：新增 N 筆、跳過 M 筆（已存在）」。任一步失敗顯示「匯入失敗：<訊息>」，已寫入的年檔保留（下次執行會因去重而接續，不會重複）。

### 日誌解析規則

日誌由 `Review._formToMarkdown` 產生（[review.js:403](../../../components/review.js)），格式穩定：

```markdown
# 2026-07-23 工作日誌

## 今日完成
- [x] 把 Chrome extension 上架 (2h)
- [x] 修 PDCA 高度 bug

## PDCA 覆盤
...
## 明日計畫
- [ ] ...
```

解析步驟：

1. 取 `## 今日完成` 之後、下一個 `^## ` 之前的區段。找不到該標題 → 該檔跳過。
2. 逐行取 `/^- \[x\] (.+)$/` 的捕獲組。（`- [ ]` 的明日計畫不在此區段，不會誤抓。）
3. 跳過 `（無）` 這一行（無完成項目時的佔位）。
4. 尾綴估時：`/\s*\((\d+(?:\.\d+)?[mh]\+?)\)\s*$/` 命中才剝掉當 `estimate`，否則 `estimate: ''`、標題原樣保留。（標題本身含括號時不會被誤剝，因為必須符合 `數字＋m/h` 格式。）
5. 產生記錄：`id: 'a_<date>_<index>'`（`a_` 前綴標示來自匯入、非原始 task id）、`planId: null`、`urgency: 'medium'`、`completedAt: '<date>T12:00:00.000Z'`（日誌只有日期精度，中午當代表值）、`journalDate: <date>`。

## 邊界情況

| 情況 | 處理 |
|---|---|
| archive 寫入失敗 | 日誌上傳流程**不刪任務**，明確 toast 告知任務保留 |
| 刪除規劃 | `App.deletePlan` 現在只解除 `task.planId`（[app.js:279](../../../app.js)），要一併把該規劃的封存記錄 `planId` 設為 null（封存記錄沒有 status，不需要像 planned task 那樣轉回 backlog） |
| 年檔 409 衝突 | 沿用既有「重抓 sha → 重試一次」模式 |
| `taskflow/archive/` 不存在 | `listDir` 回 `[]`，`archives = {}`，一切正常運作（首次封存時 `putJSON` 自動建檔） |
| 規劃跨年 | 進規劃頁一次抓全部年檔（檔數 = 使用年數，1–2 個），跨年規劃自然完整 |
| 同一天重複上傳日誌 | 覆蓋確認流程已存在；封存去重靠 `journalDate + title`，重複上傳不會長出重複記錄 |
| 未連線 GitHub（無 PAT / repo） | 規劃頁歷史區顯示「⚠ 未連線，無法載入封存資料」；匯入按鈕 disabled |
| mock mode | 由 `mock-mode.js` 直接塞入 `App.archives` 並設 `_archivesLoaded = true`，`ensureArchivesLoaded()` 因此直接 resolve、不打 API。歷史區有假資料可驗，不走上面的未連線分支 |
| 匯入時 journal 檔很多 | 序列執行 + 進度文字。listDir 單次上限 1000 檔，以每天一份計可撐 2.7 年；超過的分頁處理**不在本次範圍**（屆時再議） |
| 歷史單的標題與看板單重名 | 兩者是獨立記錄、獨立 id，各自歸屬，不做合併判斷 |

## 測試策略

專案沒有測試框架（無 test runner、無 test 目錄），既有元件也都沒有單元測試。維持現況，靠手動驗證：

1. 在 `mock-mode.js` 補 archive 假資料（含已歸屬 `pl-mock-1` 與未歸屬各數筆、跨兩個年份），讓規劃頁四組清單、進度計算、挑單器都能在不連 GitHub 的情況下驗。
2. 在 localhost:3456 逐項手動走查：
   - 看板未歸屬卡 hover 出現淡 ◇ → 點 → 快選 → 歸屬後徽章變名稱、規劃頁進度前進
   - 已歸屬卡點 ◇ → 移除歸屬
   - 點 ◇ 不會誤開 PDCA、不會誤觸拖曳
   - 規劃頁「＋ 加入既有單」→ 搜尋 → 多選看板單＋歷史單 → 加入
   - 歷史列展開日誌、收合、快取（第二次展開不再打 API）
   - 移除歷史單歸屬
   - 刪除規劃後，看板單與封存記錄都解除歸屬
3. 真實 GitHub 環境驗一次「產日誌 → 封存 → 任務消失但出現在規劃歷史區」完整循環，以及一次性匯入。

## 版本與收尾

依 `.claude/rules/versioning.md`，新功能屬 minor → **v1.12.0**，三處同步：

- `app.js` 第 2 行 `APP_VERSION = 'v1.12.0'`
- `CHANGELOG.md` 最上方新增 `## v1.12.0 — 2026-07-30`
- `chrome-extension/manifest.json` 的 `"version": "1.12.0"`

## 明確不做（YAGNI）

- 一張單歸屬多個規劃（多對多）——目前 `planId` 單值夠用
- 規劃嵌套規劃（子 Epic）
- archive 的 markdown 渲染（純文字 `<pre>` 就好）
- archive 分頁 / 超過 1000 份日誌的處理
- 把 archive 併進搜尋面板（[search.js](../../../components/search.js) 現在搜近 5 天日誌，已有替代路徑）
- 從規劃頁反向編輯歷史單的標題或內容（封存即唯讀，除了歸屬）
