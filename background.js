/**
 * Background Service Worker
 * 负责：截图 API 调用、选区截图协调、Offscreen Document 管理、裁剪、导出流程、下载触发
 */

// ========== 选区截图 Promise 管理 ==========
let areaScreenshotResolve = null;

// ========== Offscreen Document 管理 ==========
async function ensureOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    if (existing.length > 0) return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Generate Excel / crop images using Canvas & ExcelJS',
    });
  } catch (err) {
    if (!err.message?.includes('already exists')) throw err;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await ensureOffscreenDocument();
  } catch (err) {
    console.warn('[SW] Offscreen init failed:', err);
  }
});

ensureOffscreenDocument().catch((err) =>
  console.warn('[SW] Offscreen startup failed:', err)
);

// ========== 消息路由 ==========
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'captureScreenshot':
      handleCaptureScreenshot().then(sendResponse);
      return true;

    case 'startAreaScreenshot':
      handleStartAreaScreenshot(sender).then(sendResponse);
      return true;

    case 'areaSelectionResult':
      handleAreaSelectionResult(message.coords, sender)
        .then(() => sendResponse({ received: true }))
        .catch((err) => {
          console.error('[SW] areaSelectionResult error:', err);
          sendResponse({ received: false, error: err.message });
        });
      return true;

    case 'areaSelectionCancelled':
      handleAreaSelectionCancelled();
      sendResponse({ received: true });
      return false;

    case 'cropImage':
      // 仅 offscreen document 处理此消息，service worker 忽略
      return false;

    case 'cropComplete':
      // offscreen 回调裁剪结果
      if (self._cropResolve) self._cropResolve(message.dataUrl);
      sendResponse({ received: true });
      return false;

    case 'exportExcel':
      handleExportExcel(message.entries).then(sendResponse);
      return true;

    case 'excelExportComplete':
      handleExcelExportComplete(message);
      sendResponse({ received: true });
      return false;
  }
});

// ========== 可视区域截图 ==========
async function handleCaptureScreenshot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { success: false, error: '无法获取当前标签页' };
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('edge://')) {
      return { success: false, error: '无法对浏览器内部页面截图' };
    }
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 });
    return { success: true, data: dataUrl };
  } catch (err) {
    return { success: false, error: err.message || '截图 API 调用失败' };
  }
}

// ========== 选区截图 ==========
async function handleStartAreaScreenshot(sender) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { success: false, error: '无法获取当前标签页' };

    // 注入 content script（如果尚未注入）
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-select.js'],
      });
    } catch (e) {
      // 可能已经注入过了，忽略
    }

    // 设置 Promise 等待选区结果
    return new Promise((resolve) => {
      areaScreenshotResolve = resolve;
      // 返回成功，popup 将自行关闭
      resolve({ success: true });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleAreaSelectionResult(coords, sender) {
  try {
    console.log('[SW] 收到选区坐标:', JSON.stringify(coords));

    // 等待 content script 自行移除选区 UI（content script 在 confirm 时已立即 cleanup）
    await new Promise((r) => setTimeout(r, 300));

    // 截取可视区域
    console.log('[SW] 开始 captureVisibleTab...');
    const fullDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 });
    console.log('[SW] captureVisibleTab 成功, 数据长度:', fullDataUrl?.length);

    // 使用 offscreen document canvas 裁剪
    console.log('[SW] 开始裁剪...');
    const croppedDataUrl = await cropImageInOffscreen(fullDataUrl, coords);
    console.log('[SW] 裁剪完成, 数据长度:', croppedDataUrl?.length);

    // 存储到 chrome.storage.local 供 popup 重新打开时读取
    await chrome.storage.local.set({ pendingScreenshot: croppedDataUrl });
    console.log('[SW] 已存入 pendingScreenshot');

    // 同时尝试直接通知 popup（如果仍然打开）
    try {
      chrome.runtime.sendMessage({ action: 'areaScreenshotResult', success: true, data: croppedDataUrl });
    } catch (e) {
      // popup 可能已关闭，忽略
    }
  } catch (err) {
    console.error('[SW] 选区截图处理失败:', err);
    // 将错误信息也存入 storage，方便 popup 端诊断
    try {
      await chrome.storage.local.set({ pendingScreenshotError: err.message });
    } catch (e) { /* ignore */ }
  } finally {
    if (areaScreenshotResolve) {
      areaScreenshotResolve = null;
    }
  }
}

function handleAreaSelectionCancelled() {
  if (areaScreenshotResolve) {
    areaScreenshotResolve = null;
  }
}

// ========== 图片裁剪（通过 Offscreen Document Canvas） ==========
async function cropImageInOffscreen(fullDataUrl, coords) {
  await ensureOffscreenDocument();
  // 等待 offscreen document 脚本注册消息监听器
  await new Promise((r) => setTimeout(r, 200));

  return new Promise((resolve) => {
    self._cropResolve = resolve;

    chrome.runtime.sendMessage({
      action: 'cropImage',
      dataUrl: fullDataUrl,
      crop: {
        x: coords.x,
        y: coords.y,
        width: coords.width,
        height: coords.height,
        devicePixelRatio: coords.devicePixelRatio,
      },
    }).catch((err) => {
      console.warn('[SW] cropImage sendMessage failed:', err);
    });

    // 超时保护（降级为未裁剪全图）
    setTimeout(() => {
      if (self._cropResolve) {
        console.warn('[SW] cropImage 超时，降级返回全图');
        self._cropResolve = null;
        resolve(fullDataUrl);
      }
    }, 15000);
  });
}

// ========== Excel 导出 ==========
async function handleExportExcel(entries) {
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({ action: 'generateExcel', entries });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || '导出处理失败' };
  }
}

async function handleExcelExportComplete(message) {
  if (message.error) {
    console.error('[SW] Excel 生成失败:', message.error);
    return;
  }
  try {
    await chrome.downloads.download({
      url: message.url,
      filename: message.filename,
      saveAs: true,
      conflictAction: 'uniquify',
    });
    setTimeout(async () => {
      try { await chrome.offscreen.closeDocument(); } catch (e) {}
    }, 5000);
  } catch (err) {
    console.error('[SW] 下载触发失败:', err);
  }
}
