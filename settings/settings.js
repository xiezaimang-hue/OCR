import { getApiKey, setApiKey, getModel, setModel } from '../lib/storage.js';
import { testConnection, listModels } from '../lib/gemini.js';

const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model');
const toggleBtn = document.getElementById('toggle-visibility');
const saveBtn = document.getElementById('save-btn');
const testBtn = document.getElementById('test-btn');
const detectBtn = document.getElementById('detect-btn');
const statusEl = document.getElementById('status');

function showStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove('hidden');
}

function hideStatus() {
  statusEl.classList.add('hidden');
}

async function init() {
  const [key, model] = await Promise.all([getApiKey(), getModel()]);
  apiKeyInput.value = key;

  const hasOption = Array.from(modelSelect.options).some((o) => o.value === model);
  if (!hasOption && model) {
    const opt = document.createElement('option');
    opt.value = model;
    opt.textContent = `${model}（已儲存的舊選擇，可能已不可用）`;
    modelSelect.appendChild(opt);
  }
  modelSelect.value = model;

  try {
    const commands = await chrome.commands.getAll();
    const cmd = commands.find((c) => c.name === 'activate-ocr');
    if (cmd && cmd.shortcut) {
      document.getElementById('shortcut-display').textContent = cmd.shortcut;
      document.getElementById('shortcut-inline').textContent = cmd.shortcut;
    }
  } catch {}
}

toggleBtn.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

saveBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.replace(/\s+/g, '').replace(/[​-‍﻿]/g, '');
  const model = modelSelect.value;
  await Promise.all([setApiKey(key), setModel(model)]);
  showStatus('✓ 已儲存', 'success');
  setTimeout(hideStatus, 2000);
});

testBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.replace(/\s+/g, '').replace(/[​-‍﻿]/g, '');
  const model = modelSelect.value;
  if (!key) {
    showStatus('請先輸入 API Key', 'error');
    return;
  }

  testBtn.disabled = true;
  saveBtn.disabled = true;
  showStatus('測試中…', 'info');

  try {
    const result = await testConnection(key, model);
    const usedNote = result.modelUsed && result.modelUsed !== model
      ? `（原選 ${model} 配額不足，自動切換到 ${result.modelUsed}）`
      : '';
    showStatus(
      `✓ 連線成功！測試結果：hello → ${result.translation}（${result.partOfSpeech}）${usedNote}`,
      'success'
    );
  } catch (e) {
    const msg = e.message || String(e);
    const isRateLimited = msg === 'RATE_LIMITED' || /\b429\b|quota|exceeded/i.test(msg);
    let friendly;
    if (msg === 'INVALID_API_KEY') {
      friendly =
        '✗ API Key 無效（401/403）。\n' +
        '請確認：\n' +
        '1. Key 是否完整貼上（前後沒有多餘空格）。\n' +
        '2. Key 是從 https://aistudio.google.com/apikey 取得（不是 Google Cloud Console 的）。\n' +
        '3. Key 對應的專案有啟用 Generative Language API（AI Studio 建立的會自動啟用）。\n' +
        '4. 新建立的 Key 有時需要 1-2 分鐘才會生效。';
    } else if (msg === 'NETWORK_ERROR') {
      friendly = '✗ 網路錯誤，請確認連線。';
    } else if (msg === 'MODEL_NOT_FOUND') {
      friendly =
        '✗ 內建模型清單對這把 Key 全部不可用（404）。\n' +
        '請點上方「🔄 偵測可用模型」，從你的 API Key 取回真正可用的模型清單再試。';
    } else if (isRateLimited) {
      friendly =
        '✗ 此 API Key 在所有可用模型上都已達配額（HTTP 429）。\n' +
        '可能原因：\n' +
        '1. 這把 Key 對應的 Google Cloud 專案今天的免費 RPD（每日請求數）已用完 → 請等 UTC 00:00 重置（台灣時間早上 8 點）。\n' +
        '2. 短時間內請求太密集 → 等 1 分鐘再試。\n' +
        '解決方式：到 https://aistudio.google.com/apikey 用「另一個 Google 帳號」或「另一個 Cloud 專案」新建一把 Key 替換。';
    } else if (msg === 'SERVER_BUSY') {
      friendly = '✗ Gemini 伺服器忙碌（503），請稍後再試。';
    } else if (msg.startsWith('API_ERROR')) {
      friendly = `✗ Google 回傳錯誤：\n${msg.replace(/^API_ERROR:/, '')}`;
    } else {
      friendly = `✗ 測試失敗：${msg}`;
    }
    showStatus(friendly, 'error');
  } finally {
    testBtn.disabled = false;
    saveBtn.disabled = false;
  }
});

document.getElementById('open-shortcuts').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

function describeModel(name) {
  const lower = name.toLowerCase();
  const tags = [];
  if (lower.includes('lite')) tags.push('輕量');
  if (lower.includes('latest')) tags.push('最新版別名');
  if (lower.includes('pro')) tags.push('Pro');
  if (lower.includes('thinking')) tags.push('Thinking');
  if (lower.includes('exp')) tags.push('實驗');
  if (lower.includes('preview')) tags.push('Preview');
  return tags.length ? `（${tags.join('・')}）` : '';
}

function rankModel(name) {
  const lower = name.toLowerCase();
  let score = 0;
  if (lower.includes('flash') && !lower.includes('lite') && !lower.includes('thinking')) score -= 100;
  if (lower.includes('flash-lite') || lower.includes('flash-lite-latest')) score -= 90;
  if (lower.includes('latest')) score -= 5;
  const m = lower.match(/(\d+)\.(\d+)/);
  if (m) score -= parseInt(m[1], 10) * 10 + parseInt(m[2], 10);
  if (lower.includes('exp') || lower.includes('preview')) score += 50;
  if (lower.includes('pro')) score += 10;
  return score;
}

detectBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.replace(/\s+/g, '').replace(/[​-‍﻿]/g, '');
  if (!key) {
    showStatus('請先輸入 API Key', 'error');
    return;
  }

  detectBtn.disabled = true;
  testBtn.disabled = true;
  saveBtn.disabled = true;
  showStatus('🔄 正在從 Google 取得可用模型清單…', 'info');

  try {
    const all = await listModels(key);
    if (!all.length) {
      showStatus('✗ 沒有取到任何 Gemini 模型，請確認 Key 是否正確。', 'error');
      return;
    }

    const previousValue = modelSelect.value;
    const sorted = [...all].sort((a, b) => rankModel(a.name) - rankModel(b.name));

    modelSelect.innerHTML = '';
    for (const m of sorted) {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = `${m.name} ${describeModel(m.name)}`.trim();
      modelSelect.appendChild(opt);
    }

    if (sorted.some((m) => m.name === previousValue)) {
      modelSelect.value = previousValue;
    } else {
      const flash = sorted.find((m) => /flash/.test(m.name) && !/exp|preview|thinking/.test(m.name));
      modelSelect.value = (flash || sorted[0]).name;
    }

    showStatus(
      `✓ 偵測完成，共找到 ${sorted.length} 個可用模型，已預選 ${modelSelect.value}。\n別忘了按「儲存」。`,
      'success'
    );
  } catch (e) {
    const msg = e.message || String(e);
    if (msg === 'INVALID_API_KEY') {
      showStatus('✗ API Key 無效，無法取得模型清單。請確認 Key 是否正確。', 'error');
    } else {
      showStatus(`✗ 取得模型清單失敗：${msg}`, 'error');
    }
  } finally {
    detectBtn.disabled = false;
    testBtn.disabled = false;
    saveBtn.disabled = false;
  }
});

init();
