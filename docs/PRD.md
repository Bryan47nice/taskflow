# PRD — TaskFlow 產品需求文件

> 版本：1.0 | 日期：2026-05-05

---

## 背景與動機

使用者是一位 PM，日常工作需要在多個平台（Google Chat、Jira、Gmail、Slack）接收任務，容易遺漏或忘記反思。原有的 Chrome 擴充功能只能暫存任務，無法跨裝置、無法覆盤。

希望有一個：
- 資料自主（不依賴第三方 SaaS）
- 可在手機和電腦都用
- 能記錄工作反思（PDCA）
- 能同步到 Obsidian 筆記的工作管理工具

---

## 目標使用者

**PM 使用者**
- 每天接收來自不同來源的任務
- 重視工作反思與覆盤習慣
- 使用 Obsidian 做個人知識管理
- 希望工具簡單、不需要額外帳號

---

## 核心問題

1. 任務散落在各平台，沒有統一收口
2. 完成任務後缺乏反思記錄
3. 容易過度排程，沒有真實的工時感知
4. 跨裝置無法同步

---

## 解決方案

以 GitHub repo 作為資料層，純前端 web app 作為介面，不需要自架伺服器。

---

## 功能需求

### 核心功能

#### F1 — 任務 Triage
- 4 步驟引導新增任務：名稱 → 優先級 → 預估時間 → 截止日
- 支援鍵盤快捷鍵（1/2/3 選優先級）
- AI 自動建議繁體中文任務標題（≤15 字）
- 可從 Chrome 擴充功能帶入網頁選取文字

#### F2 — Kanban 看板
- 三欄：待辦 / 進行中 / 完成
- 支援拖曳換欄（桌面）、左右 swipe（手機）
- 按優先級排序，高優先以紅色左邊框標示
- 任務來源圖示（Google Chat、Jira、Gmail 等）

#### F3 — PDCA 工作反思
- 每個任務可填：Plan（計畫）/ Do（執行）/ Check（結果）/ Act（後續）
- 任務狀態管理（待辦 → 進行中 → 完成）
- 完成時記錄 completedAt 時間戳

#### F4 — 誠實工時引擎
- 根據近三天完成率計算今日實際可用工時
- 加權算法：最近一天 ×3、前一天 ×2、再前一天 ×1
- 顯示已排工時 vs 可用工時，提示是否超排

#### F5 — 日誌系統
- 一鍵產生當日 markdown 日誌（含完成任務、PDCA、明日計畫）
- 推送到 GitHub repo `taskflow/journal/YYYY-MM-DD.md`
- Obsidian 可直接閱讀該 markdown 檔

#### F6 — Google Calendar 整合
- OAuth2 GIS Token Model（純前端，無需 server）
- 顯示今日行事曆事件與時間
- 自動從可用工時扣除會議時間

#### F7 — Chrome 擴充功能
- 在任意網頁選取文字，按 Alt+S
- 識別來源平台（Google Chat、Jira、Gmail、Slack、Notion）
- 開啟 TaskFlow Triage modal 並帶入選取內容

---

## 技術架構決策

| 決策 | 選擇 | 理由 |
|------|------|------|
| 前端框架 | 無（純 HTML/CSS/JS） | 零 build step，可直接用瀏覽器開啟或 GitHub Pages 部署 |
| 資料儲存 | GitHub Contents API | 資料自主，Obsidian 可讀，版本控制免費 |
| 部署 | GitHub Pages | 免費，零維運 |
| AI | Claude API Haiku | 成本極低，繁中效果好 |
| 行事曆 | Google GIS Token Model | 純瀏覽器端，無需 server，無需 refresh token 管理 |
| 擴充功能 | Chrome MV3 | 現代標準，安全沙盒 |

---

## 資料模型

### Task（`taskflow/tasks.json`）
```json
{
  "id": "t_1735123456789_a3b",
  "title": "修 login bug",
  "body": "",
  "links": ["https://..."],
  "urgency": "high | medium | low",
  "estimate": "30m | 1h | 2h | ...",
  "deadline": "today | tomorrow | backlog",
  "status": "todo | in-progress | done",
  "done": false,
  "source": {
    "type": "gchat | jira | gmail | slack | notion | manual",
    "url": "https://...",
    "snippet": "前 120 字..."
  },
  "pdca": {
    "plan": "",
    "do": "",
    "check": "",
    "act": ""
  },
  "createdAt": "ISO string",
  "completedAt": null,
  "dayKey": "YYYY-MM-DD"
}
```

### 日誌（`taskflow/journal/YYYY-MM-DD.md`）
```markdown
# 2026-05-05 工作日誌

## 今日完成
- [x] 任務標題 (1h)
  - Check: ...

## 明日計畫
- [ ] 任務標題
```

---

## 非功能需求

| 需求 | 規格 |
|------|------|
| 隱私 | 所有 key 存 localStorage，不經過任何伺服器 |
| 成本 | 零月費（GitHub Pages 免費、Calendar API 免費配額足夠個人使用） |
| 安全 | XSS 防護（所有使用者輸入 HTML escape）、Safe URL（只允許 http/https） |
| 離線 | 不支援（需要 GitHub API 連線） |
