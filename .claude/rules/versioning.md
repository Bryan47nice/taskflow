# TaskFlow Versioning Rules

每次改版必須同步更新以下三個地方，缺一不可：

1. `app.js` 頂部 `APP_VERSION` 常數
2. `CHANGELOG.md` 最上方新增 `## vX.Y.Z — YYYY-MM-DD` 區塊
3. `chrome-extension/manifest.json` 的 `version` 欄位（與 web app 同步，格式不含 v 前綴）

## SemVer 規則
- **Major (X)**: 資料結構破壞性變更、全面 UI 重構
- **Minor (Y)**: 新功能、新整合、新頁面
- **Patch (Z)**: Bug fix、CSS 調整、文字修正

## Commit 格式
```
feat(v1.4.0): 描述新功能
fix(v1.3.1): 描述修正內容
```

## 版號位置速查
| 檔案 | 欄位 |
|------|------|
| `app.js` | `const APP_VERSION = 'v1.3.0'`（第 2 行） |
| `CHANGELOG.md` | 最上方區塊標題 |
| `chrome-extension/manifest.json` | `"version": "1.3.0"` |
