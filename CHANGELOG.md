# Changelog

## v1.3.4 — 2026-05-20
- fix: 補填日誌改為即時掃描 App.tasks，按 completedAt 帶入該日完成任務，不再依賴可能過時的午夜快照
- fix: 未完成日誌橫幅的「已快照 N 件完成任務」改為即時計算，與 modal 內容一致
- refactor: review.showEditor 接受 dateStr 參數，showEditorForDate 委派給它，移除重複邏輯

## v1.3.3 — 2026-05-19
- fix: 日誌「明日計畫」補入跨日 in-progress 任務 — 不再被「今天」條件過濾
- fix: review.js 補上 `deadline === today` 具體日期分支，與 app.js 篩選邏輯保持一致

## v1.3.2 — 2026-05-18
- fix: 新增任務 modal 防誤關閉 — 點背景不再關閉、ESC 與 × 有輸入時跳確認
- feat: footer 新增明確「取消」按鈕

## v1.3.1 — 2026-05-18
- fix: 行事曆事件快取至 localStorage（30min TTL），刷新自動還原
- fix: 新增行事曆「重新整理」按鈕
- fix: 右上角時間格式縮短（9hr 30min → 9h30）
- fix: 行事曆取得範圍改為 08:30–18:00

## v1.3.0 — 2026-05-18
- fix: 修正同優先級任務無法拖曳排序（新增 order 欄位）
- feat: 工作日誌匯出 Obsidian 時補入任務相關連結
- fix: Calendar token 改 localStorage 存 expiry 避免頁面重整過期
- fix: 同步 409 衝突時自動重抓 SHA 並重試
- fix: 相關連結儲存按鈕在 c-dark 主題下白底白字不可見
- fix: 任務詳情 body 區塊連結顯示 [object Object]
- fix: banner 加「已完成」按鈕
