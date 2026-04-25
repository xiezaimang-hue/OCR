# Screen OCR Vocabulary — Chrome Extension

在任何网页上拖动框选英文单词，即时显示中文翻译并自动存入生词卡列表。

- **OCR**：Tesseract.js（本机执行、英文语言包已打包）
- **翻译 + 词性 + 例句 + 例句翻译**：Google Gemini API
- **单词列表**：卡片式布局，支持搜索、置顶、删除

## 安装步骤

1. 打开 Chrome，前往 `chrome://extensions/`
2. 打开右上角的「**开发人员模式**」
3. 点击「**加载已解压的扩展程序**」→ 选择本文件夹（`OCR/`）
4. 扩展程序图标会出现在工具栏

## 设定 Gemini API Key

此扩展程序使用 Google Gemini API，请先取得一组免费 API Key：

1. 前往 <https://aistudio.google.com/apikey> 并登录 Google 账号
2. 点「Create API key」取得一组密钥
3. 点扩展程序图标 → **⚙️ 设定**
4. 把 API Key 贴上 → 按「测试连接」验证 → 按「保存」

> Gemini API 目前对一般用量提供免费额度，日常使用多半不会产生费用。

## 使用方式

### 启动 OCR 选择

有三种方式择一：

- **快捷键**：`Ctrl+Shift+O`（Mac: `⌘+Shift+O`）
- **右键菜单**：在网页任何位置按右键 → 「启用 OCR 选择」
- **扩展程序弹窗**：点工具栏图标 →「在当前标签页启动 OCR」

### 框菜单词

1. 画面会进入半透明选择模式
2. 按住鼠标左键拖动一个矩形，盖住想学的英文单词
3. 放开鼠标后：
   - Tesseract.js 会在 1–3 秒内辨识出单词
   - Gemini API 会生成翻译、词性、例句与例句翻译
   - 结果以 tooltip 显示在选择框下方，同时存入单词列表
4. 按 `ESC` 随时取消

### 单词列表

- 点扩展程序图标 → 「📚 打开单词列表」
- 列表每张卡片包含：单词、翻译、词性、例句（英文与中文）
- 右上角按钮：
  - 📌 **置顶** — 重要单词钉在最上方
  - 🗑️ **删除** — 二次确认后移除
- 顶部有搜索框，可依单词或中文翻译过滤

### 重复单词

框选到已存在的单词时，会**更新时间戳并移到列表最前面**，不会重复保存。

## 自定义快捷键

预设 `Ctrl+Shift+O` 若与其他软件冲突，可至 `chrome://extensions/shortcuts` 修改。

## 数据保存

- 所有单词与 API Key 都只存在**本机浏览器**（`chrome.storage.local`）
- 不会上传到任何服务器
- API Key 仅在调用 Gemini API 时发送给 Google

## 文件结构

```
OCR/
├── manifest.json
├── background.js          # service worker：指令、截图、裁切、Gemini、保存
├── content/               # 拖动选择 overlay + tooltip
├── offscreen/             # Tesseract.js OCR runner（offscreen document）
├── popup/                 # 扩展程序弹窗（两颗按钮）
├── wordlist/              # 单词列表卡片页
├── settings/              # API Key / 模型 设定页
├── lib/                   # Tesseract.js + 英文语言包 + storage/gemini 封装
└── icons/                 # 16/32/48/128 icons
```

## 常见问题

**Q：OCR 结果不准？**
A：Tesseract.js 对较小、模糊、低对比的文本辨识较弱。建议：
- 把浏览器缩放到 125%–150% 再框选
- 框选时只框一个单词，周围留一点空白
- 背景颜色深时也可能影响

**Q：tooltip 显示「请先到设定页输入 API Key」？**
A：请依「设定 Gemini API Key」章节完成设定。

**Q：为何 chrome:// 或 extension:// 页面不能用？**
A：Chrome 安全政策禁止扩展程序在这些页面执行脚本。请切换到一般网页（https://…）。

**Q：为何扩展程序大小接近 25 MB？**
A：内建 Tesseract.js 内核 WASM（~4 MB）、英文语言包（~12 MB）都是为了**完全离线 OCR**；这些文件在首次使用时已在本机，不需要每次下载。

## 技术细节

- **Manifest V3**，service worker 为 ES module
- **Offscreen Document** 跑 Tesseract.js（service worker 无 DOM / Worker 支持）
- **OffscreenCanvas** 在 service worker 中裁切截图，已处理 `devicePixelRatio`
- **Gemini 回传 JSON**：使用 `responseMimeType: 'application/json'` 强制结构化输出
- **重复单词**：以 `word.toLowerCase()` 比对，命中则更新 `updatedAt` 并移到数组首

## 授权

本项目代码采用 MIT 许可证；内含 Tesseract.js（Apache 2.0）与 Tesseract eng traineddata（Apache 2.0）。
