# Changelog

## v1.4.1 — 2026-05-22
- fix: 任務詳情 modal 標題輸入框預設顯示邊框與背景，明確標示可編輯

## v1.4.0 — 2026-05-21
- feat: 設定 modal 新增「匯出設定 / 匯入設定」按鈕 — 一鍵下載含 PAT 的 JSON 備份檔，下次清除瀏覽資料後可一鍵還原所有欄位

## v1.3.7 — 2026-05-20
- feat: 任務詳情 modal 標題可直接編輯，hover/focus 顯示邊框；儲存時空白標題會 fallback 回原值

## v1.3.6 — 2026-05-20
- fix: 日誌「今日完成」過濾改用本地時區比對 — completedAt 以 ISO UTC 儲存，凌晨完成的任務轉本地日期後才能正確對應 getTodayKey()

## v1.3.5 — 2026-05-20
- fix: 補填日誌「今日完成」改為帶入目前所有 done 任務，與主畫面 done 欄一致；不再按 completedAt 嚴格過濾（跨日完成的任務也能補進）
- fix: 未完成日誌橫幅計數同步改為目前 done 任務數

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
