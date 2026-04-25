(() => {
  const SCRIPT_VERSION = 'v4-sentence';
  if (window.__screenOcrContentScriptLoaded === SCRIPT_VERSION) return;
  window.__screenOcrContentScriptLoaded = SCRIPT_VERSION;
  console.log('[OCR content] script', SCRIPT_VERSION, 'loaded on', location.href);

  const OVERLAY_ID = 'screen-ocr-overlay';
  const TOOLTIP_ID = 'screen-ocr-tooltip';

  let overlay = null;
  let selectionBox = null;
  let hintEl = null;
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let currentRect = null;

  function removeOverlay() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
    selectionBox = null;
    hintEl = null;
    isDragging = false;
    currentRect = null;
    document.removeEventListener('keydown', onKeydown, true);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      removeOverlay();
    }
  }

  function startSelection() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('data-ocr-overlay', '');

    const dim = document.createElement('div');
    dim.className = 'ocr-dim';
    overlay.appendChild(dim);

    selectionBox = document.createElement('div');
    selectionBox.className = 'ocr-selection';
    selectionBox.style.display = 'none';
    overlay.appendChild(selectionBox);

    hintEl = document.createElement('div');
    hintEl.className = 'ocr-hint';
    hintEl.textContent = '拖动鼠标框选英文单词  ·  按 ESC 取消';
    overlay.appendChild(hintEl);

    document.documentElement.appendChild(overlay);
    document.addEventListener('keydown', onKeydown, true);

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    selectionBox.style.display = 'block';
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    if (hintEl) hintEl.style.opacity = '0';
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    selectionBox.style.left = x + 'px';
    selectionBox.style.top = y + 'px';
    selectionBox.style.width = w + 'px';
    selectionBox.style.height = h + 'px';
    currentRect = { x, y, w, h };
  }

  function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;
    e.preventDefault();

    if (!currentRect || currentRect.w < 5 || currentRect.h < 5) {
      removeOverlay();
      return;
    }

    const rect = currentRect;
    const dpr = window.devicePixelRatio || 1;

    overlay.style.pointerEvents = 'none';
    selectionBox.classList.add('loading');

    const loadingTip = document.createElement('div');
    loadingTip.className = 'ocr-loading-tip';
    loadingTip.textContent = '🔍 辨识中…';
    loadingTip.style.left = rect.x + 'px';
    loadingTip.style.top = rect.y + rect.h + 8 + 'px';
    overlay.appendChild(loadingTip);

    chrome.runtime.sendMessage(
      {
        type: 'ocr-region-selected',
        rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
        dpr,
      },
      (response) => {
        removeOverlay();
        console.log('[OCR content] got response', response);
        if (chrome.runtime.lastError) {
          showTooltip(rect, { error: chrome.runtime.lastError.message });
          return;
        }
        showTooltip(rect, response || { error: 'UNKNOWN' });
      }
    );
  }

  function showTooltip(rect, data) {
    const existing = document.getElementById(TOOLTIP_ID);
    if (existing) existing.remove();

    const tip = document.createElement('div');
    tip.id = TOOLTIP_ID;
    tip.setAttribute('data-ocr-tooltip', '');

    if (data.error) {
      tip.innerHTML = `
        <div class="ocr-tip-body ocr-tip-error">
          <div class="ocr-tip-title">⚠️ ${escapeHtml(errorMessage(data.error))}</div>
          ${data.detail ? `<div class="ocr-tip-hint">${escapeHtml(data.detail)}</div>` : ''}
          <button class="ocr-tip-close">关闭</button>
        </div>
      `;
      document.documentElement.appendChild(tip);
      positionTip(tip, rect);
      attachClose(tip);
      attachAutoFade(tip, 8000);
      return;
    }

    const text = data.text || '';
    const translation = data.translation || '';
    const words = Array.isArray(data.words) ? data.words : [];
    console.log('[OCR content] rendering tooltip', { textLen: text.length, translationLen: translation.length, chipCount: words.length });

    tip.innerHTML = `
      <div class="ocr-tip-body ocr-tip-sentence">
        <div class="ocr-tip-section">
          <div class="ocr-tip-label">原文</div>
          <div class="ocr-tip-original">${escapeHtml(text)}</div>
        </div>
        <div class="ocr-tip-section">
          <div class="ocr-tip-label">翻译</div>
          <div class="ocr-tip-translation">${escapeHtml(translation)}</div>
        </div>
        <div class="ocr-tip-section">
          <div class="ocr-tip-label">点菜单词加入生词本</div>
          <div class="ocr-tip-chips"></div>
        </div>
        <div class="ocr-tip-footer">
          <span class="ocr-tip-hint-small">点击词汇→自动翻译并收藏</span>
          <button class="ocr-tip-close" title="关闭">×</button>
        </div>
        <div class="ocr-tip-detail" style="display:none;"></div>
      </div>
    `;

    const chipsBox = tip.querySelector('.ocr-tip-chips');
    for (const item of words) {
      const chip = document.createElement('button');
      chip.className = 'ocr-chip' + (item.alreadySaved ? ' saved' : '');
      chip.dataset.word = item.word;
      chip.dataset.state = item.alreadySaved ? 'saved' : 'idle';
      chip.innerHTML = `<span class="ocr-chip-text">${escapeHtml(item.word)}</span><span class="ocr-chip-mark">${item.alreadySaved ? '✓' : '+'}</span>`;
      chip.title = item.alreadySaved ? '已在生词本（点击更新）' : '点击加入生词本';
      chipsBox.appendChild(chip);
    }

    document.documentElement.appendChild(tip);
    positionTip(tip, rect);
    attachClose(tip);

    chipsBox.addEventListener('click', (e) => {
      const chip = e.target.closest('.ocr-chip');
      if (!chip) return;
      e.preventDefault();
      e.stopPropagation();
      handleChipClick(chip, tip);
    });

    let lingerTimer = setTimeout(() => {
      tip.classList.add('fade-out');
      setTimeout(() => tip.remove(), 300);
    }, 30000);
    tip.addEventListener('mouseenter', () => clearTimeout(lingerTimer), { once: true });
  }

  function attachClose(tip) {
    const closeBtn = tip.querySelector('.ocr-tip-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        tip.remove();
      });
    }
  }

  function attachAutoFade(tip, ms) {
    const t = setTimeout(() => {
      tip.classList.add('fade-out');
      setTimeout(() => tip.remove(), 300);
    }, ms);
    tip.addEventListener('mouseenter', () => clearTimeout(t), { once: true });
  }

  function positionTip(tip, rect) {
    const initial = { left: rect.x, top: rect.y + rect.h + 8 };
    tip.style.left = initial.left + 'px';
    tip.style.top = initial.top + 'px';
    requestAnimationFrame(() => {
      const bounds = tip.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let { left, top } = initial;
      if (left + bounds.width > vw - 10) left = Math.max(10, vw - bounds.width - 10);
      if (top + bounds.height > vh - 10) top = Math.max(10, rect.y - bounds.height - 8);
      if (top < 10) top = 10;
      if (left < 10) left = 10;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    });
  }

  function handleChipClick(chip, tip) {
    if (chip.dataset.state === 'loading') return;
    const word = chip.dataset.word;
    chip.dataset.state = 'loading';
    chip.classList.add('loading');
    const mark = chip.querySelector('.ocr-chip-mark');
    if (mark) mark.textContent = '…';

    chrome.runtime.sendMessage({ type: 'lookup-and-save-word', word }, (response) => {
      if (chrome.runtime.lastError || !response || response.error) {
        chip.classList.remove('loading');
        chip.classList.add('failed');
        chip.dataset.state = 'failed';
        if (mark) mark.textContent = '!';
        const errCode = response?.error || chrome.runtime.lastError?.message || 'UNKNOWN';
        chip.title = '加入失败：' + errorMessage(errCode);
        showDetail(tip, { error: errCode, word });
        setTimeout(() => {
          chip.classList.remove('failed');
          chip.dataset.state = 'idle';
          if (mark) mark.textContent = '+';
          chip.title = '点击加入生词本';
        }, 3500);
        return;
      }
      chip.classList.remove('loading');
      chip.classList.add('saved');
      chip.dataset.state = 'saved';
      if (mark) mark.textContent = '✓';
      chip.title = (response.isDuplicate ? '已更新：' : '已加入：') + (response.translation || '');
      showDetail(tip, response);
    });
  }

  function showDetail(tip, data) {
    const box = tip.querySelector('.ocr-tip-detail');
    if (!box) return;
    if (data.error) {
      box.innerHTML = `<div class="ocr-tip-detail-error">⚠️ ${escapeHtml(data.word || '')}：${escapeHtml(errorMessage(data.error))}</div>`;
      box.style.display = 'block';
      return;
    }
    const word = data.word || '';
    const translation = data.translation || '';
    const pos = data.partOfSpeech || '';
    const example = data.example || '';
    const exampleTrans = data.exampleTranslation || '';
    const status = data.isDuplicate ? '↻ 已更新' : '✓ 已加入生词本';
    box.innerHTML = `
      <div class="ocr-tip-detail-head">
        <span class="ocr-tip-detail-word">${escapeHtml(word)}</span>
        <span class="ocr-tip-detail-status">${status}</span>
      </div>
      <div class="ocr-tip-detail-meta">
        <span class="ocr-tip-trans">${escapeHtml(translation)}</span>
        ${pos ? `<span class="ocr-tip-pos">${escapeHtml(pos)}</span>` : ''}
      </div>
      ${example ? `
        <div class="ocr-tip-example">
          <div>"${escapeHtml(example)}"</div>
          ${exampleTrans ? `<div class="ocr-tip-example-trans">${escapeHtml(exampleTrans)}</div>` : ''}
        </div>
      ` : ''}
    `;
    box.style.display = 'block';
  }

  function errorMessage(code) {
    switch (code) {
      case 'MISSING_API_KEY':
        return '请先到设定页输入 Gemini API Key';
      case 'INVALID_API_KEY':
        return 'API Key 无效，请确认设定';
      case 'NETWORK_ERROR':
        return '网络错误';
      case 'RATE_LIMITED':
        return '已达 Gemini 免费配额，请稍候 1 分钟或换模型';
      case 'SERVER_BUSY':
        return 'Gemini 服务器忙碌，请稍后再试';
      case 'NOT_A_WORD':
        return '这不是一个有效的英文单词';
      case 'OCR_NO_WORD':
        return 'OCR 没有辨识到英文单词';
      case 'OCR_FAILED':
        return 'OCR 辨识失败';
      case 'MODEL_NOT_FOUND':
        return '所有模型都不可用（可能地区或 API 未启用）';
      case 'EMPTY_RESPONSE':
      case 'PARSE_ERROR':
        return 'Gemini 回应解析失败';
      default:
        if (typeof code === 'string' && code.startsWith('API_ERROR')) {
          return 'Gemini API 错误';
        }
        return '未知错误';
    }
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'start-selection') {
      startSelection();
      sendResponse({ ok: true });
    } else if (msg.type === 'cancel-selection') {
      removeOverlay();
      sendResponse({ ok: true });
    }
    return false;
  });
})();
