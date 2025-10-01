/* global chrome */

const els = {
  startUrl: document.getElementById('startUrl'),
  file: document.getElementById('file'),
  caseHeader: document.getElementById('caseHeader'),
  nameHeader: document.getElementById('nameHeader'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  status: document.getElementById('status'),
  cases: document.getElementById('cases'),
  bar: document.getElementById('bar')
};

let RESULTS_CACHE = [];

function log(msg){
  els.status.textContent = (els.status.textContent ? els.status.textContent + '\n' : '') + msg;
  els.status.scrollTop = els.status.scrollHeight;
}
function setProgress(n, d){
  const pct = d ? Math.round((n/d) * 100) : 0;
  els.bar.style.width = pct + '%';
}

// --- CSV parsing (simple, RFC4180-ish) ---
function parseCSV(text){
  const rows = [];
  let i=0, s=text, len=s.length, cur='', row=[], inQ=false;
  while(i<len){
    const c = s[i];
    if(inQ){
      if(c === '"'){ if(i+1<len && s[i+1]==='"'){ cur+='"'; i++; } else inQ=false; }
      else cur += c;
    }else{
      if(c === '"') inQ = true;
      else if(c === ','){ row.push(cur); cur=''; }
      else if(c === '\n'){ row.push(cur); rows.push(row); row=[]; cur=''; }
      else if(c === '\r'){ /* ignore */ }
      else cur += c;
    }
    i++;
  }
  if(cur.length || row.length){ row.push(cur); rows.push(row); }
  return rows;
}
const norm = h => (h||'').trim().toLowerCase();
function extractCases(rows, caseHeader='Case Number', nameHeader=''){
  if(!rows.length) return [];
  const headers = rows[0];
  const Hnorm = headers.map(norm);
  const idxCase = Hnorm.indexOf(norm(caseHeader));
  if(idxCase === -1) throw new Error(`Could not find header "${caseHeader}"`);
  const idxName = nameHeader ? Hnorm.indexOf(norm(nameHeader)) : -1;
  const out = [];
  for(const r of rows.slice(1)){
    const caseNumber = (r[idxCase]||'').trim();
    if(!caseNumber) continue;
    const name = (idxName >= 0 ? r[idxName] : (r[0]||'')).trim();
    out.push({ caseNumber, name });
  }
  return out;
}

// Pull live progress from background
async function refreshStatus(){
  try{
    const st = await chrome.storage.local.get(['cs_status','cs_progress','cs_total','cs_results']);
    if(st.cs_status){ log(st.cs_status); chrome.storage.local.remove('cs_status'); }
    if(typeof st.cs_progress === 'number' && typeof st.cs_total === 'number'){
      setProgress(st.cs_progress, st.cs_total);
    }
    if(Array.isArray(st.cs_results)){ RESULTS_CACHE = st.cs_results; }
  }catch(e){}
}

async function start(){
  try {
    els.status.textContent = '';
    els.bar.style.width = '0%';
    const startUrl = (els.startUrl.value||'').trim();
    if(!startUrl){ log('Error: Please enter a Start URL.'); return; }
    const file = els.file.files[0];
    if(!file){ log('Error: Please choose a CSV (Excel → Save As → CSV).'); return; }

    log('Parsing CSV…');
    const rows = parseCSV(await file.text());
    const cases = extractCases(rows, els.caseHeader.value.trim() || 'Case Number', els.nameHeader.value.trim());
    if(!cases.length){ log('Error: No case numbers found. Check the header name.'); return; }

    els.cases.textContent = cases.map((c,i)=> `${i+1}. ${c.caseNumber} — ${c.name || '(no name)'}`).join('\n');
    log(`Starting background run for ${cases.length} case(s)…`);

    await chrome.runtime.sendMessage({
      cmd: 'start-run',
      payload: { startUrl, cases }
    });

    const iv = setInterval(refreshStatus, 700);
    setTimeout(() => clearInterval(iv), 60*60*1000);
  } catch (e){
    log('Error: ' + (e?.message || e));
  }
}

function stop(){
  chrome.runtime.sendMessage({ cmd: 'stop-run' });
  log('Stop requested.');
}

async function downloadWorkbook(){
  await chrome.runtime.sendMessage({ cmd: 'download-workbook' });
}

document.addEventListener('DOMContentLoaded', () => {
  els.startBtn.addEventListener('click', start);
  els.stopBtn.addEventListener('click', stop);
  els.downloadBtn.addEventListener('click', downloadWorkbook);
  refreshStatus();
});
