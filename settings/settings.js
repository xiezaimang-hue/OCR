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
    opt.textContent = `${model}（已保存的旧选择，可能已不可用）`;
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
  showStatus('✓ 已保存', 'success');
  setTimeout(hideStatus, 2000);
});

testBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.replace(/\s+/g, '').replace(/[​-‍﻿]/g, '');
  const model = modelSelect.value;
  if (!key) {
    showStatus('请先输入 API Key', 'error');
    return;
  }

  testBtn.disabled = true;
  saveBtn.disabled = true;
  showStatus('测试中…', 'info');

  try {
    const result = await testConnection(key, model);
    const usedNote = result.modelUsed && result.modelUsed !== model
      ? `（原选 ${model} 配额不足，自动切换到 ${result.modelUsed}）`
      : '';
    showStatus(
      `✓ 连接成功！测试结果：hello → ${result.translation}（${result.partOfSpeech}）${usedNote}`,
      'success'
    );
  } catch (e) {
    const msg = e.message || String(e);
    const isRateLimited = msg === 'RATE_LIMITED' || /\b429\b|quota|exceeded/i.test(msg);
    let friendly;
    if (msg === 'INVALID_API_KEY') {
      friendly =
        '✗ API Key 无效（401/403）。\n' +
        '请确认：\n' +
        '1. Key 是否完整贴上（前后没有多余空格）。\n' +
        '2. Key 是从 https://aistudio.google.com/apikey 获取的（不是 Google Cloud Console 的）。\n' +
        '3. Key 对应的项目已启用 Generative Language API（AI Studio 创建的会自动启用）。\n' +
        '4. 新创建的 Key 有时需要 1-2 分钟才会生效。';
    } else if (msg === 'NETWORK_ERROR') {
      friendly = '✗ 网络错误，请确认网络连接。';
    } else if (msg === 'MODEL_NOT_FOUND') {
      friendly =
        '✗ 内建模型清单对这把 Key 全部不可用（404）。\n' +
        '请点上方「🔄 检测可用模型」，从你的 API Key 获取真正可用的模型清单再试。';
    } else if (isRateLimited) {
      friendly =
        '✗ 此 API Key 在所有可用模型上都已达配额（HTTP 429）。\n' +
        '可能原因：\n' +
        '1. 这把 Key 对应的 Google Cloud 项目今天的免费 RPD（每日请求数）已用完 → 请等 UTC 00:00 重置（台湾时间早上 8 点）。\n' +
        '2. 短时间内请求太密集 → 等 1 分钟再试。\n' +
        '解决方式：到 https://aistudio.google.com/apikey 用「另一个 Google 账号」或「另一个 Cloud 项目」新建一把 Key 替换。';
    } else if (msg === 'SERVER_BUSY') {
      friendly = '✗ Gemini 服务器忙碌（503），请稍后再试。';
    } else if (msg.startsWith('API_ERROR')) {
      friendly = `✗ Google 回传错误：\n${msg.replace(/^API_ERROR:/, '')}`;
    } else {
      friendly = `✗ 测试失败：${msg}`;
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
  if (lower.includes('lite')) tags.push('轻量');
  if (lower.includes('latest')) tags.push('最新版别名');
  if (lower.includes('pro')) tags.push('Pro');
  if (lower.includes('thinking')) tags.push('Thinking');
  if (lower.includes('exp')) tags.push('实验');
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
    showStatus('请先输入 API Key', 'error');
    return;
  }

  detectBtn.disabled = true;
  testBtn.disabled = true;
  saveBtn.disabled = true;
  showStatus('🔄 正在从 Google 获取可用模型清单…', 'info');

  try {
    const all = await listModels(key);
    if (!all.length) {
      showStatus('✗ 没有取到任何 Gemini 模型，请确认 Key 是否正确。', 'error');
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
      `✓ 检测完成，共找到 ${sorted.length} 个可用模型，已预选 ${modelSelect.value}。\n别忘了按「保存」。`,
      'success'
    );
  } catch (e) {
    const msg = e.message || String(e);
    if (msg === 'INVALID_API_KEY') {
      showStatus('✗ API Key 无效，无法获取模型清单。请确认 Key 是否正确。', 'error');
    } else {
      showStatus(`✗ 获取模型清单失败：${msg}`, 'error');
    }
  } finally {
    detectBtn.disabled = false;
    testBtn.disabled = false;
    saveBtn.disabled = false;
  }
});

init();
