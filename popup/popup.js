import { getApiKey } from '../lib/storage.js';

document.getElementById('open-wordlist').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('wordlist/wordlist.html') });
  window.close();
});

document.getElementById('open-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
  window.close();
});

document.getElementById('start-ocr').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    chrome.runtime.sendMessage({ type: 'start-ocr-from-popup', tabId: tab.id });
  }
  window.close();
});

async function init() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    document.getElementById('api-warning').classList.remove('hidden');
  }

  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const shortcutLabel = isMac ? '⌘+Shift+O' : 'Ctrl+Shift+O';

  try {
    const commands = await chrome.commands.getAll();
    const cmd = commands.find((c) => c.name === 'activate-ocr');
    if (cmd && cmd.shortcut) {
      document.getElementById('shortcut-key').textContent = cmd.shortcut;
    } else {
      document.getElementById('shortcut-key').textContent = shortcutLabel;
    }
  } catch {
    document.getElementById('shortcut-key').textContent = shortcutLabel;
  }
}

init();
