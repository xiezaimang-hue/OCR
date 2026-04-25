import { getWords, deleteWord, togglePin, sortWordsForDisplay } from '../lib/storage.js';

const gridEl = document.getElementById('grid');
const emptyEl = document.getElementById('empty-state');
const searchEl = document.getElementById('search');
const countEl = document.getElementById('count');
const confirmDialog = document.getElementById('confirm-dialog');
const confirmMessage = document.getElementById('confirm-message');
const confirmDeleteBtn = document.getElementById('confirm-delete');
const confirmCancelBtn = document.getElementById('confirm-cancel');

let allWords = [];
let currentFilter = '';
let pendingDeleteId = null;

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '剛剛';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(ts).toLocaleDateString('zh-TW');
}

function renderCard(w) {
  const pinned = w.pinned ? 'pinned' : '';
  const pinActive = w.pinned ? 'active' : '';
  const pinTitle = w.pinned ? '取消置頂' : '置頂';
  return `
    <article class="card ${pinned}" data-id="${escapeHtml(w.id)}">
      <div class="card-header">
        <div class="card-word">${escapeHtml(w.word)}</div>
        <div class="card-actions">
          <button class="icon-btn ${pinActive}" data-action="pin" title="${pinTitle}">📌</button>
          <button class="icon-btn" data-action="delete" title="刪除">🗑️</button>
        </div>
      </div>
      <div class="card-meta">
        ${w.translation ? `<span class="translation">${escapeHtml(w.translation)}</span>` : ''}
        ${w.partOfSpeech ? `<span class="pos">${escapeHtml(w.partOfSpeech)}</span>` : ''}
      </div>
      ${w.example ? `
        <div class="divider"></div>
        <div class="example">
          <div class="example-en">"${escapeHtml(w.example)}"</div>
          ${w.exampleTranslation ? `<div class="example-zh">${escapeHtml(w.exampleTranslation)}</div>` : ''}
        </div>
      ` : ''}
      <div class="timestamp">更新於 ${formatRelativeTime(w.updatedAt)}</div>
    </article>
  `;
}

function applyFilter(words) {
  if (!currentFilter) return words;
  const q = currentFilter.toLowerCase();
  return words.filter(
    (w) =>
      w.word.toLowerCase().includes(q) ||
      (w.translation || '').toLowerCase().includes(q) ||
      (w.partOfSpeech || '').toLowerCase().includes(q)
  );
}

function render() {
  const sorted = sortWordsForDisplay(allWords);
  const filtered = applyFilter(sorted);
  countEl.textContent = allWords.length;

  if (allWords.length === 0) {
    emptyEl.classList.remove('hidden');
    gridEl.innerHTML = '';
    return;
  }
  emptyEl.classList.add('hidden');

  if (filtered.length === 0) {
    gridEl.innerHTML = `<div class="empty-state" style="grid-column: 1/-1"><p>找不到符合的單字</p></div>`;
    return;
  }

  gridEl.innerHTML = filtered.map(renderCard).join('');
}

async function refresh() {
  allWords = await getWords();
  render();
}

gridEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const card = btn.closest('.card');
  const id = card?.dataset.id;
  if (!id) return;
  const action = btn.dataset.action;

  if (action === 'pin') {
    await togglePin(id);
    await refresh();
  } else if (action === 'delete') {
    const word = allWords.find((w) => w.id === id);
    pendingDeleteId = id;
    confirmMessage.textContent = `確定要刪除「${word?.word || ''}」嗎？`;
    confirmDialog.classList.remove('hidden');
  }
});

confirmCancelBtn.addEventListener('click', () => {
  pendingDeleteId = null;
  confirmDialog.classList.add('hidden');
});

confirmDeleteBtn.addEventListener('click', async () => {
  if (pendingDeleteId) {
    await deleteWord(pendingDeleteId);
    pendingDeleteId = null;
    confirmDialog.classList.add('hidden');
    await refresh();
  }
});

confirmDialog.addEventListener('click', (e) => {
  if (e.target === confirmDialog) {
    pendingDeleteId = null;
    confirmDialog.classList.add('hidden');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !confirmDialog.classList.contains('hidden')) {
    pendingDeleteId = null;
    confirmDialog.classList.add('hidden');
  }
});

searchEl.addEventListener('input', (e) => {
  currentFilter = e.target.value.trim();
  render();
});

document.getElementById('settings-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.words) {
    allWords = changes.words.newValue || [];
    render();
  }
});

async function initShortcut() {
  try {
    const commands = await chrome.commands.getAll();
    const cmd = commands.find((c) => c.name === 'activate-ocr');
    if (cmd && cmd.shortcut) {
      document.getElementById('shortcut-display').textContent = cmd.shortcut;
    }
  } catch {}
}

initShortcut();
refresh();
