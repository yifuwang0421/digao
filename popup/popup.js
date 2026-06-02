/**
 * Popup 核心交互逻辑
 * 负责：截图触发（可视区域 / 选区）、表单提交、数据暂存、列表管理、导出触发
 */

// ========== 状态 ==========
let currentScreenshot = null; // 当前截图 base64 数据

// ========== DOM 引用 ==========
const $ = (id) => document.getElementById(id);
const els = {
  btnCapture: $('btnCapture'),
  btnAreaCapture: $('btnAreaCapture'),
  screenshotStatus: $('screenshotStatus'),
  screenshotSize: $('screenshotSize'),
  screenshotPreview: $('screenshotPreview'),
  previewImage: $('previewImage'),
  inputSheetName: $('inputSheetName'),
  inputUrl: $('inputUrl'),
  inputPageNum: $('inputPageNum'),
  inputNote: $('inputNote'),
  btnSave: $('btnSave'),
  btnExport: $('btnExport'),
  btnClearAll: $('btnClearAll'),
  entriesList: $('entriesList'),
  entryCount: $('entryCount'),
  toast: $('toast'),
};

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // 绑定事件
  els.btnCapture.addEventListener('click', handleCapture);
  els.btnAreaCapture.addEventListener('click', handleAreaCapture);
  els.btnSave.addEventListener('click', handleSave);
  els.btnExport.addEventListener('click', handleExport);
  els.btnClearAll.addEventListener('click', handleClearAll);

  // 事件委托：条目列表内的删除按钮
  els.entriesList.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.btn-delete');
    if (deleteBtn) {
      const item = deleteBtn.closest('.entry-item');
      if (item) handleDelete(Number(item.dataset.id));
    }
  });

  // 监听来自 background 的选区截图结果
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'areaScreenshotResult' && msg.success) {
      receiveScreenshot(msg.data);
    }
  });

  // 检查是否有等待中的选区截图结果（用户关闭 popup 后又重新打开）
  try {
    const result = await chrome.storage.local.get(['pendingScreenshot', 'pendingScreenshotError']);
    if (result.pendingScreenshot) {
      receiveScreenshot(result.pendingScreenshot);
      await chrome.storage.local.remove(['pendingScreenshot', 'pendingScreenshotError']);
    } else if (result.pendingScreenshotError) {
      showToast('选区截图失败: ' + result.pendingScreenshotError, 'error');
      await chrome.storage.local.remove('pendingScreenshotError');
    }
  } catch (e) {
    // ignore
  }

  // 自动获取当前标签页信息
  await refreshTabInfo();

  // 恢复上次使用的 Sheet 名称
  try {
    const stored = localStorage.getItem('lastSheetName');
    if (stored) els.inputSheetName.value = stored;
  } catch (e) {
    // ignore
  }

  // 加载已有条目
  await renderEntries();
}

/**
 * 获取当前活动标签页信息并填充表单
 */
async function refreshTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      els.inputUrl.value = tab.url || '';
    }
  } catch (err) {
    console.warn('获取标签页信息失败:', err);
  }
}

/**
 * 接收截图数据（可视区域截图或选区截图共用）
 */
function receiveScreenshot(dataUrl) {
  currentScreenshot = dataUrl;

  els.previewImage.src = currentScreenshot;
  els.screenshotPreview.classList.remove('hidden');
  els.screenshotStatus.classList.remove('hidden');

  const sizeKB = Math.round((currentScreenshot.length * 0.75) / 1024);
  els.screenshotSize.textContent = `(${sizeKB} KB)`;
  els.btnSave.disabled = false;
  showToast('截图获取成功', 'success');
}

/**
 * 可视区域截图：调用 background captureVisibleTab
 */
async function handleCapture() {
  els.btnCapture.disabled = true;
  els.btnCapture.textContent = '⏳ 截图捕获中...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'captureScreenshot' });
    if (response.success) {
      receiveScreenshot(response.data);
    } else {
      showToast('截图失败: ' + (response.error || '未知错误'), 'error');
    }
  } catch (err) {
    showToast('截图异常: ' + err.message, 'error');
  } finally {
    els.btnCapture.disabled = false;
    els.btnCapture.textContent = '📸 截取可视区域';
  }
}

/**
 * 选区截图：
 * 1. 通知 background 注入 content script
 * 2. Popup 关闭（用户可在页面上拖拽选区）
 * 3. 截图结果存入 chrome.storage.local
 * 4. 用户重新打开 Popup 时自动恢复
 */
async function handleAreaCapture() {
  els.btnAreaCapture.disabled = true;
  els.btnAreaCapture.textContent = '⏳ 启动选区...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'startAreaScreenshot' });
    if (response.success) {
      // 关闭 popup，让用户在页面上操作
      window.close();
    } else {
      showToast('选区截图启动失败: ' + (response.error || ''), 'error');
      els.btnAreaCapture.disabled = false;
      els.btnAreaCapture.textContent = '✂️ 选区截图';
    }
  } catch (err) {
    showToast('选区截图异常: ' + err.message, 'error');
    els.btnAreaCapture.disabled = false;
    els.btnAreaCapture.textContent = '✂️ 选区截图';
  }
}

/**
 * 保存底稿条目到 IndexedDB
 */
async function handleSave() {
  const pageNum = els.inputPageNum.value.trim();
  if (!pageNum) {
    showToast('请填写报告页码', 'error');
    els.inputPageNum.focus();
    return;
  }

  if (!currentScreenshot) {
    showToast('请先截取网页', 'error');
    return;
  }

  const sheetName = els.inputSheetName.value.trim() || '默认Sheet';

  const entry = {
    url: els.inputUrl.value.trim(),
    pageNum,
    note: els.inputNote.value.trim(),
    screenshot: currentScreenshot,
    sheetName,
    timestamp: new Date().toISOString(),
  };

  try {
    await dbAdd(entry);

    // 记住 Sheet 名称
    try {
      localStorage.setItem('lastSheetName', sheetName);
    } catch (e) { /* ignore */ }

    // 重置表单状态
    currentScreenshot = null;
    els.inputPageNum.value = '';
    els.inputNote.value = '';
    els.screenshotPreview.classList.add('hidden');
    els.screenshotStatus.classList.add('hidden');
    els.btnSave.disabled = true;

    // 刷新标签页信息
    await refreshTabInfo();
    // 刷新列表
    await renderEntries();

    showToast('底稿条目已保存', 'success');
  } catch (err) {
    showToast('保存失败: ' + err.message, 'error');
  }
}

/**
 * 导出所有条目为 Excel 文件
 */
async function handleExport() {
  try {
    const entries = await dbGetAll();
    if (entries.length === 0) {
      showToast('暂无数据可导出', 'error');
      return;
    }

    els.btnExport.disabled = true;
    els.btnExport.textContent = '⏳ 生成 Excel 中...';

    const response = await chrome.runtime.sendMessage({
      action: 'exportExcel',
      entries,
    });

    if (response.success) {
      showToast('Excel 底稿已开始下载', 'success');
    } else {
      showToast('导出失败: ' + (response.error || '请检查是否已运行 setup.ps1'), 'error');
    }
  } catch (err) {
    showToast('导出异常: ' + err.message, 'error');
  } finally {
    els.btnExport.disabled = false;
    els.btnExport.textContent = '📊 导出 Excel 底稿';
  }
}

/**
 * 清空所有条目
 */
async function handleClearAll() {
  if (!confirm('确定要清空所有底稿条目吗？此操作不可撤销。')) return;
  try {
    await dbClear();
    await renderEntries();
    showToast('所有条目已清空', 'info');
  } catch (err) {
    showToast('清空失败: ' + err.message, 'error');
  }
}

/**
 * 删除单条记录
 */
async function handleDelete(id) {
  if (!confirm('确定删除此条目？')) return;
  try {
    await dbDelete(id);
    await renderEntries();
    showToast('条目已删除', 'info');
  } catch (err) {
    showToast('删除失败: ' + err.message, 'error');
  }
}

/**
 * 渲染条目列表
 */
async function renderEntries() {
  const entries = await dbGetAll();

  els.entryCount.textContent = entries.length;
  els.btnClearAll.disabled = entries.length === 0;

  if (entries.length === 0) {
    els.entriesList.innerHTML = `
      <div class="empty-state">
        <p>📭 暂无底稿条目</p>
        <p class="hint">点击截图按钮开始采集</p>
      </div>`;
    return;
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  els.entriesList.innerHTML = sorted
    .map(
      (entry) => `
    <div class="entry-item" data-id="${entry.id}">
      <div class="entry-header">
        <span class="entry-page">${escapeHtml(entry.pageNum)}</span>
        <span class="entry-time">${formatTime(entry.timestamp)}</span>
      </div>
      ${entry.sheetName ? `<div class="entry-sheet">📂 ${escapeHtml(entry.sheetName)}</div>` : ''}
      <div class="entry-url" title="${escapeHtml(entry.url)}">${escapeHtml(entry.url)}</div>
      ${entry.note ? `<div class="entry-note">${escapeHtml(entry.note)}</div>` : ''}
      <div class="entry-footer">
        <div class="entry-tags">
          ${entry.screenshot ? '<span class="tag tag-screenshot">📸 有截图</span>' : '<span class="tag tag-no-screenshot">无截图</span>'}
        </div>
        <button class="btn-delete">删除</button>
      </div>
    </div>`
    )
    .join('');
}



// ========== 工具函数 ==========
function formatTime(isoStr) {
  const d = new Date(isoStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  els.toast.textContent = message;
  els.toast.className = `toast toast-${type}`;
  els.toast.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 3000);
}

// ========== IndexedDB 操作 ==========
const DB_NAME = 'ResearchReportDraft';
const DB_VERSION = 2;
const STORE_NAME = 'entries';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(new Error('打开数据库失败'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      // v2 无需结构变更，sheetName 在 add 时自动存储
    };
  });
}

async function dbAdd(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function dbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
