# TaskFlow

個人 PDCA 任務管理網頁應用。把工作任務用看板管理，每個任務可填 Plan/Do/Check/Act 反思，資料同步到你的 GitHub repo，日誌可在 Obsidian 直接閱讀。

**[→ 開啟 App](https://bryan47nice.github.io/taskflow/)**

---

## 功能

| 模組 | 說明 |
|------|------|
| 看板 | 三欄 Kanban（待辦／進行中／完成），支援拖曳與手機 swipe |
| Triage | 4 步驟快速新增任務（名稱 → 優先級 → 預估時間 → 截止） |
| PDCA | 每個任務可填 Plan/Do/Check/Act 工作反思 |
| 誠實工時 | 根據近三天完成率預測今日可用工時，避免過度排程 |
| AI 標題建議 | Claude Haiku 自動生成繁體中文任務標題（≤15 字） |
| 日誌 | 一鍵產生當日 markdown 工作日誌，推送到 GitHub |
| 覆盤 | 瀏覽歷史日誌 |
| Google Calendar | 顯示今日行事曆，自動從可用工時扣除會議時間 |
| Chrome 擴充功能 | 選取網頁文字按 Alt+S，直接開啟 Triage 新增任務 |

---

## 快速上手

### 1. 設定 GitHub PAT
1. 到 [GitHub Settings → Tokens](https://github.com/settings/tokens) 建立 Personal Access Token
2. 權限勾選 `Contents: Read and Write`
3. 開啟 App，點 ⚙️ 設定，填入 Token 和你的 repo（格式：`owner/repo`）

### 2. 選填設定
- **Claude API Key**：用於 AI 標題建議（[取得 Key](https://console.anthropic.com/)）
- **Google Calendar OAuth Client ID**：用於行事曆整合（見 [PRD](docs/PRD.md)）

### 3. Chrome 擴充功能（選用）
1. 打開 `chrome://extensions/`，開啟開發人員模式
2. 載入 `chrome-extension/` 資料夾
3. 在任何網頁選取文字，按 `Alt+S` 即可快速新增任務

---

## 技術架構

| 面向 | 決策 |
|------|------|
| 前端 | 純 HTML/CSS/JS，無 build step |
| 儲存 | GitHub Contents API（PAT 認證） |
| 部署 | GitHub Pages |
| AI | Claude API（Haiku） |
| 行事曆 | Google Calendar API + GIS OAuth2 |
| 擴充功能 | Chrome MV3 Service Worker |

所有設定（PAT、API Key）存在瀏覽器 localStorage，不經過任何伺服器。

---

## 文件

- [PRD — 產品需求文件](docs/PRD.md)
- [ROADMAP — 功能規劃](docs/ROADMAP.md)
