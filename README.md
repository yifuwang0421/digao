# 研究报告底稿工具

> Chrome 浏览器扩展（Manifest V3），用于研究人员在网页调研过程中快速截图采集、信息录入，并一键导出为带嵌入图片的 Excel 工作底稿。

## 功能概览

| 功能 | 说明 |
|------|------|
| 可视区域截图 | 一键截取当前标签页完整可视区域 |
| 自由选区截图 | 拖拽框选页面任意区域，支持十字准星和尺寸提示 |
| 信息录入 | 自动获取当前 URL，手动填写报告页码和备注 |
| Sheet 分组 | 自定义 Sheet 名称，自动记住上次使用的名称 |
| 数据暂存 | 基于 IndexedDB 本地存储，无数据量限制 |
| Excel 导出 | 生成 `.xlsx` 文件，截图以原始比例嵌入单元格，按 Sheet 名分组 |

## Excel 导出格式

导出的 Excel 文件包含以下 4 列：

| 列 | 说明 |
|----|------|
| 报告页码 | 自定义编号，如 P-001 |
| 网页网址 | 以超链接形式展示 |
| 网页截图 | 图片嵌入单元格，保持原始比例，自动调整行高列宽 |
| 备注 | 可选的备注说明 |

## 安装与使用

### 环境要求

- Chrome / Edge 浏览器（支持 Manifest V3）
- Node.js（用于安装 ExcelJS 依赖）

### 安装步骤

1. **克隆项目**

   ```bash
   git clone https://github.com/yifuwang0421/digao.git
   cd digao
   ```

2. **运行安装脚本**

   在 PowerShell 中执行：

   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\setup.ps1
   ```

   该脚本会自动安装 `exceljs` 依赖并生成扩展图标。

3. **加载扩展到浏览器**

   - 打开 Chrome，访问 `chrome://extensions/`
   - 开启右上角「开发者模式」
   - 点击「加载已解压的扩展程序」
   - 选择项目根目录

### 使用流程

1. 点击浏览器工具栏中的扩展图标打开 Popup
2. 选择截图方式：「截取可视区域」或「选区截图」
3. 填写 Sheet 名称、报告页码（必填）和备注（可选）
4. 点击「保存底稿条目」
5. 重复以上步骤采集更多条目
6. 点击「导出 Excel 底稿」生成 `.xlsx` 文件

## 项目结构

```
digao/
├── manifest.json          # 扩展清单（MV3）
├── background.js          # Service Worker：截图、选区协调、Offscreen 管理
├── content-select.js      # Content Script：自由选区 UI（按需注入）
├── offscreen.html         # Offscreen Document 容器页
├── package.json           # Node.js 依赖声明
├── setup.ps1              # 一键安装脚本
├── icons/                 # 扩展图标
├── popup/
│   ├── popup.html         # Popup 界面
│   ├── popup.js           # Popup 交互逻辑
│   └── popup.css          # Popup 样式
└── utils/
    ├── db.js              # IndexedDB 数据层
    ├── excel-export.js    # Excel 生成（ExcelJS）
    └── offscreen-crop.js  # Canvas 图片裁剪
```

## 技术要点

- **Manifest V3**：使用 Service Worker 作为后台脚本，Offscreen Document 提供 DOM/Canvas 能力
- **ExcelJS**：通过 Offscreen Document 加载 UMD bundle，支持图片嵌入单元格（`addImage` + `ext` 参数）
- **选区截图**：Content Script 按需注入（`chrome.scripting.executeScript`），避免全局加载；截图结果通过 `chrome.storage.local` 在 Popup 关闭后传递
- **devicePixelRatio**：选区坐标为 CSS 像素，裁剪时乘以 DPR 获取精确像素
- **IndexedDB**：存储 base64 截图数据，规避 `chrome.storage.local` 的 5MB 配额限制

## 开发

修改代码后，在 `chrome://extensions/` 页面点击扩展卡片上的刷新按钮即可生效，无需重新加载。

## License

MIT
