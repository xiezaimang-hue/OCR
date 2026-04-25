const WORDS_KEY = 'words';
const API_KEY_KEY = 'geminiApiKey';
const MODEL_KEY = 'geminiModel';
const DEFAULT_MODEL = 'gemini-2.5-flash';

export async function getApiKey() {
  const result = await chrome.storage.local.get(API_KEY_KEY);
  return result[API_KEY_KEY] || '';
}

export async function setApiKey(key) {
  await chrome.storage.local.set({ [API_KEY_KEY]: key });
}

export async function getModel() {
  const result = await chrome.storage.local.get(MODEL_KEY);
  return result[MODEL_KEY] || DEFAULT_MODEL;
}

export async function setModel(model) {
  await chrome.storage.local.set({ [MODEL_KEY]: model });
}

export async function getWords() {
  const result = await chrome.storage.local.get(WORDS_KEY);
  return result[WORDS_KEY] || [];
}

export async function saveWord(entry) {
  const words = await getWords();
  const now = Date.now();
  const normalized = entry.word.trim().toLowerCase();
  const existingIdx = words.findIndex((w) => w.word.toLowerCase() === normalized);

  let saved;
  if (existingIdx >= 0) {
    const existing = words[existingIdx];
    saved = {
      ...existing,
      ...entry,
      word: existing.word,
      pinned: existing.pinned,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
    words.splice(existingIdx, 1);
    words.unshift(saved);
  } else {
    saved = {
      id: crypto.randomUUID(),
      word: entry.word,
      translation: entry.translation || '',
      partOfSpeech: entry.partOfSpeech || '',
      example: entry.example || '',
      exampleTranslation: entry.exampleTranslation || '',
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    words.unshift(saved);
  }

  await chrome.storage.local.set({ [WORDS_KEY]: words });
  return saved;
}

export async function deleteWord(id) {
  const words = await getWords();
  const filtered = words.filter((w) => w.id !== id);
  await chrome.storage.local.set({ [WORDS_KEY]: filtered });
}

export async function togglePin(id) {
  const words = await getWords();
  const idx = words.findIndex((w) => w.id === id);
  if (idx < 0) return;
  words[idx] = { ...words[idx], pinned: !words[idx].pinned };
  await chrome.storage.local.set({ [WORDS_KEY]: words });
  return words[idx];
}

export function sortWordsForDisplay(words) {
  return [...words].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}
