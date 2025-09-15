// assets/js/ui.js — main app (status/counters/render/sync); admin is in admin.js

// ------------------------ Imports ------------------------
import { CONFIG } from "./config.js";
import { syncFromClassroom } from "./classroom.js";
import { loadBypass } from "./state.js";
import { wireAdmin, ensureTelegramDefaults } from "./admin.js";

// ------------------------ DOM helpers & Toast ------------------------
const el = (s, r=document) => r.querySelector(s);

export function toast(msg){
  const t = el("#toast"), m = el("#toastMsg");
  if(!t || !m) return;
  m.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1800);
}

// ------------------------ View State ------------------------
let assignments = []; // normalized & classified
const cards   = el("#cards");
const loading = el("#loading");
const empty   = el("#empty");

// ------------------------ Utilities ------------------------
const toISO = (x)=>{
  try{
    if(!x) return null;
    if (x instanceof Date) return x.toISOString();
    const d = new Date(x);
    return isNaN(d) ? null : d.toISOString();
  }catch{ return null; }
};
const fmtDate = (iso)=> { try{ return iso ? new Date(iso).toLocaleString() : "—"; }catch{ return "—"; } };
const startOfDay = (d)=>{ const x=new Date(d); x.setHours(0,0,0,0); return x; };
const sameDay = (a,b)=> a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();

const displayLabel = (status) => (status === "UPCOMING") ? "UPCOMING" : (status||"UNKNOWN").replaceAll("_"," ");
const statusClass  = (s)=> s==="BYPASSED" ? "byp"
  : s==="LATE" ? "late"
  : s==="DUE_TODAY" ? "today"
  : s==="DUE_TOMORROW" ? "tomorrow"
  : (s==="DONE"||s==="COMPLETED") ? "done"
  : s==="SUBMITTED" ? "sub"
  : s==="RETURNED"  ? "ret" : "up";

const weight = (s)=>({LATE:0,DUE_TODAY:1,DUE_TOMORROW:2,UPCOMING:3,SUBMITTED:4,RETURNED:5,DONE:6,COMPLETED:6,BYPASSED:7}[s] ?? 9);
const submissionLabel = (a)=> {
  switch ((a.submissionState||"").toUpperCase()){
    case "TURNED_IN": return "SUBMITTED";
    case "RETURNED":  return "RETURNED";
    default: return null;
  }
};
function classifyFromDate(base, bypassMap){
  if (bypassMap && bypassMap[base.id]) return "BYPASSED";
  const sub = submissionLabel(base); if (sub) return sub;
  const iso = base.dueDateISO, due = iso ? new Date(iso) : null, now = new Date();
  if (!due) return "UPCOMING";
  if (due < now) return "LATE";
  const today = startOfDay(now), tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  if (sameDay(due, today)) return "DUE_TODAY";
  if (sameDay(due, tomorrow)) return "DUE_TOMORROW";
  return "UPCOMING";
}

// ------------------------ Counters (status bar) ------------------------
function recomputeSummary(list){
  let kLate=0,kToday=0,kTom=0,kUp=0,kSub=0,kRet=0;
  for (const a of list){
    if (a.status==="SUBMITTED") kSub++;
    if (a.status==="RETURNED")  kRet++;
    if (a.status==="LATE") kLate++;
    else if (a.status==="DUE_TODAY") kToday++;
    else if (a.status==="DUE_TOMORROW") kTom++;
    else if (a.status==="UPCOMING") kUp++;
  }
  const set = (sel, v) => { const n = document.querySelector(sel); if (n) n.textContent = String(v); };
  set("#kLate", kLate); set("#kToday", kToday); set("#kTom", kTom); set("#kUp", kUp); set("#kSub", kSub); set("#kRet", kRet);
}
function syncCountersFromFilters(){
  const map = {Late:"#fLate",Today:"#fToday",Tomorrow:"#fTomorrow",Upcoming:"#fUpcoming",Submitted:"#fSubmitted",Returned:"#fReturned"};
  for (const [key, sel] of Object.entries(map)){
    const cb = document.querySelector(sel);
    const tile = document.querySelector(`.stat.toggle[data-key="${key}"]`);
    if (cb && tile) tile.classList.toggle("off", !cb.checked);
  }
}

// ------------------------ Filters ------------------------
function shouldShow(a){
  const fLate      = el("#fLate")?.checked ?? true;
  const fToday     = el("#fToday")?.checked ?? true;
  const fTomorrow  = el("#fTomorrow")?.checked ?? true;
  const fUpcoming  = el("#fUpcoming")?.checked ?? true;
  const fBypassed  = el("#fBypassed")?.checked ?? false;
  const fSubmitted = el("#fSubmitted")?.checked ?? false;
  const fReturned  = el("#fReturned")?.checked ?? false;

  const q = el("#searchInput")?.value?.trim()?.toLowerCase() || "";
  if (q){
    const hay = `${a.title||""} ${a.course||""} ${a.notes||""} ${a.status||""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }

  if (a.status === "BYPASSED")     return fBypassed;
  if (a.status === "SUBMITTED")    return fSubmitted;
  if (a.status === "RETURNED")     return fReturned;
  if (a.status === "LATE")         return fLate;
  if (a.status === "DUE_TODAY")    return fToday;
  if (a.status === "DUE_TOMORROW") return fTomorrow;
  return fUpcoming;
}

// ------------------------ Rendering ------------------------
function render(){
  if (!cards) return;
  cards.innerHTML = "";

  const sorted = [...assignments].sort((a,b)=> (a._weight - b._weight) || (a._dueMs - b._dueMs) || String(a.title).localeCompare(String(b.title)));
  let shown = 0;

  for (const a of sorted){
    if (!shouldShow(a)) continue;
    shown++;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-head">
        <div class="title">
          <span class="dot ${statusClass(a.status)}"></span>${a.title || "Untitled"}
        </div>
        <div class="badges">
          <span class="badge ${statusClass(a.status)}">${displayLabel(a.status)}</span>
        </div>
      </div>
      <div class="meta">${a.course || "—"} · Due: ${fmtDate(a.dueDateISO)}</div>
      ${a.notes ? `<div class="small">${a.notes}</div>` : ``}
      <div class="card-foot">
        <div class="muted small">${a.status==="BYPASSED" ? "Bypassed" : ""}</div>
        <div class="card-actions">
          <button class="btn byp" data-id="${a.id}">${a.status==="BYPASSED" ? "Unbypass" : "Bypass"}</button>
        </div>
      </div>
    `;
    cards.appendChild(card);
  }

  if (empty) empty.classList.toggle("hidden", shown>0);
}

// ------------------------ Delegated bypass/unbypass ------------------------
function onBypassClick(evt){
  const btn = evt.target.closest("button.byp");
  if (!btn) return;

  const id = btn.getAttribute("data-id");
  if (!id) return;

  const pwd = prompt("Admin password to toggle bypass:");
  if (pwd !== CONFIG.adminPassword) { alert("Incorrect password."); return; }

  // Toggle in local store
  const m = loadBypass() || {};
  if (m[id]) delete m[id]; else m[id] = true;
  localStorage.setItem("bypassMap", JSON.stringify(m));

  // Update the in-memory item so UI reflects immediately
  const a = assignments.find(x => x.id === id);
  if (a) {
    const base = a._base || a;
    a.status  = m[id] ? "BYPASSED" : classifyFromDate(base, m);
    a._label  = displayLabel(a.status);
    a._weight = weight(a.status);
    a._dueMs  = base.dueDateISO ? Date.parse(base.dueDateISO) : Number.POSITIVE_INFINITY;
  }

  recomputeSummary(assignments);
  syncCountersFromFilters();
  render();

  // Optional: write-through so everyone stays in sync
  if (CONFIG?.saveEndpoint) {
    fetch(CONFIG.saveEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: CONFIG.adminPassword, assignments })
    }).catch(err => console.error("saveAssignments failed:", err));
  }
}
cards?.addEventListener("click", onBypassClick, false);

// ------------------------ Data Arrival (from classroom.js) ------------------------
document.addEventListener("assignments:loaded", (e)=>{
  const raw = Array.isArray(e.detail) ? e.detail : [];
  const bypassMap = loadBypass() || {};

  assignments = raw.map(r => {
    const base = {
      id: String(r.id ?? `${r.title}-${r.dueDateISO??""}-${Math.random().toString(36).slice(2)}`),
      title: r.title || r.name || "Untitled",
      course: r.course || r.courseName || r.courseTitle || "",
      notes: r.description || r.notes || "",
      dueDateISO: toISO(r.dueDateISO || r.due || r.dueDate),
      submissionState: r.submissionState || r.submission_state
    };
    const incoming = String(r.status||"").toUpperCase();
    const cls = incoming === "BYPASSED" ? "BYPASSED" : classifyFromDate(base, bypassMap);
  });

  // sync localStorage with any BYPASSED coming from server
  const local = loadBypass() || {};
  let changed = false;
  for (const a of assignments){
    if (a.status === "BYPASSED" && !local[a.id]) { local[a.id] = true; changed = true; }
  }
  if (changed) localStorage.setItem("bypassMap", JSON.stringify(local));

  recomputeSummary(assignments); syncCountersFromFilters(); render();
});

// ------------------------ Wiring ------------------------
function wireFilters(){
  const ctrls = ["#searchInput","#fLate","#fToday","#fTomorrow",
                 "#fUpcoming","#fBypassed","#fSubmitted","#fReturned"];
  ctrls.forEach(sel=>{
    const evt = sel === "#searchInput" ? "input" : "change";
    el(sel)?.addEventListener(evt, ()=>{ recomputeSummary(assignments); syncCountersFromFilters(); render(); });
  });
}
function wireSync(){
  const btn = el("#syncBtn");
  if(!btn) return;
  btn.addEventListener("click", async ()=>{
    try{
      if (loading) loading.style.display = "block";
      btn.disabled = true;
      await syncFromClassroom();   // classroom.js dispatches "assignments:loaded"
    }catch(err){ console.error(err); alert("Sync failed: " + (err?.message||err)); }
    finally{ btn.disabled = false; if (loading) loading.style.display = "none"; }
  });
}

// ------------------------ Boot ------------------------
function boot(){
  ensureTelegramDefaults();
  wireFilters();
  wireSync();
  wireAdmin();
  if (CONFIG.autoSyncOnLoad) setTimeout(() => el("#syncBtn")?.click(), 50);
}
document.addEventListener("DOMContentLoaded", boot);
