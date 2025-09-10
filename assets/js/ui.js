// assets/js/ui.js — COMPLETE (date-driven status, counters, sorting, admin, email)

// ------------------------ Imports ------------------------
import { CONFIG } from "./config.js";
import { syncFromClassroom } from "./classroom.js";
import {
  loadRecipients, saveRecipients,
  loadTemplates,  saveTemplates,
  loadNotifySettings, saveNotifySettings,
  loadBypass,     saveBypass
} from "./state.js";
import { sendEmailsToConfiguredRecipients } from "./email.js";

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
let assignments = []; // normalized & classified items used for rendering
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

// UI wording on the pill
const displayLabel = (status) => (status === "UPCOMING") ? "DUE" : status.replaceAll("_"," ");

// map status → CSS class
const statusClass = (s)=>{
  if(s==="BYPASSED")     return "byp";
  if(s==="LATE")         return "late";
  if(s==="DUE_TODAY")    return "today";
  if(s==="DUE_TOMORROW") return "tomorrow";
  if(s==="DONE"||s==="COMPLETED") return "done";
  if(s==="SUBMITTED")    return "sub";
  if(s==="RETURNED")     return "ret";
  return "up"; // UPCOMING → green
};

// sort order for groups
const weight = (s)=>{
  const order = {
    "LATE":0, "DUE_TODAY":1, "DUE_TOMORROW":2, "UPCOMING":3,
    "SUBMITTED":4, "RETURNED":5, "DONE":6, "COMPLETED":6, "BYPASSED":7
  };
  return (s in order) ? order[s] : 9;
};

// submission labels from provider
const submissionLabel = (a)=>{
  switch ((a.submissionState||"").toUpperCase()){
    case "TURNED_IN": return "SUBMITTED";
    case "RETURNED":  return "RETURNED";
    default: return null;
  }
};

// STRICT date-based classifier (ignore feed status; honor BYPASSED + SUBMITTED/RETURNED)
function classifyFromDate(base, bypassMap){
  if (bypassMap[base.id]) return "BYPASSED";

  const sub = submissionLabel(base);
  if (sub) return sub;

  const iso = base.dueDateISO;
  const due = iso ? new Date(iso) : null;
  const now = new Date();

  if (!due) return "UPCOMING";
  if (due < now) return "LATE";

  const today    = startOfDay(now);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);

  if (sameDay(due, today))    return "DUE_TODAY";
  if (sameDay(due, tomorrow)) return "DUE_TOMORROW";
  return "UPCOMING";
}

// ------------------------ Counters (status bar) ------------------------
function recomputeSummary(list){
  let kLate=0,kToday=0,kTom=0,kUp=0,kSub=0,kRet=0;
  for (const a of list) {
    if (a.status === "SUBMITTED") kSub++;
    if (a.status === "RETURNED")  kRet++;
    switch (a.status) {
      case "LATE":        kLate++;   break;
      case "DUE_TODAY":   kToday++;  break;
      case "DUE_TOMORROW":kTom++;    break;
      case "UPCOMING":    kUp++;     break;
    }
  }
  const set = (sel, v) => { const n = document.querySelector(sel); if (n) n.textContent = String(v); };
  set("#kLate", kLate); set("#kToday", kToday); set("#kTom", kTom); set("#kUp", kUp); set("#kSub", kSub); set("#kRet", kRet);
}

// visually dim the tiles based on filters (if present)
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
  return fUpcoming; // UPCOMING & everything else
}

// ------------------------ Rendering ------------------------
function render(){
  if (!cards) return;
  cards.innerHTML = "";

  // Sort (group weight, then due time, then title)
  const sorted = [...assignments].sort((a,b)=> (a._weight - b._weight) || (a._dueMs - b._dueMs) || a.title.localeCompare(b.title));

  let shown = 0;
  for (const a of sorted){
    if (!shouldShow(a)) continue;
    shown++;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-head">
        <div class="title">
          <span class="dot ${statusClass(a.status)}"></span>
          ${a.title || "Untitled"}
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
          <button class="btn byp">${a.status==="BYPASSED" ? "Unbypass" : "Bypass"}</button>
        </div>
      </div>
    `;

    // Bypass toggle
    card.querySelector(".byp")?.addEventListener("click", ()=>{
      const pwd = prompt("Admin password to toggle bypass:");
      if(pwd !== CONFIG.adminPassword){ alert("Incorrect password."); return; }

      const map = loadBypass() || {};
      if (map[a.id]) { delete map[a.id]; } else { map[a.id] = true; }
      saveBypass(map);

      // Re-classify based on current date/bypass, then refresh counters/UI
      a.status  = classifyFromDate(a._base, map);
      a._label  = displayLabel(a.status);
      a._weight = weight(a.status);

      recomputeSummary(assignments);
      syncCountersFromFilters();
      render();
      toast(a.status==="BYPASSED" ? "Bypassed" : "Unbypassed");
    });

    cards.appendChild(card);
  }

  if (empty) empty.classList.toggle("hidden", shown>0);
}

// ------------------------ Data Arrival (from classroom.js) ------------------------
document.addEventListener("assignments:loaded", (e)=>{
  const raw = Array.isArray(e.detail) ? e.detail : [];
  const bypassMap = loadBypass() || {};

  // normalize → classify STRICTLY by date (ignore feed status)
  assignments = raw.map(r => {
    const base = {
      id: String(r.id ?? `${r.title}-${r.dueDateISO??""}-${Math.random().toString(36).slice(2)}`),
      title: r.title || r.name || "Untitled",
      course: r.course || r.courseName || r.courseTitle || "",
      notes: r.description || r.notes || "",
      dueDateISO: toISO(r.dueDateISO || r.due || r.dueDate),
      submissionState: r.submissionState || r.submission_state
    };

    const cls = classifyFromDate(base, bypassMap);
    return {
      ...base,
      _base:   base,
      status:  cls,
      _label:  displayLabel(cls),
      _weight: weight(cls),
      _dueMs:  base.dueDateISO ? Date.parse(base.dueDateISO) : Number.POSITIVE_INFINITY
    };
  });

  recomputeSummary(assignments);
  syncCountersFromFilters();
  render();
});

function wireSync(){
  const btn = el("#syncBtn");
  if(!btn) return;
  btn.addEventListener("click", async ()=>{
    try{
      loading && (loading.style.display = "block");
      btn.disabled = true;
      await syncFromClassroom();   // classroom.js will dispatch "assignments:loaded"
    }catch(err){
      console.error(err);
      toast("Sync failed");
      alert(String(err?.message||err));
    }finally{
      btn.disabled = false;
      loading && (loading.style.display = "none");
    }
  });
}

function wireAdminModal(){
  const modal = el("#adminModal");
  if(!modal) return;

  el("#adminBtn")?.addEventListener("click", ()=>modal.showModal());
  el("#adminClose")?.addEventListener("click", ()=>modal.close());

  el("#adminPwToggle")?.addEventListener("click", (ev)=>{
    const inp = el("#adminPassword"); if(!inp) return;
    const isPass = inp.type === "password"; inp.type = isPass ? "text" : "password";
    ev.currentTarget.setAttribute("aria-label", isPass ? "Hide password":"Show password");
  });

  el("#adminUnlock")?.addEventListener("click", ()=>{
    const ok = (el("#adminPassword")?.value?.trim() === CONFIG.adminPassword);
    if (!ok){ el("#adminErr")?.classList.remove("hidden"); return; }
    el("#adminErr")?.classList.add("hidden");
    el("#adminGate")?.classList.add("hidden");
    el("#adminBody")?.classList.remove("hidden");
    loadAdminUI(); buildBypassList();
  });
}

// ---- Admin panels ----
function buildRecipientsPanel(){
  const list = el("#recipientsList"); if(!list) return;
  const data = loadRecipients() || [];
  list.innerHTML = "";
  data.forEach(r=>{
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<div>${r.name||"—"}</div>
                     <div>${r.email||"—"}</div>
                     <div>${r.telegram_chat_id||r.chatId||"—"}</div>
                     <div><button class="btn rm">Remove</button></div>`;
    row.querySelector(".rm")?.addEventListener("click", ()=>{
      const next = (loadRecipients()||[]).filter(x =>
        !(x.name===r.name && x.email===r.email && (x.telegram_chat_id||x.chatId)===(r.telegram_chat_id||r.chatId))
      );
      saveRecipients(next); buildRecipientsPanel(); toast("Recipient removed");
    });
    list.appendChild(row);
  });

  el("#addRecipient")?.addEventListener("click", ()=>{
    const name  = el("#recName")?.value?.trim();
    const email = el("#recEmail")?.value?.trim();
    const chat  = el("#recChatId")?.value?.trim();
    if(!name && !email && !chat){ alert("Enter at least a name and an email or telegram chat_id."); return; }
    const next = loadRecipients() || []; next.push({ name, email, telegram_chat_id: chat });
    saveRecipients(next);
    el("#recName").value = ""; el("#recEmail").value = ""; el("#recChatId").value = "";
    buildRecipientsPanel(); toast("Recipient added");
  });
}

function buildTemplatesPanel(){
  const list = el("#templatesList"); if(!list) return;
  const name = el("#tmplName"), body = el("#tmplBody"), add = el("#addTemplate");
  const tpls = loadTemplates() || {};
  function refresh(){
    list.innerHTML = "";
    Object.entries(tpls).forEach(([k,v])=>{
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `<div><strong>${k}</strong></div>
                       <div class="small muted">${(v?.body||"").slice(0,120)}</div>
                       <div><button class="btn rm">Remove</button></div>`;
      row.querySelector(".rm")?.addEventListener("click", ()=>{ delete tpls[k]; saveTemplates(tpls); refresh(); });
      list.appendChild(row);
    });
  }
  add?.addEventListener("click", ()=>{
    const key = name?.value?.trim(); const txt = body?.value ?? "";
    if(!key){ alert("Template key is required"); return; }
    tpls[key] = { body: txt }; saveTemplates(tpls); refresh(); toast("Template saved");
  });
  refresh();
}

function buildRulesPanel(){
  const s = loadNotifySettings();
  const qh = el("#quiet"), soon = el("#dueSoonHrs"), late = el("#onLate"), dsum = el("#summaryTime"), tmpl = el("#alertTemplate");
  if(qh)   qh.value   = s.quiet || "21:00-07:00";
  if(soon) soon.value = String(s.dueSoonHours ?? 24);
  if(late) late.checked = !!s.onLate;
  if(dsum) dsum.value = s.summaryTime || "19:30";
  if(tmpl) tmpl.value = s.alertTemplate || "due_soon";
  el("#rulesSave")?.addEventListener("click", ()=>{
    saveNotifySettings({
      quiet: qh?.value || "21:00-07:00",
      dueSoonHours: Number(soon?.value || 24),
      onLate: !!late?.checked,
      summaryTime: dsum?.value || "19:30",
      alertTemplate: tmpl?.value || "due_soon"
    });
    toast("Rules saved");
  });
}

function buildBypassList(){
  const list = el("#bypassList"); if(!list) return;
  const map = loadBypass() || {};
  list.innerHTML = "";
  const ids = Object.keys(map);
  if(!ids.length){ const d = document.createElement("div"); d.className="muted small"; d.textContent="Nothing is bypassed."; list.appendChild(d); return; }
  ids.forEach(id=>{
    const row = document.createElement("div"); row.className="item";
    row.innerHTML = `<div>Assignment ${id}</div><div><button class="btn unb">Unbypass</button></div>`;
    row.querySelector(".unb")?.addEventListener("click", ()=>{
      const m = loadBypass() || {}; delete m[id]; saveBypass(m);
      const x = assignments.find(a=>a.id===id);
      if(x){ x.status = classifyFromDate(x._base, m); x._label = displayLabel(x.status); x._weight = weight(x.status); }
      recomputeSummary(assignments); render();
    });
    list.appendChild(row);
  });
}

function wireEmailTest(){
  const btn = el("#sendTestEmail"); if(!btn) return;
  const subj = el("#emailTestSubject"), body = el("#emailTestBody"), status = el("#sendTestEmailStatus");
  btn.addEventListener("click", async ()=>{
    const pwd = prompt("Admin password to send test email:");
    if(pwd !== CONFIG.adminPassword) { alert("Incorrect password."); return; }
    btn.disabled = true; if(status) status.textContent = "Sending…";
    try{
      const rsp = await sendEmailsToConfiguredRecipients({ subject: subj?.value || "Homework — Test", text: body?.value || "Test email" });
      if(status) status.textContent = `Sent ${rsp?.sent ?? 0} email(s)`; toast("Email sent");
    }catch(e){ console.error(e); if(status) status.textContent = "Failed"; alert(String(e?.message||e)); }
    finally{ btn.disabled = false; setTimeout(()=>{ if(status) status.textContent=""; }, 4000); }
  });
}

function loadAdminUI(){ buildRecipientsPanel(); buildTemplatesPanel(); buildRulesPanel(); wireEmailTest(); }

// ------------------------ Boot ------------------------
function boot(){
  // Filters
  wireFilters();
  // Sync button
  wireSync();
  // Admin modal
  wireAdminModal();
  // Auto-sync if configured
  if (CONFIG.autoSyncOnLoad) {
    setTimeout(() => el("#syncBtn")?.click(), 50);
  }
}
document.addEventListener("DOMContentLoaded", boot);

// ===== wiring helpers kept last to avoid duplicate declarations =====
function wireFilters(){
  const ctrls = ["#searchInput","#fLate","#fToday","#fTomorrow",
                 "#fUpcoming","#fBypassed","#fSubmitted","#fReturned"];
  ctrls.forEach(sel=>{
    const evt = sel === "#searchInput" ? "input" : "change";
    el(sel)?.addEventListener(evt, ()=>{
      recomputeSummary(assignments);
      syncCountersFromFilters();
      render();
    });
  });
}

function wireAdminModal(){
  const modal = el("#adminModal");
  if(!modal) return;

  el("#adminBtn")?.addEventListener("click", ()=>modal.showModal());
  el("#adminClose")?.addEventListener("click", ()=>modal.close());

  el("#adminPwToggle")?.addEventListener("click", (ev)=>{
    const inp = el("#adminPassword"); if(!inp) return;
    const isPass = inp.type === "password"; inp.type = isPass ? "text" : "password";
    ev.currentTarget.setAttribute("aria-label", isPass ? "Hide password":"Show password");
  });

  el("#adminUnlock")?.addEventListener("click", ()=>{
    const ok = (el("#adminPassword")?.value?.trim() === CONFIG.adminPassword);
    if (!ok){ el("#adminErr")?.classList.remove("hidden"); return; }
    el("#adminErr")?.classList.add("hidden");
    el("#adminGate")?.classList.add("hidden");
    el("#adminBody")?.classList.remove("hidden");
    loadAdminUI(); buildBypassList();
  });
}
