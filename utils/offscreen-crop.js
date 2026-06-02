/**
 * Offscreen Document - 图片裁剪处理
 * 使用 Canvas API 对截图进行区域裁剪
 * 运行在 Offscreen Document 上下文中（具有 DOM/Canvas API）
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'cropImage') {
    console.log('[OffscreenCrop] 收到裁剪请求:', message.crop);
    cropImage(message.dataUrl, message.crop)
      .then((dataUrl) => {
        console.log('[OffscreenCrop] 裁剪成功, 数据长度:', dataUrl?.length);
        chrome.runtime.sendMessage({ action: 'cropComplete', dataUrl });
        sendResponse({ success: true });
      })
      .catch((err) => {
        console.error('[OffscreenCrop] 裁剪失败:', err);
        // 降级：返回原图
        chrome.runtime.sendMessage({ action: 'cropComplete', dataUrl: message.dataUrl });
        sendResponse({ success: false, error: err.message });
      });
    return true; // 异步
  }
});

/**
 * 使用 Canvas 裁剪图片
 * @param {string} dataUrl - 完整截图的 data URL
 * @param {Object} crop - 裁剪参数 { x, y, width, height, devicePixelRatio }
 * @returns {Promise<string>} 裁剪后的 data URL
 */
async function cropImage(dataUrl, crop) {
  const dpr = crop.devicePixelRatio || 1;

  // 加载图片
  const img = await loadImage(dataUrl);

  // 计算实际像素坐标（CSS 像素 × devicePixelRatio）
  const sx = Math.round(crop.x * dpr);
  const sy = Math.round(crop.y * dpr);
  const sw = Math.round(crop.width * dpr);
  const sh = Math.round(crop.height * dpr);

  // 创建裁剪画布
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');

  // 绘制裁剪区域
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return canvas.toDataURL('image/png');
}

/**
 * 加载图片为 Image 对象
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}
