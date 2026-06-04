# Changelog

## v1.8.0 — 2026-06-04
- feat: 「覆盤」改造為「週覆盤」——可自選起訖日期（預設本週一～今天），自動彙整區間內每天日誌的完成項目與 PDCA，並引導填寫本週反思與下週重點（下週重點預帶目前待辦）
- feat: 週覆盤產出 markdown 雙推 GitHub 主倉 taskflow/weekly/ 與 Obsidian {資料夾}/週報/，沿用 v1.6.0 已存在防覆蓋確認；不刪任何任務
- remove: 移除舊「覆盤」單篇日誌瀏覽/編輯功能（與直接看 Obsidian vault 重疊）

## v1.7.0 — 2026-06-04
- remove: 移除側邊欄「便條紙」（隨手記事 + 昨日摘要）功能，及其本地 taskflow_scratch 暫存
- remove: 移除側邊欄「近 90 天」完成熱力圖（本週統計柱狀圖保留，taskflow_daily_log 記錄不受影響）
- remove: 一併移除手機底部導覽的「記」分頁與相關死 CSS（.heatmap-bar）

## v1.6.0 — 2026-06-04
- feat: 產日誌可自選日期，日誌標題、檔名與 Obsidian 雙推路徑改用所選日期（不再寫死今天），方便補產前一天累積在「完成」欄的項目
- feat: 上傳前自動判斷所選日期是否已有日誌（檢查 GitHub 主倉 + Obsidian 倉），已存在時跳提醒「請先到 Obsidian 確認是否要覆蓋」，預設不覆蓋，使用者確認後才執行
- feat: 日誌編輯器標頭新增日期選擇器與「⚠ 此日期已有日誌」即時警示

## v1.5.1 — 2026-06-03
- fix: 拖曳卡片到欄位外放開或按 Escape 時，卡片不再卡在錯誤泳道；dragend 若未完成 drop 會強制還原至資料狀態
- fix: dragleave 改用 relatedTarget 判斷，避免游標移到子卡片時 highlight 錯誤消失

## v1.5.0 — 2026-06-02
- feat: 設定新增「Obsidian 日誌資料夾」可填欄位，日誌雙推路徑不再寫死（預設 02-Areas/CMoney-流量/07-工作日誌），避免日後在 Obsidian 改資料夾名後同步失效
- fix: 先前雙推路徑寫死且缺 `07-` 前綴，日誌推到舊資料夾，雖顯示「+ Obsidian ✓」卻沒同步到實際 vault（已改為可設定並修正預設值）
- fix: 補填日誌 markdown 標題日期改用日誌當天日期，不再寫死為今天
- fix: 上傳日誌時若未設定 Obsidian repo，改顯示明確警示（未同步），不再以一般成功訊息呈現而讓人誤以為已同步

## v1.4.2 — 2026-05-22
- fix: 行事曆重新整理按鈕平時低調顯示（opacity 0.25），hover 後顯現，載入中旋轉動畫並禁用重複點擊
- fix: 行事曆快取改為「今日有效」，同一天內不重複呼叫 API，隔天自動失效

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
