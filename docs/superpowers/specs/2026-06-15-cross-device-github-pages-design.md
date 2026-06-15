# TaskFlow 跨裝置部署設計 — GitHub Pages

- 日期：2026-06-15
- 狀態：已核准，執行中
- 場景：80% 桌機 / 20% 筆電・手機；本階段筆電可用即達標

## 問題

TaskFlow 目前只能透過桌機本機伺服器（`serve.js`，`http://localhost:3456`）開啟。
筆電、手機連不到 `localhost`，因此無法使用。

## 核心洞察

**資料其實早已跨裝置同步**，缺的只是一個「任何裝置都連得到的網址」。

- 任務 / 計畫存於使用者的 GitHub 資料 repo（`taskflow/tasks.json`、`taskflow/plans.json`），
  透過 GitHub Contents API 讀寫（見 `app.js` `_loadTasks` / `_persistTasks` 等）。
- PAT 與資料 repo 名稱存在各裝置瀏覽器的 `localStorage`（`taskflow_settings`），非寫死於程式碼。
- App 為純前端靜態網站，無後端。
- `index.html` 未引用 `mock-mode.js`（該檔僅由本機 `serve.js` 在回應時注入），
  因此靜態部署會**自動以真實 GitHub 模式**執行。
- 所有資源路徑為相對路徑（`style.css`、`components/*.js`…），外部資源走完整 https URL，
  因此 GitHub Pages 專案子路徑 `/taskflow/` 無需任何程式碼變更即可運作。

## 「登入」模型

本 App 借用 GitHub 作為帳號系統與雲端儲存：

| 一般 App | TaskFlow |
|---|---|
| 帳號 / 密碼 | PAT（GitHub 個人存取金鑰） |
| 雲端資料庫 | 資料 repo（存 `tasks.json` 的倉庫） |
| 登入動作 | 在設定畫面貼上 PAT + 資料 repo 名稱 |

新裝置只需在設定畫面輸入同一組 PAT 與資料 repo，即讀取到同一份資料。

## 安全模型（使用者已確認接受）

公開的是「程式碼 repo（App 外殼）」，**非使用者的任務內容**。

- 程式碼 repo `Bryan47nice/taskflow` 轉 public → App 介面公開。
- 資料 repo 維持 private；PAT 僅存於各裝置 localStorage，不在程式碼內。
- 陌生人開啟公開網址只會看到要求輸入 PAT 的空白設定畫面，無 PAT 無法讀取任何資料。
- 上線前已執行安全掃描（工作樹與 git 歷史），確認無寫死之金鑰／token。

## 步驟

1. **上線前安全掃描** ✅ — 工作樹與 git 歷史皆無寫死金鑰（唯一 `ghp_` 為輸入框 placeholder）。
2. **新增 `.nojekyll`** — 唯一檔案異動，讓 Pages 跳過 Jekyll 處理。
3. **`.gitignore` 加入 `.claude/worktrees/`** — 清理本機工作樹雜訊。
4. **將 `Bryan47nice/taskflow` 設為 public**（GitHub 網頁 Settings，使用者手動執行）。
5. **啟用 GitHub Pages** — 來源 `master` 分支 root（GitHub 網頁 Settings → Pages）。
6. **驗證上線** — 抓取 `https://bryan47nice.github.io/taskflow/`，確認回傳設定畫面。
7. **筆電登入引導** — 提供使用者從桌機設定面板複製 PAT + 資料 repo 的步驟小抄。

## 刻意不做（YAGNI）

- **不改 `app.js`、不升版號**：App 程式碼零位元變更，純基礎設施，不觸發改版規則。
- **手機 PWA / 離線快取**：本階段筆電優先；手機後續再評估。
- **不動 `serve.js`**：本機開發續用 `localhost:3456` mock 模式，與線上真實模式並存互不干擾。

## 風險與對策

- 不可逆性：repo 公開為可逆（隨時可轉回 private，但免費方案下 Pages 會隨之停用）。
- 衝突同步：既有 `_persistTasks` 對 409（SHA 過期）已有重抓重試機制，多裝置交替使用安全。
