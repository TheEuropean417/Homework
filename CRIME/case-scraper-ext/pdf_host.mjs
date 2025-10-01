/* ESM host page that imports pdf.js as a module and parses bytes on request. */
/* Runs in chrome-extension://.../pdf_host.html */

const params = new URLSearchParams(location.search);
const token = params.get('token') || '';

const getURL = (p) => chrome.runtime.getURL(p);

// Try to import whichever path you actually have; first one that works wins.
async function importPdfJs() {
  const candidates = [
    'vendor/legacy/build/pdf.min.mjs',
    'vendor/legacy/build/pdf.mjs',
    'vendor/build/pdf.min.mjs',
    'vendor/build/pdf.mjs',
    'vendor/pdf.min.mjs',
    'vendor/pdf.mjs',
  ];
  let lastErr;
  for (const rel of candidates) {
    const url = getURL(rel);
    try {
      const mod = await import(url);
      console.log('[pdf_host] Imported pdf.js from', rel);
      return { mod, rel };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Could not import pdf.js ESM (pdf*.mjs). Put files under /vendor/(legacy|build).');
}

async function resolveWorkerPath() {
  const workers = [
    'vendor/legacy/build/pdf.worker.min.mjs',
    'vendor/legacy/build/pdf.worker.mjs',
    'vendor/build/pdf.worker.min.mjs',
    'vendor/build/pdf.worker.mjs',
    'vendor/pdf.worker.min.mjs',
    'vendor/pdf.worker.mjs',
  ];
  for (const rel of workers) {
    const url = getURL(rel);
    try {
      // Probe existence – HEAD request against extension URL
      const resp = await fetch(url, { method: 'HEAD' });
      if (resp.ok) {
        console.log('[pdf_host] Using worker:', rel);
        return url;
      }
    } catch (_) { /* ignore */ }
  }
  throw new Error('Could not find pdf.worker*.mjs under /vendor.');
}

function linesFromItems(items) {
  const lines = [];
  let cur = [];
  let lastY = null;
  const tol = 2; // px between lines
  for (const it of items) {
    const y = Math.round((it.transform && it.transform[5]) ? it.transform[5] : 0);
    if (lastY === null) lastY = y;
    const sep = Math.abs(y - lastY) > tol;
    if (sep) {
      if (cur.length) lines.push(cur.join(''));
      cur = [it.str || ''];
      lastY = y;
    } else {
      cur.push(it.str || '');
    }
    if (it.hasEOL) {
      if (cur.length) lines.push(cur.join(''));
      cur = [];
      lastY = null;
    }
  }
  if (cur.length) lines.push(cur.join(''));
  return lines.join('\n');
}

async function parseBytes(byteArr) {
  // Import ESM build of pdf.js
  const { mod: pdfjsLib } = await importPdfJs();

  // Point pdf.js to the ESM worker that lives in the extension
  const workerUrl = await resolveWorkerPath();
  // In v4, providing an .mjs worker URL makes pdf.js create a module worker automatically
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const bytes = new Uint8Array(byteArr);
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;

  let out = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    out += linesFromItems(tc.items) + '\n\n';
    // keep UI responsive on very large PDFs
    if (p % 10 === 0) await new Promise(r => setTimeout(r, 0));
  }
  return out;
}

// Listen for parse requests from background.js and reply with text
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg) return sendResponse({});
    if (msg.cmd === 'pdf-host-parse' && (!msg.token || msg.token === token)) {
      try {
        const text = await parseBytes(msg.bytes || []);
        chrome.runtime.sendMessage({ cmd: 'pdf-host-result', requestId: msg.requestId, text });
        sendResponse({ ok: true });
      } catch (e) {
        console.error('[pdf_host] Parse error:', e);
        chrome.runtime.sendMessage({ cmd: 'pdf-host-result', requestId: msg.requestId, error: String(e) });
        sendResponse({ ok: false, error: String(e) });
      }
    } else {
      sendResponse({});
    }
  })();
  return true; // async
});
