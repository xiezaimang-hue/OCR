# Screen OCR Vocabulary — Chrome Extension

在任何網頁上拖曳框選英文單字，即時顯示中文翻譯並自動存入單字卡列表。

- **OCR**：Tesseract.js（本機執行、英文語言包已打包）
- **翻譯 + 詞性 + 例句 + 例句翻譯**：Google Gemini API
- **單字列表**：卡片式布局，支援搜尋、置頂、刪除

## 安裝步驟

1. 打開 Chrome，前往 `chrome://extensions/`
2. 開啟右上角的「**開發人員模式**」
3. 點擊「**載入未封裝擴充功能**」→ 選擇本資料夾（`OCR/`）
4. 擴充功能圖示會出現在工具列

## 設定 Gemini API Key

此擴充功能使用 Google Gemini API，請先取得一組免費 API Key：

1. 前往 <https://aistudio.google.com/apikey> 並登入 Google 帳號
2. 點「Create API key」取得一組金鑰
3. 點擴充功能圖示 → **⚙️ 設定**
4. 把 API Key 貼上 → 按「測試連線」驗證 → 按「儲存」

> Gemini API 目前對一般用量提供免費額度，日常使用多半不會產生費用。

## 使用方式

### 啟動 OCR 選取

有三種方式擇一：

- **快捷鍵**：`Ctrl+Shift+O`（Mac: `⌘+Shift+O`）
- **右鍵選單**：在網頁任何位置按右鍵 → 「啟用 OCR 選取」
- **擴充功能彈窗**：點工具列圖示 →「在當前分頁啟動 OCR」

### 框選單字

1. 畫面會進入半透明選取模式
2. 按住滑鼠左鍵拖曳一個矩形，蓋住想學的英文單字
3. 放開滑鼠後：
   - Tesseract.js 會在 1–3 秒內辨識出單字
   - Gemini API 會生成翻譯、詞性、例句與例句翻譯
   - 結果以 tooltip 顯示在選取框下方，同時存入單字列表
4. 按 `ESC` 隨時取消

### 單字列表

- 點擴充功能圖示 → 「📚 開啟單字列表」
- 列表每張卡片包含：單字、翻譯、詞性、例句（英文與中文）
- 右上角按鈕：
  - 📌 **置頂** — 重要單字釘在最上方
  - 🗑️ **刪除** — 二次確認後移除
- 頂部有搜尋框，可依單字或中文翻譯過濾

### 重複單字

框選到已存在的單字時，會**更新時間戳並移到列表最前面**，不會重複儲存。

## 自訂快捷鍵

預設 `Ctrl+Shift+O` 若與其他軟體衝突，可至 `chrome://extensions/shortcuts` 修改。

## 資料儲存

- 所有單字與 API Key 都只存在**本機瀏覽器**（`chrome.storage.local`）
- 不會上傳到任何伺服器
- API Key 僅在呼叫 Gemini API 時發送給 Google

## 檔案結構

```
OCR/
├── manifest.json
├── background.js          # service worker：指令、截圖、裁切、Gemini、儲存
├── content/               # 拖曳選取 overlay + tooltip
├── offscreen/             # Tesseract.js OCR runner（offscreen document）
├── popup/                 # 擴充功能彈窗（兩顆按鈕）
├── wordlist/              # 單字列表卡片頁
├── settings/              # API Key / 模型 設定頁
├── lib/                   # Tesseract.js + 英文語言包 + storage/gemini 封裝
└── icons/                 # 16/32/48/128 icons
```

## 常見問題

**Q：OCR 結果不準？**
A：Tesseract.js 對較小、模糊、低對比的文字辨識較弱。建議：
- 把瀏覽器縮放到 125%–150% 再框選
- 框選時只框一個單字，周圍留一點空白
- 背景顏色深時也可能影響

**Q：tooltip 顯示「請先到設定頁輸入 API Key」？**
A：請依「設定 Gemini API Key」章節完成設定。

**Q：為何 chrome:// 或 extension:// 頁面不能用？**
A：Chrome 安全政策禁止擴充功能在這些頁面執行腳本。請切換到一般網頁（https://…）。

**Q：為何擴充功能大小接近 25 MB？**
A：內建 Tesseract.js 核心 WASM（~4 MB）、英文語言包（~12 MB）都是為了**完全離線 OCR**；這些檔案在首次使用時已在本機，不需要每次下載。

## 技術細節

- **Manifest V3**，service worker 為 ES module
- **Offscreen Document** 跑 Tesseract.js（service worker 無 DOM / Worker 支援）
- **OffscreenCanvas** 在 service worker 中裁切截圖，已處理 `devicePixelRatio`
- **Gemini 回傳 JSON**：使用 `responseMimeType: 'application/json'` 強制結構化輸出
- **重複單字**：以 `word.toLowerCase()` 比對，命中則更新 `updatedAt` 並移到陣列首

## 授權

本專案程式碼採 MIT 授權；內含 Tesseract.js（Apache 2.0）與 Tesseract eng traineddata（Apache 2.0）。
