/* global chrome */

// ========= Settings =========
const COURT_ID = 'CT31';
const START_URL_FALLBACK = 'https://www.courts.mo.gov/cnet/caseNoSearch.do';

// ---------- Cloud OCR (OCR.space) ----------
const OCRSPACE_ENDPOINT = 'https://api.ocr.space/parse/image';
// Put your API key here (get one at ocr.space). Keep it private.
const OCRSPACE_KEY = 'K82419598088957'; // <= REQUIRED

// ========= URL builders =========
function chargesUrl(caseNo){
  return `https://www.courts.mo.gov/cnet/cases/newHeader.do?inputVO.caseNumber=${encodeURIComponent(caseNo)}&inputVO.courtId=${encodeURIComponent(COURT_ID)}&inputVO.isTicket=false#charges`;
}
function docketUrl(caseNo){
  return `https://www.courts.mo.gov/cnet/cases/newHeader.do?inputVO.caseNumber=${encodeURIComponent(caseNo)}&inputVO.courtId=${encodeURIComponent(COURT_ID)}&inputVO.isTicket=false#docket`;
}

// ---------------- Utilities ----------------
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function sendToTab(tabId, payload, timeoutMs=120000){
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if(!done){ done = true; resolve({ error: 'timeout' }); } }, timeoutMs);
    try{
      chrome.tabs.sendMessage(tabId, payload, (resp) => {
        if(done) return;
        clearTimeout(timer);
        if(chrome.runtime.lastError){ resolve({ error: chrome.runtime.lastError.message }); }
        else { resolve(resp); }
      });
    }catch(e){
      if(done) return;
      clearTimeout(timer);
      resolve({ error: String(e) });
    }
  });
}

// ---- SAFE tab helpers (never throw / never hang) ----
function getTabSafe(tabId){
  return new Promise((resolve) => {
    try{
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(tab || null);
      });
    }catch(_){ resolve(null); }
  });
}
function safeCloseTab(tabId){
  try{
    chrome.tabs.get(tabId, (t) => {
      if (chrome.runtime.lastError || !t) return;
      chrome.tabs.remove(tabId, () => { void chrome.runtime.lastError; });
    });
  }catch(_){}
}

function escapeXML(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---------- Excel helpers ----------
const EXCEL_SAFE_CHUNK = 32000; // Excel per-cell cap ~32767
function chunkForExcel(text){
  if (!text) return [''];
  const chunks = [];
  for(let i=0; i<text.length; i+=EXCEL_SAFE_CHUNK){
    chunks.push(text.slice(i, i+EXCEL_SAFE_CHUNK));
  }
  return chunks;
}
function rowsForSection(title, rawTextOrMsg){
  const pieces = chunkForExcel(rawTextOrMsg || '');
  let xml = `<Row><Cell ss:StyleID="sec"><Data ss:Type="String">${escapeXML(title)}</Data></Cell></Row>\n`;
  for(const part of pieces){
    xml += `<Row ss:AutoFitHeight="1"><Cell ss:StyleID="wrap" ss:MergeAcross="6"><Data ss:Type="String">${escapeXML(part)}</Data></Cell></Row>\n`;
  }
  return xml;
}

// ---------- Excel 2003 XML workbook ----------
function buildWorkbookXML(results){
  const header = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#E2FAD5" ss:Pattern="Solid"/></Style>
  <Style ss:ID="sec"><Font ss:Bold="1"/><Interior ss:Color="#DDEBFF" ss:Pattern="Solid"/></Style>
  <Style ss:ID="wrap"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
</Styles>
`;
  const sheets = results.map(r => {
    const wsName = (r.caseNumber||'').slice(0,31).replace(/[/\\:*?\[\]]/g,'-') || 'Case';

    const pcsCell = r.probableCauseError
      ? `ERROR: ${r.probableCauseError}`
      : (r.probableCauseText ? r.probableCauseText
         : (r.probableCauseUrl ? `Link: ${r.probableCauseUrl}` : 'Not found'));

    const summCell = r.summonsError
      ? `ERROR: ${r.summonsError}`
      : (r.summonsText ? r.summonsText
         : (r.summonsUrl ? `Link: ${r.summonsUrl}` : 'Not found'));

    const rows =
      rowsForSection('Charges, Judgements & Sentences', r.charges||'') +
      rowsForSection('Docket Entries', r.docket||'') +
      rowsForSection('Probable Cause Statement Filed', pcsCell||'') +
      rowsForSection('Criminal Summons Issued',       summCell||'');

    return `<Worksheet ss:Name="${escapeXML(wsName)}">
  <Table ss:DefaultColumnWidth="120">
    <Column ss:Index="1" ss:Width="180" ss:AutoFitWidth="1"/>
    <Column ss:Index="2" ss:Width="760" ss:AutoFitWidth="1"/>
    <Row><Cell ss:StyleID="h"><Data ss:Type="String">Case Number</Data></Cell><Cell><Data ss:Type="String">${escapeXML(r.caseNumber||'')}</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">Name</Data></Cell><Cell><Data ss:Type="String">${escapeXML(r.name||'')}</Data></Cell></Row>
    ${rows}
  </Table>
</Worksheet>`;
  }).join('\n');

  return header + sheets + '\n</Workbook>';
}

// MV3-friendly download (service worker)
async function downloadWorkbook(results){
  const xml = buildWorkbookXML(results);
  const bytes = new TextEncoder().encode(xml);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  const base64 = btoa(binary);
  const url = "data:application/vnd.ms-excel;base64," + base64;

  await chrome.downloads.download({
    url,
    filename: `Cases_${new Date().toISOString().slice(0,10)}.xml`,
    saveAs: true
  });
}

function updateStatus(line){
  chrome.storage.local.set({ cs_status: line }).catch(()=>{});
}
function setProgress(done, total, results){
  chrome.action.setBadgeText({ text: String(Math.min(done,999)) }).catch(()=>{});
  chrome.action.setBadgeBackgroundColor({ color: '#0ea5e9' }).catch(()=>{});
  chrome.storage.local.set({ cs_progress: done, cs_total: total, cs_results: results||[] }).catch(()=>{});
}

function openStartTabActive(url){
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url: url || START_URL_FALLBACK, active: true }, (tab) => {
      if(chrome.runtime.lastError){ reject(chrome.runtime.lastError); return; }
      if(tab.status === 'complete'){ resolve(tab.id); return; }
      const listener = (tabId, info) => {
        if(tabId === tab.id && info.status === 'complete'){
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(tab.id);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

// Force a full navigation and wait for "complete"
function navigateFull(tabId, targetUrl, timeoutMs=30000){
  return new Promise((resolve) => {
    let settled = false;
    const onUpd = (id, info) => {
      if(id === tabId && info.status === 'complete'){
        cleanup(); settled = true; resolve(true);
      }
    };
    const cleanup = () => { try{ chrome.tabs.onUpdated.removeListener(onUpd); }catch(_){ } };
    chrome.tabs.onUpdated.addListener(onUpd);
    try{ chrome.tabs.update(tabId, { url: targetUrl }); }catch(_){}
    setTimeout(() => { if(!settled){ cleanup(); resolve(false); } }, timeoutMs);
  });
}

// HARD refresh (cache-bypass) and wait for "complete"
function hardReload(tabId, timeoutMs=30000){
  return new Promise((resolve) => {
    let settled = false;
    const onUpd = (id, info) => {
      if(id === tabId && info.status === 'complete'){
        cleanup(); settled = true; resolve(true);
      }
    };
    const cleanup = () => { try{ chrome.tabs.onUpdated.removeListener(onUpd); }catch(_){ } };
    chrome.tabs.onUpdated.addListener(onUpd);
    try{ chrome.tabs.reload(tabId, { bypassCache: true }); }catch(_){}
    setTimeout(() => { if(!settled){ cleanup(); resolve(false); } }, timeoutMs);
  });
}

async function waitForContentScript(tabId){
  for(let i=0;i<60;i++){
    const res = await sendToTab(tabId, { cmd: 'ping' }, 800);
    if(res && res.pong) return true;
    await sleep(250);
  }
  throw new Error('Could not reach content script. Check Site access (extension details).');
}

// ---------- PDF helpers ----------
function bytesLookLikePdf(bytes){
  return bytes && bytes.length >= 5 &&
         bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

async function fetchPdfAttempt(url){
  const resp = await fetch(url, { credentials: 'include' });
  if(!resp.ok) throw new Error('Failed to fetch: ' + resp.status);
  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const ctype = (resp.headers.get('content-type')||'').toLowerCase();
  return { bytes, contentType: ctype };
}

// ---- Cloud OCR call (OCR.space) ----
async function ocrSpaceFromBytes(bytes){
  if(!OCRSPACE_KEY || OCRSPACE_KEY === 'PUT_YOUR_OCR_SPACE_API_KEY_HERE'){
    return { error: 'OCR API key missing. Edit background.js OCRSPACE_KEY.' };
  }
  const fd = new FormData();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  fd.append('file', blob, 'doc.pdf');
  // Quality/behavior hints
  fd.append('language', 'eng');
  fd.append('isOverlayRequired', 'false');
  fd.append('scale', 'true');       // improves OCR for small text
  fd.append('isTable', 'true');     // let engine try to keep table lines
  fd.append('OCREngine', '2');      // engine 2 (better for scans)

  const resp = await fetch(OCRSPACE_ENDPOINT, {
    method: 'POST',
    headers: { 'apikey': OCRSPACE_KEY },
    body: fd
  });
  if(!resp.ok) return { error: `OCR HTTP ${resp.status}` };
  const json = await resp.json().catch(()=>null);
  if(!json) return { error: 'OCR: invalid JSON' };
  if(json.IsErroredOnProcessing){
    const msg = (json.ErrorMessage && json.ErrorMessage.join ? json.ErrorMessage.join('; ') : json.ErrorMessage) || 'OCR error';
    return { error: `OCR: ${msg}` };
  }
  const text = (json.ParsedResults || []).map(r => r.ParsedText || '').join('\n\n').trim();
  return { text };
}

// ----- Capture by URL (open visible tab, then fetch + OCR or text fallback) -----
async function captureDocumentByUrl(url){
  try{
    if(!url) return {};
    const abs = new URL(url, 'https://www.courts.mo.gov/').toString();

    return new Promise((resolveOuter) => {
      chrome.tabs.create({ url: abs, active: true }, async (tab) => {
        const tabId = tab.id;
        try { chrome.windows.update(tab.windowId, { focused: true }); } catch(_){}
        const listener = async (id, info) => {
          if(id === tabId && info.status === 'complete'){
            chrome.tabs.onUpdated.removeListener(listener);

            await sleep(1200); // small buffer

            try{
              const tinfo = await getTabSafe(tabId);
              const finalUrl = (tinfo && tinfo.url) ? tinfo.url : abs;

              try {
                const { bytes, contentType } = await fetchPdfAttempt(finalUrl);
                if (contentType.includes('pdf') || bytesLookLikePdf(bytes)) {
                  const payload = await ocrSpaceFromBytes(bytes);
                  safeCloseTab(tabId);
                  resolveOuter(payload);
                  return;
                }
              } catch(_fetchErr) { /* fall back below */ }

              const exec = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => ({ text: (document.body && document.body.innerText ? document.body.innerText : '') })
              }).catch(()=>[]);
              const result = exec && exec[0] && exec[0].result ? exec[0].result : {};
              safeCloseTab(tabId);
              resolveOuter(result || {});
            }catch(e){
              safeCloseTab(tabId);
              resolveOuter({ error: String(e), url: abs });
            }
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    });
  }catch(e){
    return { error: String(e), url };
  }
}

// --------- Watch NEXT new tab (for window.open/no-href) with switch + OCR ---------
let pendingDocCapture = null;
function setupNextTabCapture(timeoutMs=25000){
  if (pendingDocCapture && pendingDocCapture.cleanup) pendingDocCapture.cleanup();
  pendingDocCapture = {
    sendResponse: null, timer: null, createdHandler: null, updatedHandler: null, tabId: null,
    cleanup(){
      try{
        if(this.createdHandler) chrome.tabs.onCreated.removeListener(this.createdHandler);
        if(this.updatedHandler) chrome.tabs.onUpdated.removeListener(this.updatedHandler);
        if(this.timer) clearTimeout(this.timer);
      }catch(_){}
    }
  };
  pendingDocCapture.createdHandler = (tab) => {
    if(!pendingDocCapture) return;
    pendingDocCapture.tabId = tab.id;
    try { chrome.tabs.update(tab.id, { active: true }); } catch(_){}
    try { chrome.windows.update(tab.windowId, { focused: true }); } catch(_){}

    pendingDocCapture.updatedHandler = async (id, info) => {
      if(id === pendingDocCapture.tabId && info.status === 'complete'){
        chrome.tabs.onUpdated.removeListener(pendingDocCapture.updatedHandler);

        await sleep(1200);

        try{
          const tinfo = await getTabSafe(id);
          const url = (tinfo && tinfo.url) ? tinfo.url : '';
          let payload = {};

          try {
            const { bytes, contentType } = await fetchPdfAttempt(url);
            if (contentType.includes('pdf') || bytesLookLikePdf(bytes)) {
              payload = await ocrSpaceFromBytes(bytes);
            } else {
              const exec = await chrome.scripting.executeScript({
                target: { tabId: id },
                func: () => ({ text: (document.body && document.body.innerText ? document.body.innerText : '') })
              }).catch(()=>[]);
              payload = (exec && exec[0] && exec[0].result) ? exec[0].result : {};
            }
          }catch(_fetchErr){
            const exec2 = await chrome.scripting.executeScript({
              target: { tabId: id },
              func: () => ({ text: (document.body && document.body.innerText ? document.body.innerText : '') })
            }).catch(()=>[]);
            payload = (exec2 && exec2[0] && exec2[0].result) ? exec2[0].result : {};
          }

          safeCloseTab(id);
          if(pendingDocCapture && pendingDocCapture.sendResponse){
            const sr = pendingDocCapture.sendResponse; pendingDocCapture.sendResponse = null;
            pendingDocCapture.cleanup(); pendingDocCapture = null;
            sr(payload);
          }
        }catch(e){
          safeCloseTab(id);
          if(pendingDocCapture && pendingDocCapture.sendResponse){
            const sr = pendingDocCapture.sendResponse; pendingDocCapture.sendResponse = null;
            pendingDocCapture.cleanup(); pendingDocCapture = null;
            sr({ error: String(e) });
          }
        }
      }
    };
    chrome.tabs.onUpdated.addListener(pendingDocCapture.updatedHandler);
  };
  chrome.tabs.onCreated.addListener(pendingDocCapture.createdHandler);
  pendingDocCapture.timer = setTimeout(() => {
    if(pendingDocCapture && pendingDocCapture.sendResponse){
      const sr = pendingDocCapture.sendResponse; pendingDocCapture.sendResponse = null;
      pendingDocCapture.cleanup(); pendingDocCapture = null;
      sr({ error: 'timeout' });
    }
  }, timeoutMs);
}

// --------------- Run state ---------------
let RUNNING = false;
let ABORT = false;
let RUN = { startUrl: '', cases: [], results: [], tabId: null };

// --------------- Message bus ---------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if(!msg) return sendResponse({});

    if(msg.cmd === 'prepare-doc-capture'){ setupNextTabCapture(25000); sendResponse({ ok:true }); return; }
    if(msg.cmd === 'await-doc-capture'){
      if(pendingDocCapture){ pendingDocCapture.sendResponse = sendResponse; return true; }
      sendResponse({ error: 'no pending capture' }); return;
    }

    if(msg.cmd === 'capture-doc' && msg.url){
      const data = await captureDocumentByUrl(msg.url);
      sendResponse(data); return;
    }

    if(msg.cmd === 'stop-run'){ ABORT = true; updateStatus('Stop requested.'); sendResponse({ ok:true }); return; }

    if(msg.cmd === 'download-workbook'){
      if(RUN.results && RUN.results.length){
        await downloadWorkbook(RUN.results);
        sendResponse({ ok:true });
      } else {
        updateStatus('No results to download yet.');
        sendResponse({ ok:false });
      }
      return;
    }

    if(msg.cmd === 'start-run' && msg.payload){
      if(RUNNING){ updateStatus('Already running; please wait or press Stop.'); sendResponse({ ok:false, error:'busy' }); return; }
      const { startUrl, cases } = msg.payload;
      RUNNING = true; ABORT = false;
      RUN = { startUrl: startUrl || START_URL_FALLBACK, cases, results: [], tabId: null };
      updateStatus(`Opening start URL…`);
      try{
        const tabId = await openStartTabActive(RUN.startUrl);
        RUN.tabId = tabId;
        updateStatus('Start page loaded. Connecting…');
        await waitForContentScript(tabId);
        updateStatus('Connected. Processing cases…');
        await sendToTab(tabId, { cmd: 'bind-escape' }, 2000);

        let done = 0;
        for(const entry of cases){
          if(ABORT) break;
          const caseNo = entry.caseNumber;
          updateStatus(`→ ${caseNo} (${entry.name||'n/a'})`);

          // Charges page
          await navigateFull(tabId, chargesUrl(caseNo), 30000);
          try { await waitForContentScript(tabId); } catch(_) {}
          const charges = await sendToTab(tabId, { cmd: 'extract-page-text' }, 60000);
          const chargesText = charges && charges.text ? charges.text : '';

          // Docket page: full nav + hard refresh
          await navigateFull(tabId, docketUrl(caseNo), 30000);
          await hardReload(tabId, 30000);
          try { await waitForContentScript(tabId); } catch(_) {}
          const docket = await sendToTab(tabId, { cmd: 'extract-docket-and-docs' }, 360000);

          RUN.results.push({
            caseNumber: caseNo,
            name: entry.name || '',
            charges: chargesText || '',
            docket: (docket && docket.docketText) || '',
            probableCauseText: (docket && docket.pcsText) || '',
            probableCauseUrl: (docket && docket.pcsUrl) || '',
            probableCauseError: (docket && docket.pcsError) || '',
            summonsText: (docket && docket.summText) || '',
            summonsUrl: (docket && docket.summUrl) || '',
            summonsError: (docket && docket.summError) || ''
          });

          updateStatus('   ✓ Captured');
          done++;
          setProgress(done, cases.length, RUN.results);
          await sleep(200);
        }

        if(!ABORT && RUN.results.length){
          updateStatus('Building workbook…');
          await downloadWorkbook(RUN.results);
          updateStatus('Done. You can re-download via the popup "Download Workbook" button.');
        } else if(ABORT){
          updateStatus('Stopped.');
        } else {
          updateStatus('No results.');
        }
        sendResponse({ ok:true });
      }catch(e){
        updateStatus('Error: ' + (e?.message || e));
        sendResponse({ ok:false, error: e?.message || String(e) });
      }finally{
        RUNNING = false;
        chrome.action.setBadgeText({ text: '' });
      }
      return;
    }

    sendResponse({});
  })();
  return true; // async
});
