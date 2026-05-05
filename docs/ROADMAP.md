# ROADMAP — TaskFlow 功能規劃

> 更新日期：2026-05-05

---

## 已完成

### Phase 0 — 基礎架構
- [x] 純 HTML/CSS/JS 架構，無 build step
- [x] GitHub Contents API 串接（讀寫 tasks.json）
- [x] Debounce 自動儲存（1.2 秒批次推送）
- [x] 設定 modal（GitHub PAT + Repo 驗證）

### Phase 1 — Kanban 看板
- [x] 三欄看板（待辦 / 進行中 / 完成）
- [x] 拖曳換欄（桌面）
- [x] 手機左右 swipe 換狀態
- [x] 優先級顏色（紅/黃/綠左邊框）
- [x] 任務來源圖示

### Phase 2 — Triage 新增流程
- [x] 4 步驟引導（名稱 → 優先級 → 預估時間 → 截止）
- [x] 鍵盤快捷鍵（1/2/3 選優先級、Enter 下一步）
- [x] URL 參數帶入（?triage=1&text=...）

### Phase 3 — PDCA 反思
- [x] 任務詳情 modal
- [x] Plan / Do / Check / Act 欄位
- [x] 狀態切換與刪除

### Phase 4 — 誠實工時引擎
- [x] 近三天加權完成率計算
- [x] 今日可用工時顯示
- [x] 超排警示

### Phase 5 — 日誌與覆盤
- [x] AI 任務標題建議（Claude Haiku）
- [x] 一鍵產日誌（markdown 推 GitHub）
- [x] 覆盤頁（瀏覽歷史日誌）

### Phase 5.5 — Chrome 擴充功能
- [x] Alt+S 選文字觸發 Triage
- [x] 來源平台自動識別（Google Chat、Jira、Gmail 等）
- [x] MV3 Service Worker

### Phase 6 — Google Calendar 整合
- [x] GIS OAuth2 Token Model（純前端）
- [x] 今日行事曆事件顯示
- [x] 會議時間自動從可用工時扣除

---

## 待規劃

### 近期（可考慮）
- [ ] **行事曆 → 任務**：直接從行事曆事件建立 TaskFlow 任務
- [ ] **重複任務**：支援每天 / 每週固定任務
- [ ] **任務標籤**：除優先級外，加上自定義標籤分類
- [ ] **快捷鍵**：全域鍵盤快捷鍵（例如 N = 新增任務）

### 中期（需要更多討論）
- [ ] **行動版 PWA**：加 Service Worker + manifest，讓手機可加入主畫面離線使用
- [ ] **Obsidian 雙向連結**：日誌中的任務可連回 Obsidian 筆記

### 不在規劃內
- 多人協作（設計上是個人工具）
- 自架 backend（維持零伺服器原則）
