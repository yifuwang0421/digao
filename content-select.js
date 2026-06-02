/**
 * Content Script - 自由选区截图
 * 在网页上叠加选区 UI，用户拖拽框选目标区域
 */
(function () {
  'use strict';
  if (window.__rsAreaSelect) return;
  window.__rsAreaSelect = true;

  // ========== 注入样式 ==========
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    #rs-select-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: 2147483647; cursor: crosshair;
      background: rgba(0,0,0,0.25);
      user-select: none; -webkit-user-select: none;
    }
    #rs-select-rect {
      position: fixed; border: 2px dashed #fff;
      box-shadow: 0 0 0 9999px rgba(0,0,0,0.3);
      background: rgba(59,80,201,0.06);
      pointer-events: none; display: none; z-index: 2147483647;
    }
    #rs-select-hint {
      position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.8); color: #fff;
      padding: 8px 18px; border-radius: 8px; font-size: 14px;
      font-family: -apple-system, "Microsoft YaHei", sans-serif;
      z-index: 2147483647; pointer-events: none; white-space: nowrap;
    }
    #rs-select-dims {
      position: fixed; background: rgba(59,80,201,0.92); color: #fff;
      padding: 2px 8px; border-radius: 4px; font-size: 12px;
      font-family: Consolas, Monaco, monospace;
      z-index: 2147483647; pointer-events: none; display: none;
    }
    #rs-select-toolbar {
      position: fixed; display: none; gap: 6px; z-index: 2147483647;
    }
    .rs-tb-btn {
      padding: 5px 14px; border: none; border-radius: 5px;
      font-size: 13px; cursor: pointer;
      font-family: -apple-system, "Microsoft YaHei", sans-serif;
      transition: filter .15s;
    }
    .rs-tb-btn:hover { filter: brightness(1.1); }
    .rs-tb-ok { background: #16a34a; color: #fff; }
    .rs-tb-no { background: #ef4444; color: #fff; }
    /* 十字准星辅助线 */
    #rs-crosshair-h, #rs-crosshair-v {
      position: fixed; background: rgba(255,255,255,0.35);
      pointer-events: none; z-index: 2147483647; display: none;
    }
    #rs-crosshair-h { height: 1px; left: 0; width: 100vw; }
    #rs-crosshair-v { width: 1px; top: 0; height: 100vh; }
  `;
  document.head.appendChild(styleEl);

  // ========== 创建 DOM 元素 ==========
  const overlay = document.createElement('div');
  overlay.id = 'rs-select-overlay';

  const selRect = document.createElement('div');
  selRect.id = 'rs-select-rect';

  const hint = document.createElement('div');
  hint.id = 'rs-select-hint';
  hint.textContent = '拖拽鼠标框选截图区域  ·  Esc 取消';

  const dimsLabel = document.createElement('div');
  dimsLabel.id = 'rs-select-dims';

  const crossH = document.createElement('div');
  crossH.id = 'rs-crosshair-h';
  const crossV = document.createElement('div');
  crossV.id = 'rs-crosshair-v';

  const toolbar = document.createElement('div');
  toolbar.id = 'rs-select-toolbar';

  const btnOk = document.createElement('button');
  btnOk.className = 'rs-tb-btn rs-tb-ok';
  btnOk.textContent = '✓ 确认截图';

  const btnNo = document.createElement('button');
  btnNo.className = 'rs-tb-btn rs-tb-no';
  btnNo.textContent = '✕ 取消 (Esc)';

  toolbar.appendChild(btnOk);
  toolbar.appendChild(btnNo);

  document.body.appendChild(overlay);
  document.body.appendChild(selRect);
  document.body.appendChild(hint);
  document.body.appendChild(dimsLabel);
  document.body.appendChild(crossH);
  document.body.appendChild(crossV);
  document.body.appendChild(toolbar);

  // ========== 状态 ==========
  let startX = 0, startY = 0;
  let endX = 0, endY = 0;
  let isDragging = false;
  let hasSelection = false;
  const dpr = window.devicePixelRatio || 1;

  // ========== 鼠标事件 ==========
  function onMouseMove(e) {
    // 十字准星
    crossH.style.top = e.clientY + 'px';
    crossH.style.display = 'block';
    crossV.style.left = e.clientX + 'px';
    crossV.style.display = 'block';

    if (!isDragging) return;

    endX = e.clientX;
    endY = e.clientY;
    updateSelection();
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    endX = startX;
    endY = startY;
    hasSelection = false;
    toolbar.style.display = 'none';
    selRect.style.display = 'block';
    updateSelection();
  }

  function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;

    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);

    if (w > 10 && h > 10) {
      hasSelection = true;
      showToolbar();
      crossH.style.display = 'none';
      crossV.style.display = 'none';
    } else {
      selRect.style.display = 'none';
    }
  }

  function updateSelection() {
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);

    selRect.style.left = x + 'px';
    selRect.style.top = y + 'px';
    selRect.style.width = w + 'px';
    selRect.style.height = h + 'px';

    if (w > 5 || h > 5) {
      dimsLabel.textContent = `${Math.round(w)} × ${Math.round(h)} px`;
      dimsLabel.style.display = 'block';
      dimsLabel.style.left = (x + w / 2 - 40) + 'px';
      dimsLabel.style.top = (y + h + 6) + 'px';
    }
  }

  function showToolbar() {
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);

    toolbar.style.display = 'flex';

    let tx = x + w - 180;
    let ty = y + h + 10;
    if (ty + 40 > window.innerHeight) ty = y - 44;
    if (tx < 4) tx = 4;
    toolbar.style.left = tx + 'px';
    toolbar.style.top = ty + 'px';
  }

  function getCoords() {
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    return {
      x: x, y: y,
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY),
      devicePixelRatio: dpr,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
  }

  // ========== 确认 / 取消 ==========
  function confirmSelection() {
    if (!hasSelection) return;
    const coords = getCoords();
    // 立即移除选区 UI（确保 captureVisibleTab 不会截到遮罩层）
    cleanup();
    // 发送坐标给 background 进行截图+裁剪
    chrome.runtime.sendMessage({ action: 'areaSelectionResult', coords });
  }

  function cancelSelection() {
    chrome.runtime.sendMessage({ action: 'areaSelectionCancelled' });
    cleanup();
  }

  function cleanup() {
    [overlay, selRect, hint, dimsLabel, crossH, crossV, toolbar, styleEl].forEach(
      (el) => el && el.parentNode && el.parentNode.removeChild(el)
    );
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.__rsAreaSelect = false;
  }

  // 监听 background 发来的移除指令
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'hideSelectOverlay') {
      cleanup();
    }
  });

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); cancelSelection(); }
    if (e.key === 'Enter' && hasSelection) { e.preventDefault(); confirmSelection(); }
  }

  // ========== 绑定事件 ==========
  overlay.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('mouseup', onMouseUp, true);
  document.addEventListener('keydown', onKeyDown, true);
  btnOk.addEventListener('click', (e) => { e.stopPropagation(); confirmSelection(); });
  btnNo.addEventListener('click', (e) => { e.stopPropagation(); cancelSelection(); });
})();
