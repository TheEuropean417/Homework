/* global chrome */
(function(){
  // ---------- Config: point to YOUR ESM files ----------
  const PDF_JS_ESM     = 'vendor/legacy/build/pdf.min.mjs';
  const PDF_WORKER_ESM = 'vendor/legacy/build/pdf.worker.min.mjs';

  // Tesseract local assets
  const TESS_BASE = 'vendor/tesseract/'; // contains tesseract.min.js, worker.min.js, tesseract-core.wasm(.js), eng.traineddata.gz

  // ---------- Utilities ----------
  const getURL = (p) => chrome.runtime.getURL(p);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const log   = (...a) => console.log('[pdf_host]', ...a);
  const warn  = (...a) => console.warn('[pdf_host]', ...a);
  const err   = (...a) => console.error('[pdf_host]', ...a);

  // Token → keep messages scoped to this host instance
  const params = new URLSearchParams(location.search);
  const requestId = params.get('token') || '';

  // Tell background we are ready to receive bytes
  try { chrome.runtime.sendMessage({ cmd:'pdf-host-ready', requestId }); } catch(_){}

  // Small helper to load a script (for tesseract UMD file)
  function injectScript(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error('Failed to load script: ' + src));
      (document.head || document.documentElement).appendChild(s);
    });
  }

  // ---------- Load pdf.js (ESM only) ----------
  async function loadPdfJsEsm(){
    const js    = getURL(PDF_JS_ESM);
    const worker= getURL(PDF_WORKER_ESM);
    log('Loading pdf.js (ESM):', js);
    const mod = await import(js);          // throws if path is wrong
    // Expose like UMD so rest of code can use pdfjsLib.getDocument(...)
    // eslint-disable-next-line no-undef
    window.pdfjsLib = mod;
    // Point worker to your ESM worker (pdf.js treats *.mjs as a module worker)
    // eslint-disable-next-line no-undef
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
    log('pdf.js workerSrc =', worker);
  }

  // ---------- Tesseract (OCR) ----------
  let tessWorker = null;
  async function ensureTesseract(){
    if (tessWorker) return tessWorker;
    log('OCR: loading tesseract…');
    await injectScript(getURL(TESS_BASE + 'tesseract.min.js'));
    // eslint-disable-next-line no-undef
    const { createWorker } = window.Tesseract;
    const worker = await createWorker({
      logger: () => {},
      workerPath: getURL(TESS_BASE + 'worker.min.js'),
      corePath:   getURL(TESS_BASE + 'tesseract-core.wasm.js'),
      langPath:   getURL(TESS_BASE) // must contain eng.traineddata.gz
    });
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng', { tessedit_pageseg_mode: '6' });
    tessWorker = worker;
    log('OCR: ready');
    return worker;
  }

  // ---------- Extraction helpers ----------
  function joinItems(items){ return items.map(it => it.str || '').join(' ').trim(); }
  function niceLines(items){
    const lines=[]; let cur=[]; let lastY=null; const tol=2;
    for(const it of items){
      const y = Math.round((it.transform && it.transform[5]) ? it.transform[5] : 0);
      if(lastY===null) lastY = y;
      const sep = Math.abs(y-lastY)>tol;
      if(sep){ if(cur.length) lines.push(cur.join('')); cur=[it.str||'']; lastY=y; }
      else    { cur.push(it.str||''); }
      if(it.hasEOL){ if(cur.length) lines.push(cur.join('')); cur=[]; lastY=null; }
    }
    if(cur.length) lines.push(cur.join(''));
    return lines.join('\n').trim();
  }
  async function renderToCanvas(page, scale=2.0){
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently:true });
    canvas.width = Math.ceil(vp.width);
    canvas.height= Math.ceil(vp.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  }
  async function ocrCanvas(canvas){
    const w = await ensureTesseract();
    // eslint-disable-next-line no-undef
    const { data:{ text } } = await w.recognize(canvas);
    return (text||'').trim();
  }

  async function extractTextSmart(pdf){
    let out = '';
    for(let p=1; p<=pdf.numPages; p++){
      try { chrome.runtime.sendMessage({ cmd:'pdf-host-progress', requestId, page:p, total:pdf.numPages }); } catch(_){}
      const page = await pdf.getPage(p);

      const tc = await page.getTextContent();
      let text = joinItems(tc.items);
      if(!text || text.replace(/\s+/g,'').length < 25){
        const canvas = await renderToCanvas(page, 2.0); // adjust scale if needed
        try { text = await ocrCanvas(canvas); }
        finally { canvas.width = 0; canvas.height = 0; }
      } else {
        const better = niceLines(tc.items);
        if(better && better.length > text.length * 0.9) text = better;
      }
      out += text + '\n\n';
      if(p % 6 === 0) await sleep(0);
    }
    return out;
  }

  async function parseBytes(bytesArr){
    // 1) Load pdf.js (ESM)
    await loadPdfJsEsm();
    // 2) Parse (with OCR fallback per page)
    const bytes = new Uint8Array(bytesArr);
    // eslint-disable-next-line no-undef
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    log('pdf.js loaded. pages =', pdf.numPages);
    const text = await extractTextSmart(pdf);
    return text;
  }

  // ---------- Message pump ----------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      if(!msg) return sendResponse({});
      if(msg.cmd === 'pdf-host-parse' && msg.requestId === requestId){
        try{
          log('PARSE bytes:', (msg.bytes && msg.bytes.length) || 0);
          const text = await parseBytes(msg.bytes || []);
          chrome.runtime.sendMessage({ cmd:'pdf-host-result', requestId, text });
          sendResponse({ ok:true });
        }catch(e){
          err('Parse error:', e);
          chrome.runtime.sendMessage({ cmd:'pdf-host-result', requestId, error: String(e && e.message ? e.message : e) });
          sendResponse({ ok:false, error: String(e) });
        }
      }else{
        sendResponse({});
      }
    })();
    return true;
  });

})();
