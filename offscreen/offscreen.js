console.log('[OCR offscreen] script v4 loaded — sentence mode');

let workerPromise = null;

async function getWorker() {
  if (workerPromise) return workerPromise;

  workerPromise = (async () => {
    const libUrl = (file) => chrome.runtime.getURL(`lib/${file}`);

    const origBlob = self.Blob;
    self.Blob = undefined;
    let worker;
    try {
      worker = await Tesseract.createWorker('eng', 1, {
        workerPath: libUrl('tesseract-worker.min.js'),
        corePath: libUrl(''),
        langPath: libUrl(''),
        workerBlobURL: false,
        gzip: true,
        cacheMethod: 'none',
        logger: () => {},
      });
    } finally {
      self.Blob = origBlob;
    }
    return worker;
  })();

  try {
    return await workerPromise;
  } catch (e) {
    workerPromise = null;
    throw e;
  }
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function extractWords(text) {
  if (!text) return [];
  const matches = text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [];
  const seen = new Set();
  const ordered = [];
  for (const raw of matches) {
    const lower = raw.toLowerCase().replace(/['’]/g, "'");
    if (lower.length < 2) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    ordered.push(lower);
  }
  return ordered;
}

async function runOcr(imageDataUrl) {
  const worker = await getWorker();
  const result = await worker.recognize(imageDataUrl);
  const rawText = result?.data?.text || '';
  const text = cleanText(rawText);
  const words = extractWords(text);
  console.log('[OCR offscreen] recognized', { text, wordCount: words.length, words });
  return { text, words };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return false;
  if (msg.type === 'ocr') {
    runOcr(msg.imageDataUrl)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }
  return false;
});
