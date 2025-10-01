/* global chrome */
(() => {
  let ABORT = false;

  // ======= Visual driver (so you can see it act) =======
  const VISUAL = true;
  let pointerEl = null;
  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
  function ensurePointer(){
    if (pointerEl || !VISUAL) return;
    pointerEl = document.createElement('div');
    Object.assign(pointerEl.style, {
      position:'fixed', width:'14px', height:'14px', borderRadius:'50%',
      background:'#0ea5e9', boxShadow:'0 0 0 3px rgba(14,165,233,.25)',
      transform:'translate(-9999px,-9999px)', transition:'transform .25s ease, opacity .25s ease',
      opacity:'0.95', zIndex: 2147483647, pointerEvents:'none'
    });
    document.documentElement.appendChild(pointerEl);
  }
  async function visualMoveTo(el){
    if(!VISUAL || !el) return;
    ensurePointer();
    el.scrollIntoView({ behavior:'smooth', block:'center' });
    await sleep(350);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + r.height/2;
    pointerEl.style.transform = `translate(${Math.max(6, x)}px, ${Math.max(6, y)}px)`;
  }
  function ripple(el){
    if(!VISUAL || !el) return;
    const ring = document.createElement('div');
    Object.assign(ring.style, {
      position:'fixed', width:'10px', height:'10px', borderRadius:'50%',
      border:'2px solid rgba(14,165,233,.8)', transform:'translate(-9999px,-9999px)',
      zIndex: 2147483647, pointerEvents:'none', opacity:'1', transition:'transform .4s ease, opacity .4s ease'
    });
    document.documentElement.appendChild(ring);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + r.height/2;
    ring.style.transform = `translate(${x-6}px, ${y-6}px) scale(1)`;
    requestAnimationFrame(() => { ring.style.transform = `translate(${x-6}px, ${y-6}px) scale(6)`; ring.style.opacity = '0'; });
    setTimeout(() => ring.remove(), 450);
  }
  async function visualClick(el){
    if(!el) return;
    await visualMoveTo(el);
    ripple(el);
    try{ el.click?.(); el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window})); }catch(_){}
  }

  // ======= Helpers =======
  function s(t){ return (t||'').replace(/\s+/g,' ').trim(); }
  function visible(el){
    try{
      const cs = getComputedStyle(el);
      if(!cs || cs.display==='none' || cs.visibility==='hidden') return false;
      if(el.offsetParent===null && cs.position!=='fixed') return false;
      if(el.disabled) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }catch(e){ return true; }
  }
  function qAll(sel){ return Array.from(document.querySelectorAll(sel)); }

  // Wait until text stops changing for stableForMs (or until maxWaitMs)
  async function waitForStableText(root, stableForMs=900, maxWaitMs=8000){
    const getLen = () => (s((root || document.body).innerText || '')).length;
    let last = getLen();
    let stableSince = Date.now();
    const start = Date.now();
    while(Date.now() - start < maxWaitMs){
      await sleep(300);
      const cur = getLen();
      if(cur !== last){ last = cur; stableSince = Date.now(); }
      if(Date.now() - stableSince >= stableForMs) return true;
    }
    return false;
  }

  function fullPageText(){
    const root = document.querySelector('main') || document.body;
    return s(root ? root.innerText : (document.body?.innerText || '')).slice(0, 900000);
  }

  function findLinkByText(txt){
    const T = txt.toLowerCase();
    const links = qAll('a[href], [role=link][href], a[onclick], a[target], a');
    for(const a of links){
      if(!visible(a)) continue;
      const label = s(a.innerText || a.textContent || a.getAttribute('aria-label') || a.getAttribute('title') || '');
      if(!label) continue;
      if(label.toLowerCase().includes(T)) return a;
    }
    return null;
  }

  // ======= Docket "Ctrl-F" style find (returns ALL matching rows; newest first) =======
  function findRowsForPhrase(phrase){
    const P = phrase.toLowerCase();
    const out = [];

    // Prefer tables
    const tables = qAll('table');
    for(const tbl of tables){
      const rows = Array.from(tbl.querySelectorAll('tr'));
      for(const tr of rows){
        if(!visible(tr)) continue;
        const txt = s(tr.innerText || tr.textContent || '');
        if(!txt) continue;
        if(txt.toLowerCase().includes(P)) out.push(tr);
      }
    }
    // Also lists/blocks
    const blocks = qAll('li, div, p');
    for(const b of blocks){
      if(!visible(b)) continue;
      const txt = s(b.innerText || b.textContent || '');
      if(!txt) continue;
      if(txt.toLowerCase().includes(P)) out.push(b);
    }

    // Newest-first guess: last occurrences are likely newest; reverse the visual order
    return out.reverse();
  }

  const DOC_KEYWORDS = ['document', 'doc', 'pdf', 'view', 'display', 'open', 'imaged', 'image', 'file'];

  function looksLikeDocAnchor(node){
    if(!node) return false;
    if(!visible(node)) return false;
    const tag = (node.tagName || '').toLowerCase();
    const href = (node.getAttribute && node.getAttribute('href')) ? node.getAttribute('href') : '';
    const label = s((node.innerText || node.textContent || node.getAttribute?.('title') || node.getAttribute?.('aria-label') || ''));

    const h = (href || '').toLowerCase();
    const l = label.toLowerCase();

    if (tag === 'a' && h.includes('.pdf')) return true;
    if (DOC_KEYWORDS.some(k => h.includes(k))) return true;
    if (DOC_KEYWORDS.some(k => l.includes(k))) return true;

    const oc = (node.getAttribute && node.getAttribute('onclick')) ? node.getAttribute('onclick') : '';
    if(oc && /pdf|doc|open|window\.open/i.test(oc)) return true;

    // Sometimes the phrase itself is the link; accept any anchor with href
    if(tag === 'a' && h) return true;

    return false;
  }

  function anchorInRowMatchingPhrase(row, phrase){
    const P = phrase.toLowerCase();
    const cands = Array.from(row.querySelectorAll('a, [role=link], button, [onclick]')).filter(visible);
    const byLabel = cands.find(el => s(el.innerText || el.textContent || '').toLowerCase().includes(P));
    if(byLabel) return byLabel;
    return cands.find(looksLikeDocAnchor) || null;
  }

  function anchorNearRow(row, phrase, neighborSpan=3){
    const inRow = anchorInRowMatchingPhrase(row, phrase);
    if(inRow) return inRow;

    const tr = row.closest('tr');
    const tbl = row.closest('table');
    if(tr && tbl){
      const allRows = Array.from(tbl.querySelectorAll('tr'));
      const idx = allRows.indexOf(tr);
      const seq = [];
      for(let d=1; d<=neighborSpan; d++){ seq.push(idx+d, idx-d); }
      for(const i of seq){
        const r = allRows[i];
        if(!r) continue;
        const a = anchorInRowMatchingPhrase(r, phrase);
        if(a) return a;
      }
    }
    // Last resort: any doc-ish link on page
    const global = qAll('a, [role=link], button, [onclick]').filter(visible).find(looksLikeDocAnchor);
    return global || null;
  }

  // Extract a PDF URL from javascript:... or onclick code
  function extractUrlFromJsAttr(str){
    if(!str) return '';
    try{
      const m = String(str).match(/['"]([^'"]+\.pdf[^'"]*)['"]/i);
      if(m && m[1]) return m[1];
    }catch(_){}
    return '';
  }

  async function captureDocFromElement(node){
    try{
      let href = (node.getAttribute && node.getAttribute('href')) ? node.getAttribute('href') : '';
      if(href && href.trim().toLowerCase().startsWith('javascript:')){
        const possible = extractUrlFromJsAttr(href);
        href = possible || '';
      }
      if(!href){
        const oc = (node.getAttribute && node.getAttribute('onclick')) ? node.getAttribute('onclick') : '';
        const possible = extractUrlFromJsAttr(oc);
        if(possible) href = possible;
      }
      if(href){
        // Open via background (makes tab active, waits 2s, parses/OCRs text)
        return await chrome.runtime.sendMessage({ cmd: 'capture-doc', url: href });
      }else{
        // Window opens via JS with no extractable URL — use watcher
        await chrome.runtime.sendMessage({ cmd: 'prepare-doc-capture' });
        await visualClick(node);
        const res = await chrome.runtime.sendMessage({ cmd: 'await-doc-capture' });
        return res || {};
      }
    }catch(e){
      return { error: String(e) };
    }
  }

  // ========== OPEN-ONCE GUARD ==========
  const openedOnce = { pcs: false, summ: false };

  /**
   * Pick ONE best candidate anchor for the given phrases (newest first), then open exactly once.
   * If not found, return {error: "..."} and do NOT open anything.
   */
  async function openOneByPhrases(phrases, guardKey){
    if(openedOnce[guardKey]) return { error: `skipped: already opened ${guardKey}` };

    // Find best candidate row+anchor WITHOUT opening anything yet
    let best = null;
    let bestPhrase = '';
    for(const phrase of phrases){
      const rows = findRowsForPhrase(phrase);
      if(rows.length === 0) continue;

      // Only consider a small number of newest matches to avoid scanning entire history
      const toCheck = rows.slice(0, 3);
      for(const row of toCheck){
        const anchor = anchorNearRow(row, phrase, 3);
        if(anchor){
          best = anchor; bestPhrase = phrase;
          break;
        }
      }
      if(best) break;
    }

    if(!best){
      return { error: `Not found on page for phrases: ${phrases.join(' | ')}` };
    }

    // Mark as opened BEFORE we actually open, so retries (if any) won't re-open
    openedOnce[guardKey] = true;

    // Now open exactly once
    await visualMoveTo(best);
    const res = await captureDocFromElement(best);
    // Return whatever we got (text, url, or error) — but do not try another link
    return res || { error: 'unknown result' };
  }

  function bindEscape(){ window.addEventListener('keydown', (e) => { if(e.key === 'Escape'){ ABORT = true; } }); }

  // -------- Ensure we're actually on Docket Entries --------
  async function ensureDocketActive(){
    try{
      // If hash isn't #docket, set it and fire hashchange
      if((location.hash || '').toLowerCase() !== '#docket'){
        location.hash = '#docket';
        try { window.dispatchEvent(new HashChangeEvent('hashchange')); } catch(_){}
      }
      // If there's a tab link, click it
      const de = findLinkByText('Docket Entries') || document.querySelector('a[href*="#docket"], [data-target*="docket"]');
      if(de){ await visualClick(de); }
      // Give UI time to switch and content to render
      await sleep(1500);
      await waitForStableText(document.body, 900, 8000);
    }catch(_){}
  }

  // ======= Message handlers =======
  async function extractPageText(){
    await sleep(500);
    await waitForStableText(document.body, 800, 6000);
    return { ok:true, text: fullPageText() };
  }

  async function extractDocketAndDocs(){
    // Reset per-case guards
    openedOnce.pcs = false;
    openedOnce.summ = false;

    // Make sure Docket is the active view, then wait a bit more as requested
    await ensureDocketActive();
    await sleep(400); // extra nudge

    // Docket text (entire page)
    const docketText = fullPageText();

    // Phrases to look for
    const PCS_PHRASES  = ['Probable Cause Statement Filed']; // strict
    const SUMM_PHRASES = [
      'Criminal Summons Issued',        // primary
      'Summons Issued - Criminal',      // common variant
      'Criminal Summons',               // fallback
      'Summons Issued'                  // last resort (may also match civil)
    ];

    // Probable Cause — open once if found
    let pcsText = '', pcsUrl = '', pcsError = '';
    try{
      const pcs = await openOneByPhrases(PCS_PHRASES, 'pcs');
      if(pcs && pcs.text){ pcsText = pcs.text; }
      else if(pcs && pcs.url){ pcsUrl = pcs.url; }
      else if(pcs && pcs.error){ pcsError = pcs.error; }
      else pcsError = 'Unknown error';
    }catch(e){ pcsError = String(e); }

    // Small pause between document openings
    await sleep(500);

    // Criminal Summons — open once if found (same behavior as PCS)
    let summText = '', summUrl = '', summError = '';
    try{
      const summ = await openOneByPhrases(SUMM_PHRASES, 'summ');
      if(summ && summ.text){ summText = summ.text; }
      else if(summ && summ.url){ summUrl = summ.url; }
      else if(summ && summ.error){ summError = summ.error; }
      else summError = 'Unknown error';
    }catch(e){ summError = String(e); }

    if(ABORT) return { ok:false, error:'aborted' };
    return { ok:true, docketText, pcsText, pcsUrl, pcsError, summText, summUrl, summError };
  }

  // Router
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      if(!msg) return sendResponse({});
      if(msg.cmd === 'ping'){ sendResponse({ pong:true }); }
      else if(msg.cmd === 'bind-escape'){ bindEscape(); sendResponse({ ok:true }); }
      else if(msg.cmd === 'extract-page-text'){ const r = await extractPageText(); sendResponse(r); }
      else if(msg.cmd === 'extract-docket-and-docs'){ const r = await extractDocketAndDocs(); sendResponse(r); }
      else { sendResponse({}); }
    })();
    return true;
  });

})();
