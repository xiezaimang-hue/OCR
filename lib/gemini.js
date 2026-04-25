const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function buildPrompt(word) {
  return `你是一個英文單字教學助手。請針對英文單字 "${word}" 回傳一個 JSON 物件，格式如下（只回 JSON 資料本身，不要加任何 markdown 包裝或說明文字）：
{
  "word": "原形單字（小寫）",
  "translation": "繁體中文翻譯（簡短，1-10 字）",
  "partOfSpeech": "詞性（繁體中文，例如：名詞、動詞、形容詞、副詞、介系詞、連接詞、代名詞、感嘆詞）",
  "example": "一個使用該單字的自然英文例句",
  "exampleTranslation": "例句的繁體中文翻譯"
}

如果 "${word}" 不是一個有效的英文單字（例如是亂碼），請回傳：
{
  "error": "not_a_word"
}`;
}

export async function lookupWord(word, apiKey, model = 'gemini-2.5-flash') {
  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }
  if (!word) {
    throw new Error('EMPTY_WORD');
  }

  const url = `${API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(word) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('NETWORK_ERROR');
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let errBody = null;
    try { errBody = JSON.parse(errText); } catch {}
    const errMsg = errBody?.error?.message || errText || '';
    const errStatus = errBody?.error?.status || '';

    if (res.status === 401 || res.status === 403) {
      throw new Error('INVALID_API_KEY');
    }
    if (res.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    if (res.status === 503 || res.status === 500) {
      throw new Error('SERVER_BUSY');
    }
    if (res.status === 404) {
      throw new Error('MODEL_NOT_FOUND');
    }
    if (res.status === 400) {
      if (/api key not valid|api_key_invalid|invalid api key|API_KEY_INVALID/i.test(errMsg) || errStatus === 'INVALID_ARGUMENT' && /api key/i.test(errMsg)) {
        throw new Error('INVALID_API_KEY');
      }
      if (/not found|is not supported|does not exist|not available/i.test(errMsg)) {
        throw new Error('MODEL_NOT_FOUND');
      }
      throw new Error(`API_ERROR:400:${errMsg.slice(0, 200)}`);
    }
    throw new Error(`API_ERROR:${res.status}:${errMsg.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('EMPTY_RESPONSE');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error('PARSE_ERROR');
    }
  }

  if (parsed.error) {
    throw new Error('NOT_A_WORD');
  }

  return {
    word: parsed.word || word,
    translation: parsed.translation || '',
    partOfSpeech: parsed.partOfSpeech || '',
    example: parsed.example || '',
    exampleTranslation: parsed.exampleTranslation || '',
  };
}

export async function translateSentence(text, apiKey, model = 'gemini-2.5-flash') {
  if (!apiKey) throw new Error('MISSING_API_KEY');
  if (!text || !text.trim()) throw new Error('EMPTY_TEXT');

  const prompt = `請把以下英文翻譯成自然流暢的繁體中文。只回一個 JSON 物件，格式：
{ "translation": "繁體中文翻譯" }

英文原文：
${text}`;

  const url = `${API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    });
  } catch (e) {
    throw new Error('NETWORK_ERROR');
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let errBody = null;
    try { errBody = JSON.parse(errText); } catch {}
    const errMsg = errBody?.error?.message || errText || '';
    if (res.status === 401 || res.status === 403) throw new Error('INVALID_API_KEY');
    if (res.status === 429) throw new Error('RATE_LIMITED');
    if (res.status === 503 || res.status === 500) throw new Error('SERVER_BUSY');
    if (res.status === 404) throw new Error('MODEL_NOT_FOUND');
    if (res.status === 400 && /not found|not supported|does not exist|not available/i.test(errMsg)) throw new Error('MODEL_NOT_FOUND');
    throw new Error(`API_ERROR:${res.status}:${errMsg.slice(0, 200)}`);
  }

  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error('EMPTY_RESPONSE');
  let parsed;
  try { parsed = JSON.parse(out); } catch {
    const m = out.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]); else throw new Error('PARSE_ERROR');
  }
  return parsed.translation || '';
}

export async function translateSentenceWithFallback(text, apiKey, preferredModel = 'gemini-2.5-flash') {
  const tried = new Set();
  const baseModels = [preferredModel, ...FALLBACK_CHAIN.filter((m) => m !== preferredModel)];
  let lastErr;
  for (const model of baseModels) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      const translation = await translateSentence(text, apiKey, model);
      return { translation, modelUsed: model };
    } catch (e) {
      lastErr = e;
      const m = e.message || '';
      if (m === 'RATE_LIMITED' || m === 'SERVER_BUSY' || m === 'MODEL_NOT_FOUND') continue;
      throw e;
    }
  }
  throw lastErr || new Error('MODEL_NOT_FOUND');
}

export async function testConnection(apiKey, model = 'gemini-2.5-flash') {
  const { result, modelUsed } = await lookupWordWithFallback('hello', apiKey, model);
  return { ...result, modelUsed };
}

const FALLBACK_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

export async function listModels(apiKey) {
  const url = `${API_BASE}?key=${encodeURIComponent(apiKey)}&pageSize=200`;
  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) throw new Error('INVALID_API_KEY');
    throw new Error(`API_ERROR:${res.status}:${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const all = data.models || [];
  const usable = all
    .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => ({
      name: (m.name || '').replace(/^models\//, ''),
      displayName: m.displayName || '',
      description: m.description || '',
    }))
    .filter((m) => m.name.startsWith('gemini-'));
  return usable;
}

let cachedDiscoveredModels = null;
async function discoverFlashModels(apiKey) {
  if (cachedDiscoveredModels) return cachedDiscoveredModels;
  try {
    const all = await listModels(apiKey);
    const flash = all
      .map((m) => m.name)
      .filter((n) => /flash/i.test(n) && !/vision|image|audio|tts|embed|exp/i.test(n));
    cachedDiscoveredModels = flash;
    return flash;
  } catch {
    return [];
  }
}

export async function lookupWordWithFallback(word, apiKey, preferredModel = 'gemini-2.5-flash') {
  const tried = new Set();
  const baseModels = [preferredModel, ...FALLBACK_CHAIN.filter((m) => m !== preferredModel)];
  let lastErr;

  for (const model of baseModels) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      const result = await lookupWord(word, apiKey, model);
      return { result, modelUsed: model };
    } catch (e) {
      lastErr = e;
      const m = e.message || '';
      if (m === 'RATE_LIMITED' || m === 'SERVER_BUSY' || m === 'MODEL_NOT_FOUND') {
        continue;
      }
      throw e;
    }
  }

  const discovered = await discoverFlashModels(apiKey);
  for (const model of discovered) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      const result = await lookupWord(word, apiKey, model);
      return { result, modelUsed: model };
    } catch (e) {
      lastErr = e;
      const m = e.message || '';
      if (m === 'RATE_LIMITED' || m === 'SERVER_BUSY' || m === 'MODEL_NOT_FOUND') {
        continue;
      }
      throw e;
    }
  }

  throw lastErr || new Error('MODEL_NOT_FOUND');
}
