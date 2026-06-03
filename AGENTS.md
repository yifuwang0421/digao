# AGENTS.md — 研究报告底稿工具

## Project

Chrome MV3 浏览器扩展，用于研究人员在网页调研中截图采集、信息录入，导出带嵌入图片的 Excel 工作底稿。

- **Repo**: https://github.com/yifuwang0421/digao
- **Language**: 纯 JavaScript（无 TypeScript、无构建工具）
- **Runtime**: Chrome Extension Manifest V3

## Quick Start

```powershell
# 安装依赖 + 生成图标（Windows PowerShell）
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup.ps1
```

加载到浏览器：`chrome://extensions/` → 开发者模式 → 加载已解压的扩展 → 选择项目根目录。

## Directory Structure

```
digao/
├── manifest.json              # MV3 清单，权限：activeTab/storage/scripting/downloads/offscreen
├── background.js              # Service Worker：消息路由、截图协调、Offscreen 管理
├── content-select.js          # Content Script：自由选区 UI（按需注入，非 manifest 注册）
├── offscreen.html             # Offscreen Document 容器（加载 ExcelJS + 工具脚本）
├── popup/
│   ├── popup.html             # Popup 界面
│   ├── popup.js               # Popup 交互逻辑 + IndexedDB 操作
│   └── popup.css              # Popup 样式
├── utils/
│   ├── db.js                  # IndexedDB 封装（DB: ResearchReportDraft, v2）
│   ├── excel-export.js        # Excel 生成（ExcelJS，4列 + Sheet 分组 + 图片嵌入）
│   └── offscreen-crop.js      # Canvas 图片裁剪
├── icons/                     # 扩展图标（setup.ps1 生成）
├── setup.ps1                  # 一键安装脚本（PowerShell）
└── package.json               # 唯一依赖：exceljs ^4.4.0
```

## Architecture

### 四方消息传递

```
Popup  ←→  Background (Service Worker)  ←→  Offscreen Document  ←→  Content Script
```

所有消息使用 `{ action: 'xxx', ... }` 格式，由 `background.js` 的消息路由 switch 分发。

### 消息动作清单

| Action | 发送方 | 接收方 | 用途 |
|--------|--------|--------|------|
| `captureScreenshot` | Popup | Background | 可视区域截图 |
| `startAreaScreenshot` | Popup | Background | 启动选区截图（注入 Content Script） |
| `areaSelectionResult` | Content Script | Background | 传递选区坐标 |
| `areaSelectionCancelled` | Content Script | Background | 用户取消选区 |
| `cropImage` | Background | Offscreen | Canvas 裁剪请求 |
| `cropComplete` | Offscreen | Background | 裁剪结果回传 |
| `exportExcel` | Popup | Background | 触发 Excel 导出 |
| `generateExcel` | Background | Offscreen | ExcelJS 生成请求 |
| `excelExportComplete` | Offscreen | Background | 生成结果（blob URL） |
| `areaScreenshotResult` | Background | Popup | 选区截图完成通知 |
| `hideSelectOverlay` | Background | Content Script | 移除选区 UI |

### 选区截图流程

1. Popup 发送 `startAreaScreenshot` → Background 注入 `content-select.js` → 返回 success → Popup 关闭
2. Content Script 显示全屏选区 UI → 用户拖拽框选 → 点击确认
3. Content Script **立即 cleanup 遮罩层** → 发送 `areaSelectionResult`（含 CSS 像素坐标 + devicePixelRatio）
4. Background 等待 300ms → `captureVisibleTab` → 发送 `cropImage` 到 Offscreen
5. Offscreen Canvas 裁剪 → `cropComplete` 回传 → Background 存入 `chrome.storage.local({ pendingScreenshot })`
6. 用户重开 Popup → `init()` 读取 `pendingScreenshot` → 显示预览

### Excel 导出流程

1. Popup 从 IndexedDB 读取全部条目 → 发送 `exportExcel` + entries
2. Background 确保 Offscreen 就绪 → 发送 `generateExcel`
3. Offscreen 用 ExcelJS 生成 .xlsx（按 sheetName 分 Worksheet，图片用 `addImage` + `ext` 嵌入）
4. Offscreen 发送 `excelExportComplete`（blob URL + filename）
5. Background 调用 `chrome.downloads.download` → 5s 后关闭 Offscreen

## Data Model

IndexedDB 条目结构（`db.js`，store: `entries`，autoIncrement id）：

```js
{
  url: string,        // 网页 URL
  pageNum: string,    // 报告页码（必填）
  note: string,       // 备注
  screenshot: string, // base64 data URL
  sheetName: string,  // Excel Sheet 分组名
  timestamp: string,  // ISO 时间戳
}
```

Excel 导出 4 列：报告页码 | 网页网址（超链接）| 网页截图（嵌入图片）| 备注

## Gotchas

### Service Worker 上下文
- `background.js` 运行在 Service Worker 中，**没有 `window`**，必须用 `self`
- `ensureOffscreenDocument()` 创建文档后需等待 ~200ms 让脚本注册监听器
- `cropComplete` 用 `self._cropResolve` 管理 Promise（非 `window._cropResolve`）

### Popup CSP 限制
- Popup HTML 受 MV3 CSP 限制，**禁止 inline `onclick`** 等属性
- 必须用 `addEventListener` + 事件委托（见 `popup.js` 中 `entriesList` 的删除按钮处理）

### Content Script
- **未注册在 `manifest.json` 的 `content_scripts` 中**，改用 `chrome.scripting.executeScript` 按需注入
- 选区坐标是 CSS 像素，裁剪时必须 `× devicePixelRatio` 得到实际像素坐标
- 确认后**立即 cleanup 遮罩层**再发消息，避免 `captureVisibleTab` 截到遮罩

### ExcelJS
- UMD bundle 路径：`node_modules/exceljs/dist/exceljs.min.js`（**不是** `bundle.js`）
- 必须在 Offscreen Document 中加载（Service Worker 无 DOM API）
- 图片嵌入使用 `ws.addImage(id, { tl, ext, editAs: 'oneCell' })`，`ext` 指定像素尺寸

### PowerShell（setup.ps1）
- **必须保存为 UTF-8 BOM 编码**，否则中文在双引号字符串中会损坏
- Windows PS 5.x 的 `Join-Path` 只接受 2 个参数，多路径需嵌套：`Join-Path (Join-Path $a $b) $c`
- `ConvertTo-Json` 和 `here-string` 中的特殊字符可能被 PowerShell 误解析

### 消息通信
- `chrome.runtime.sendMessage` 广播到所有扩展上下文（包括自身），不处理的消息用 `return false` 忽略
- `chrome.storage.local` 用于 Popup 关闭后传递截图数据（Popup 重开时读取并清除）
- IndexedDB 用于持久存储（规避 `chrome.storage.local` 5MB 限制）

## Coding Conventions

- 中文注释 + JSDoc
- 变量命名 `camelCase`，常量 `UPPER_SNAKE_CASE`
- 消息格式 `{ action: 'actionName', ...payload }`
- DB 版本变更需同步 `db.js`（`DB_VERSION`）和 `popup.js`（`openDB` 中的版本号）
