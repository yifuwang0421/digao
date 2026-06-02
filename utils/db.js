/**
 * IndexedDB 工具模块
 * 提供底稿条目的 CRUD 操作
 *
 * 注意：当前 popup.js 已内联了 IndexedDB 操作以避免模块加载问题。
 * 此文件可作为独立模块在需要时被 content script 或 background 引用。
 *
 * 数据库名: ResearchReportDraft
 * 对象仓库: entries
 * 主键: id (自增)
 *
 * 条目数据结构 (v2):
 * {
 *   url: string,        // 网页网址
 *   pageNum: string,    // 报告页码
 *   note: string,       // 备注说明
 *   screenshot: string, // 截图 data URL (base64)
 *   sheetName: string,  // Excel Sheet 分组名称
 *   timestamp: string,  // ISO 时间戳
 * }
 */

const DB_NAME = 'ResearchReportDraft';
const DB_VERSION = 2;
const STORE_NAME = 'entries';

/**
 * 打开 IndexedDB 数据库连接
 * 首次打开时自动创建对象仓库
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(new Error('打开数据库失败: ' + request.error));

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
    };
  });
}

/**
 * 添加一条底稿条目
 * @param {Object} entry - 条目数据 { url, pageNum, note, screenshot, sheetName, timestamp }
 * @returns {Promise<number>} 新条目的 ID
 */
async function addEntry(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 获取所有底稿条目
 * @returns {Promise<Array>} 所有条目数组
 */
async function getAllEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 根据 ID 获取单条条目
 * @param {number} id - 条目 ID
 * @returns {Promise<Object>} 条目数据
 */
async function getEntry(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 更新条目
 * @param {Object} entry - 包含 id 的完整条目数据
 */
async function updateEntry(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * 删除指定条目
 * @param {number} id - 条目 ID
 */
async function deleteEntry(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * 清空所有条目
 */
async function clearEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * 获取条目总数
 * @returns {Promise<number>} 条目数量
 */
async function countEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 导出（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    openDB,
    addEntry,
    getAllEntries,
    getEntry,
    updateEntry,
    deleteEntry,
    clearEntries,
    countEntries,
  };
}
