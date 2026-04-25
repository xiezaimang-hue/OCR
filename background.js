import { getApiKey, getModel, saveWord, getWords } from './lib/storage.js';
import { lookupWordWithFallback, translateSentenceWithFallback } from './lib/gemini.js';

const OFFSCREEN_URL = 'offscreen/offscreen.html';
const CONTEXT_MENU_ID = 'screen-ocr-activate';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: '啟用 OCR 選取',
    contexts: ['page', 'image', 'selection', 'frame'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && tab?.id) {
    await startSelection(tab.id);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'activate-ocr') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await startSelection(tab.id);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ocr-region-selected' && sender.tab?.id) {
    handleOcrRequest(sender.tab.id, sender.tab.windowId, msg.rect, msg.dpr)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }

  if (msg.type === 'start-ocr-from-popup' && msg.tabId) {
    startSelection(msg.tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === 'lookup-and-save-word' && msg.word) {
    handleLookupAndSave(msg.word)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }

  return false;
});

async function startSelection(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'start-selection' });
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/content.js'],
      });
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['content/content.css'],
      });
      await chrome.tabs.sendMessage(tabId, { type: 'start-selection' });
    } catch (err) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      const isRestricted =
        tab && /^(chrome|chrome-extension|edge|about):/.test(tab.url || '');
      if (isRestricted) {
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Screen OCR',
          message: '此頁面不允許擴充功能執行（例如 chrome:// 或擴充頁面），請切換到一般網頁再試。',
        });
      } else {
        console.error('[OCR] inject failed', err);
      }
    }
  }
}

async function handleOcrRequest(tabId, windowId, rect, dpr) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { error: 'MISSING_API_KEY' };
  }

  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  } catch (e) {
    return { error: 'CAPTURE_FAILED', detail: e.message };
  }

  let croppedDataUrl;
  try {
    croppedDataUrl = await cropImage(dataUrl, rect, dpr);
  } catch (e) {
    return { error: 'CROP_FAILED', detail: e.message };
  }

  await ensureOffscreen();

  let text = '';
  let words = [];
  try {
    const ocrResult = await sendToOffscreen({ type: 'ocr', imageDataUrl: croppedDataUrl });
    if (ocrResult.error) {
      return { error: 'OCR_FAILED', detail: ocrResult.error };
    }
    text = ocrResult.text || '';
    words = Array.isArray(ocrResult.words) ? ocrResult.words : [];
  } catch (e) {
    return { error: 'OCR_FAILED', detail: e.message };
  }

  console.log('[OCR bg] OCR result', { textLength: text.length, wordCount: words.length, preview: text.slice(0, 120) });

  if (!text || words.length === 0) {
    return { error: 'OCR_NO_WORD' };
  }

  const model = await getModel();
  const existingWords = await getWords();
  const existingSet = new Set(existingWords.map((w) => w.word.toLowerCase()));

  let translation = '';
  let modelUsed = model;
  try {
    const out = await translateSentenceWithFallback(text, apiKey, model);
    translation = out.translation;
    modelUsed = out.modelUsed;
  } catch (e) {
    return { error: e.message || 'LOOKUP_FAILED' };
  }

  return {
    text,
    translation,
    words: words.map((w) => ({ word: w, alreadySaved: existingSet.has(w) })),
    modelUsed,
  };
}

async function handleLookupAndSave(word) {
  const apiKey = await getApiKey();
  if (!apiKey) return { error: 'MISSING_API_KEY' };

  const model = await getModel();
  let lookup;
  let modelUsed = model;
  try {
    const out = await lookupWordWithFallback(word, apiKey, model);
    lookup = out.result;
    modelUsed = out.modelUsed;
  } catch (e) {
    return { error: e.message || 'LOOKUP_FAILED' };
  }

  const existingWords = await getWords();
  const isDuplicate = existingWords.some(
    (w) => w.word.toLowerCase() === (lookup.word || word).toLowerCase()
  );

  await saveWord({
    word: lookup.word || word,
    translation: lookup.translation,
    partOfSpeech: lookup.partOfSpeech,
    example: lookup.example,
    exampleTranslation: lookup.exampleTranslation,
  });

  return {
    word: lookup.word || word,
    translation: lookup.translation,
    partOfSpeech: lookup.partOfSpeech,
    example: lookup.example,
    exampleTranslation: lookup.exampleTranslation,
    isDuplicate,
    modelUsed,
  };
}

async function cropImage(dataUrl, rect, dpr) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  const scale = dpr || 1;
  let sx = Math.round(rect.x * scale);
  let sy = Math.round(rect.y * scale);
  let sw = Math.round(rect.w * scale);
  let sh = Math.round(rect.h * scale);

  sx = Math.max(0, Math.min(sx, bitmap.width - 1));
  sy = Math.max(0, Math.min(sy, bitmap.height - 1));
  sw = Math.max(1, Math.min(sw, bitmap.width - sx));
  sh = Math.max(1, Math.min(sh, bitmap.height - sy));

  const padding = 8;
  const canvas = new OffscreenCanvas(sw + padding * 2, sh + padding * 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, sx, sy, sw, sh, padding, padding, sw, sh);

  const outBlob = await canvas.convertToBlob({ type: 'image/png' });
  return await blobToDataUrl(outBlob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let offscreenCreating = null;

async function ensureOffscreen() {
  const existing = await hasOffscreen();
  if (existing) return;
  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }
  offscreenCreating = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS', 'DOM_PARSER'],
      justification: 'Run Tesseract.js for OCR recognition',
    })
    .catch((e) => {
      if (!/already exists/i.test(String(e.message || e))) throw e;
    });
  try {
    await offscreenCreating;
  } finally {
    offscreenCreating = null;
  }
}

async function hasOffscreen() {
  if (!chrome.offscreen) return false;
  if (chrome.runtime.getContexts) {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      });
      return contexts.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

function sendMessagePromise(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response || {});
      }
    });
  });
}

async function sendToOffscreen(message) {
  const msg = { ...message, target: 'offscreen' };
  const attempts = 6;
  for (let i = 0; i < attempts; i++) {
    try {
      return await sendMessagePromise(msg);
    } catch (e) {
      const m = String(e.message || e);
      if (/Receiving end does not exist|Could not establish connection/i.test(m) && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      throw e;
    }
  }
  throw new Error('OFFSCREEN_UNREACHABLE');
}
