/**
 * Excel 导出核心逻辑（运行在 Offscreen Document 上下文中）
 *
 * 优化项：
 * - 精简为 4 列：报告页码、网页网址（超链接）、网页截图（嵌入图片）、备注
 * - 按 sheetName 字段分组到不同 Worksheet
 * - 图片按原始比例缩放，尽量填满单元格，自动调整行高列宽
 */

if (typeof ExcelJS === 'undefined') {
  console.error('[ExcelExport] ExcelJS 未加载！');
}

// ========== 消息监听 ==========
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'generateExcel') {
    generateExcelExport(message.entries)
      .then((result) => sendResponse(result))
      .catch((err) => {
        console.error('[ExcelExport] 生成失败:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

// ========== 工具函数 ==========
function getBase64Data(dataUrl) {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.substring(idx + 1) : dataUrl;
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}

// ========== 样式常量 ==========
const BORDER = {
  top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
};
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B5797' } };
const HEADER_FONT = { size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
const HEADER_ALIGN = { vertical: 'middle', horizontal: 'center', wrapText: true };

// ========== 图片显示参数 ==========
const MAX_COL_WIDTH = 60;       // ExcelJS 列宽上限（约 420px）
const PX_PER_COL_UNIT = 7.0;   // 1 列宽单位 ≈ 7px
const PX_PER_ROW_PT = 1.333;   // 1 pt 行高 ≈ 1.333px
const IMG_CELL_PADDING = 6;    // 图片与单元格边距（px）

// ========== 核心导出函数 ==========
async function generateExcelExport(entries) {
  if (typeof ExcelJS === 'undefined') throw new Error('ExcelJS 未加载');
  if (!entries || entries.length === 0) throw new Error('没有可导出的数据');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '研究报告底稿工具';
  workbook.created = new Date();

  // ===== 按 sheetName 分组 =====
  const groups = {};
  for (const entry of entries) {
    const name = entry.sheetName || '默认Sheet';
    if (!groups[name]) groups[name] = [];
    groups[name].push(entry);
  }

  // ===== 逐 Sheet 生成 =====
  const sheetNames = Object.keys(groups);
  for (const sheetName of sheetNames) {
    const sheetEntries = groups[sheetName];
    // ExcelJS 对 sheet 名称有长度和字符限制
    const safeName = sanitizeSheetName(sheetName);
    const ws = workbook.addWorksheet(safeName);

    // 定义列（4 列）
    ws.columns = [
      { header: '报告页码', key: 'pageNum', width: 14 },
      { header: '网页网址', key: 'url', width: 45 },
      { header: '网页截图', key: 'screenshot', width: 55 },
      { header: '备注', key: 'note', width: 28 },
    ];

    // 表头样式
    const headerRow = ws.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = HEADER_ALIGN;
      cell.border = BORDER;
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    // 追踪截图列最大宽度
    let maxImgColWidth = 30; // 默认最小列宽

    // ===== 写入数据行 =====
    for (let i = 0; i < sheetEntries.length; i++) {
      const entry = sheetEntries[i];
      const rowNum = i + 2; // 第 1 行是表头
      const row = ws.addRow({
        pageNum: entry.pageNum || '',
        url: {
          text: entry.url || '',
          hyperlink: entry.url || '',
          tooltip: entry.url || '',
        },
        screenshot: entry.screenshot ? '' : '[无截图]',
        note: entry.note || '',
      });

      // 单元格基础样式
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.border = BORDER;
        cell.font = { size: 10 };
        cell.alignment = {
          vertical: 'top',
          wrapText: colNum === 2 || colNum === 4,
        };
      });

      // 页码居中
      row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' };

      // 网址超链接样式
      row.getCell(2).font = { size: 10, color: { argb: 'FF0563C1' }, underline: true };

      // ===== 嵌入截图（优化显示） =====
      if (entry.screenshot) {
        try {
          const base64Data = getBase64Data(entry.screenshot);
          const imageBytes = base64ToUint8Array(base64Data);

          // 获取原始图片尺寸
          let imgW, imgH;
          try {
            const dims = await getImageDimensions(entry.screenshot);
            imgW = dims.width;
            imgH = dims.height;
          } catch {
            imgW = 1280; imgH = 720;
          }

          // 计算显示尺寸：在列宽上限内按原始比例尽量放大
          const maxDisplayWidth = Math.floor(MAX_COL_WIDTH * PX_PER_COL_UNIT) - IMG_CELL_PADDING * 2;
          const scale = Math.min(1, maxDisplayWidth / imgW);
          const displayW = Math.round(imgW * scale);
          const displayH = Math.round(imgH * scale);

          // 注册图片
          const imageId = workbook.addImage({
            buffer: imageBytes,
            extension: 'png',
          });

          // 定位图片到截图列（第 3 列, 0-based col=2）
          ws.addImage(imageId, {
            tl: { col: 2.01, row: rowNum - 1 + 0.01 },
            ext: { width: displayW, height: displayH },
            editAs: 'oneCell',
          });

          // 根据图片尺寸设置行高（px → pt）
          const neededRowHeight = (displayH + IMG_CELL_PADDING * 2) / PX_PER_ROW_PT;
          row.height = Math.max(neededRowHeight, 20);

          // 追踪截图列所需最大宽度
          const neededColWidth = (displayW + IMG_CELL_PADDING * 2) / PX_PER_COL_UNIT;
          maxImgColWidth = Math.max(maxImgColWidth, neededColWidth);

        } catch (imgErr) {
          console.warn(`[ExcelExport] 第 ${i + 1} 条截图嵌入失败:`, imgErr);
          row.getCell(3).value = '[截图嵌入失败]';
        }
      }
    }

    // ===== 应用截图列宽度 =====
    ws.getColumn(3).width = Math.min(MAX_COL_WIDTH, Math.ceil(maxImgColWidth));

    // 其他列宽微调
    ws.getColumn(1).width = 14;  // 报告页码
    ws.getColumn(2).width = 45;  // 网页网址
    ws.getColumn(4).width = 28;  // 备注
  }

  // ===== 生成文件 =====
  try {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filename = `研究报告底稿_${dateStr}_${timeStr}.xlsx`;

    chrome.runtime.sendMessage({
      action: 'excelExportComplete',
      url,
      filename,
    });

    return { success: true };
  } catch (err) {
    console.error('[ExcelExport] 文件生成失败:', err);
    return { success: false, error: 'Excel 文件生成失败: ' + err.message };
  }
}

/**
 * 清理 Sheet 名称（Excel 限制：最长 31 字符，不允许 \ / ? * [ ] : ）
 */
function sanitizeSheetName(name) {
  let safe = name.replace(/[\\/?*\[\]:]/g, '_').substring(0, 31);
  return safe || 'Sheet';
}
