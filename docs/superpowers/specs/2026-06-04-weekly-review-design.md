# 週覆盤（Weekly Review）設計文件

- 日期：2026-06-04
- 目標版本：v1.8.0
- 狀態：設計待使用者確認

## Context（為什麼做）

使用者是 PM，已養成每天「產日誌」推到 GitHub + Obsidian 的習慣（`taskflow/journal/{date}.md`）。但缺一層**週級回顧**——PM 真正需要定期把一週的成果與思考收斂起來反思。

同時，現有的「覆盤」按鈕只是一個**被動的歷史日誌瀏覽器**（列出過去日誌、可翻看/編輯單篇），與使用者直接看 Obsidian vault 的習慣重疊，實際上沒在用。

決策：**把「覆盤」按鈕改造成「週覆盤」**，移除被動翻單篇日誌的功能，換成主動彙整一週 + 引導反思的工具。用途定位為**自己回顧用**（重 PDCA 反思與下週規劃，可寫深，不必拋光）。

## 需求摘要（已與使用者確認）

| 項目 | 決定 |
|---|---|
| 用途 | 自己回顧用（個人反思 / 下週規劃） |
| 期間定義 | 可自選起訖日期，預設「本週一～今天」，手動點按鈕觸發 |
| 內容區塊 | ①本週完成總覽 ②PDCA 彙總 ③本週反思(自由填) ④下週重點(自由填) |
| 完成/PDCA 來源 | 解析區間內每天已產出的日誌 `.md`（唯讀彙整） |
| 下週重點 | 預帶入目前待辦欄任務 |
| 輸出位置 | GitHub 主倉 `taskflow/weekly/` + Obsidian `{obsidianFolder}/週報/` |
| 覆蓋保護 | 沿用 v1.6.0「已存在防覆蓋」確認 |
| 對任務的影響 | 不刪任何任務（純彙整，不動看板） |

## 對「覆盤」的改造

**改名 + 重綁行為**：`btn-review` 按鈕文字 `覆盤` → `週覆盤`，點擊改開週覆盤編輯器。

**移除**（review.js 內的單篇日誌瀏覽/編輯，約 22–181 行）：
- `_loadJournals`、`_viewJournal`、`_renderView`、`_renderEdit`、`_uploadEditedJournal`
- 對應的 review modal 內容（日誌清單 panel、journal-view）及其 CSS（`.journal-item` / `.journal-list` / `.jv-*` 等）

**保留複用**：
- `_parseJournalMd`（components/review.js:183）— 把一篇日誌拆成 `{ done, todo, pdca, notes }`，是彙整一週的關鍵，原封不動沿用
- `_esc`、`show()`/`hide()`（外殼重新利用）

## 編輯器設計

重用現有 `modal-review` 外殼，內容改為週覆盤編輯器，版面從上到下：

1. **日期區間**：起／訖兩個 flatpickr（`dateFormat: 'Y-m-d'`、`maxDate: 'today'`）。預設值：
   - 起 = 本週一 = 今天往回推 `(getDay()+6)%7` 天
   - 訖 = 今天
2. **本週完成總覽**（自動彙整、唯讀）：標頭顯示「共 N 項・本週 X 天有日誌」，內容**按天分組**列出每天的「今日完成」。
3. **PDCA 彙總**（自動彙整、唯讀）：區間內所有日誌的 PDCA 區塊收在一起，每塊標註來自哪天。
4. **本週反思**：空白 `<textarea>`，自己填。
5. **下週重點**：`<textarea>`，**預帶入目前待辦欄任務**（`App.tasks` 中 `status === 'todo'`，每行一項），可加減。
6. 底部「上傳」鈕。

> 完成/PDCA 唯讀的理由：它們從既有日誌忠實撈出，要改去改源頭（Obsidian/日誌）。週覆盤只負責「彙整 + 引導反思」，不重造編輯器（YAGNI）。

## 資料流

```
點「週覆盤」
  → 開 modal，算預設區間（本週一～今天）
  → aggregateRange(start, end)：
      for each date in [start..end]:
        GitHubAPI.getRaw(pat, repo, `taskflow/journal/${date}.md`)
        404 → 略過該天；成功 → _parseJournalMd(content)
      彙整 done(按天) + pdca(附日期)，算覆蓋率
  → 渲染完成總覽 / PDCA 彙總；下週重點預帶目前 todo
改日期區間 → 重新 aggregateRange（race 保護：回來時若區間已變則丟棄）
按上傳：
  → _weeklyToMarkdown() 組出 md
  → 查主倉+Obsidian 是否已有同檔（getRaw 拿 sha）
  → 任一已存在 → confirm「請先到 Obsidian 確認是否要覆蓋」，預設不覆蓋
  → putRaw 雙推主倉 + Obsidian
  → toast 完成（不刪任務）
```

## 輸出檔案

- 檔名：`{start}_{end}.md`（例：`2026-06-01_2026-06-04.md`）
- GitHub 主倉：`taskflow/weekly/{start}_{end}.md`
- Obsidian：`{obsidianFolder}/週報/{start}_{end}.md`（`obsidianFolder` 未填時用內建預設，前後斜線清掉後接 `/週報/`）

### 週覆盤 Markdown 結構

```markdown
# {start} ~ {end} 週覆盤

## 本週完成總覽（共 N 項）
### {date}（週X）
- [x] 項目 (估時)
- [x] 項目
### {date}（週X）
- [x] 項目

## PDCA 彙總
### {任務標題}（{date}）
**Plan**：…
**Do**：…
**Check**：…
**Act**：…

## 本週反思
{自由填內容}

## 下週重點
- [ ] {帶入的待辦}
- [ ] {自己加的}
```

（完成總覽若無 → `- （無）`；PDCA 無 → 整段省略；反思/下週重點空白則省略該段。）

## 邊界與錯誤處理

- 未設定 GitHub（`pat`/`repo` 缺）→ 顯示「請先設定 GitHub 連線」，不進行彙整。
- 區間內某天無日誌（404）→ 靜默略過，用覆蓋率（X 天有日誌）告知。
- 整段都無日誌 → 完成總覽顯示（無），仍可只寫反思/下週重點後上傳。
- 已存在同名週報 → 沿用 v1.6.0 確認流程，預設不覆蓋。
- 改日期區間時的非同步彙整 → race 保護（彙整回來時比對目前區間，不一致就丟棄）。
- 上傳 Obsidian 失敗但主倉成功 → 比照產日誌，toast 明確標示「主倉成功、Obsidian 失敗」。
- 未設定 Obsidian repo → 比照產日誌，toast 警示「未同步 Obsidian」。

## 複用清單（不重造輪子）

| 既有資產 | 用途 | 位置 |
|---|---|---|
| `_parseJournalMd` | 解析單篇日誌 | components/review.js:183 |
| `GitHubAPI.getRaw / putRaw / listDir` | 讀寫 GitHub | lib/github-api.js |
| flatpickr | 日期區間選擇 | 已用於 pdca.js、journal 編輯器 |
| v1.6.0 防覆蓋確認 | 上傳前檢查 | components/review.js `_uploadJournal` |
| `App.showToast` / `_esc` | 提示 / 跳脫 | app.js / review.js |

## 實作改動範圍（檔案）

- `index.html`：`btn-review` 文字改「週覆盤」；`modal-review` 內容改為週覆盤編輯器骨架（日期區間、完成總覽容器、PDCA 容器、兩個 textarea、上傳鈕）。
- `components/review.js`：移除單篇瀏覽/編輯五個方法；新增週覆盤邏輯（開窗、aggregateRange、渲染、`_weeklyToMarkdown`、上傳+防覆蓋）；保留 `_parseJournalMd`/`_esc`。
- `style.css`：移除 `.journal-item`/`.jv-*` 等死樣式；加週覆盤編輯器樣式。
- 版本三處同步 v1.8.0 + `CHANGELOG.md`。

## 非目標（YAGNI）

- 不做自動排程/提醒產週報（先手動觸發；之後要再加）。
- 不做週級「估時準確度」（完成任務已刪除，歷史 per-task 工時撈不回，會不準）。
- 不做完成/PDCA 的就地編輯（要改去源頭日誌）。
- 不在 app 內保留翻單篇歷史日誌（看 Obsidian）。

## 驗證方式（localhost:3456）

1. 點「週覆盤」→ 開窗、預設區間為本週一～今天、下週重點已帶入目前待辦。
2. 完成總覽/PDCA 正確彙整區間內各天日誌，覆蓋率顯示正確。
3. 改日期區間 → 內容重新彙整、無殘留。
4. 上傳：已存在週報 → 跳防覆蓋確認；取消不上傳、確認才覆蓋。
5. 確認主倉 `taskflow/weekly/` 與 Obsidian `…/週報/` 都產出對應檔，且看板任務未被刪。
6. 版本三處 = 1.8.0。
```
