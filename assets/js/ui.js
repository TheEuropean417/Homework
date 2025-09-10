// assets/js/ui.js — COMPLETE

import { CONFIG } from "./config.js";
import { syncFromClassroom } from "./classroom.js";
import {
  loadRecipients, saveRecipients,
  loadTemplates,  saveTemplates,
  loadNotifySettings, saveNotifySettings,
  loadBypass,     saveBypass
} from "./state.js";
import { sendEmailsToConfiguredRecipients } from "./email.js";

const el = (s, r=document) => r.querySelector(s);

export function toast(msg){
  const t = el("#toast"), m = el("#toastMsg");
  if(!t || !m) return;
  m.textContent = msg; t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1800);
}

let assignments = [];   // normalized for rendering
const cards   = el("#cards");
const loading = el("#loading");
const empty   = el("#empty");

/* ---------- helpers ---------- */
function fmtDate(iso){ try{ return iso ? new Date(iso).toLocaleString() : "—"; }catch{ return "—"; } }

// derive status if API didn’t set one
function deriveStatus(a){
  if (a.status && a.status !== "UNKNOWN") return a.status;
  if (!a.dueDateISO) return "UPCOMING";
  const now = new Date();
  const due = new Date(a.dueDateISO);
  const today = new Date(now); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  if (due < now) return "LATE";
  if (due.toDateString() === today.toDateString()) return "DUE_TODAY";
  if (due.toDateString() === tomorrow.toDateString()) return "DUE_TOMORROW";
  return "UPCOMING";
}

function statusClass(s){
  if(s === "BYPASSED") return "byp";
  if(s === "LATE")     return "late";
  if(s === "DUE_TODAY")return "today";
  if(s === "DUE_TOMORROW") return "tomorrow";
  if(s === "DONE" || s === "COMPLETED") return "done";
  return "up";
}

/* ---------- filters ---------- */
function shouldShow(a){
  const fLate     = el("#fLate")?.checked ?? true;
  const fToday    = el("#fToday")?.checked ?? true;
  const fTom      = el("#fTomorrow")?.checked ?? true;
  const fUpcoming = el("#fUpcoming")?.checked ?? true;
  const fBypassed = el("#fBypassed")?.checked ?? false;
  const q = el("#searchInput")?.value?.trim()?.toLowerCase() || "";

  if (q){
    const hay = `${a.title||""} ${a.course||""} ${a.notes||""} ${a.status||""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }

  if (a.status === "BYPASSED")  return fBypassed;
  if (a.status === "LATE")      return fLate;
  if (a.status === "DUE_TODAY") return fToday;
  if (a.status === "DUE_TOMORROW") return fTom;
  // treat anything else as upcoming/active
  return fUpcoming;
}

/* ---------- render ---------- */
function render(){
  if (!cards) return;
  cards.innerHTML = "";
  const bypassMap = loadBypass() || {};
  let shown = 0;

  for (const a of assignments){
    const s = a.status === "UNKNOWN" ? deriveStatus(a) : a.status;
    const merged = {...a, status: s};
    if (!shouldShow(merged)) continue;
    shown++;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-head">
        <div class="title"><span class="dot ${statusClass(merged.status)}"></span>${merged.title || "Untitled"}</div>
        <div class="badges"><span class="badge ${statusClass(merged.status)}">${(merged.status||"UNKNOWN").replace("_"," ")}</span></div>
      </div>
      <div class="meta">${merged.course || "—"} · Due: ${fmtDate(merged.dueDateISO)}</div>
      ${merged.notes ? `<div class="small">${merged.notes}</div>` : ``}
      <div class="card-foot">
        <div class="muted small">${bypassMap[merged.id] ? "Bypassed" : ""}</div>
        <div class="card-actions"><button class="btn byp">${bypassMap[merged.id] ? "Unbypass" : "Bypass"}</button></div>
      </div>
    `;
    card.querySelector(".byp")?.addEventListener("click", ()=>{
      const map = loadBypass() || {};
      if (map[merged.id]) delete map[merged.id]; else map[merged.id] = true;
      saveBypass(map); render(); toast(map[merged.id] ? "Bypassed" : "Unbypassed");
    });
    cards.appendChild(card);
  }

  if (empty) empty.classList.toggle("hidden", shown>0);
}

/* ---------- events from loader ---------- */
// classroom.js dispatches this when data arrives
document.addEventListener("assignments:loaded", (e)=>{
  assignments = Array.isArray(e.detail) ? e.detail.map(x => ({
    id:String(x.id ?? `${x.title}-${x.dueDateISO??""}`),
    title: x.title || "Untitled",
    course: x.course || x.courseName || "",
    dueDateISO: x.dueDateISO || null,
    notes: x.description || x.notes || "",
    status: x.status || (x.late ? "LATE" : "UNKNOWN")
  })) : [];
  console.log("[UI] assignments loaded:", assignments.length);
  render();
});

/* ---------- wire controls ---------- */
function wireFilters(){
  el("#searchInput")?.addEventListener("input", render);
  ["#fLate","#fToday","#fTomorrow","#fUpcoming","#fBypassed"].forEach(sel=>{
    el(sel)?.addEventListener("change", render);
  });
}

function wireAdminModal(){
  const modal = el("#adminModal");
  if(!modal) return;
  el("#adminBtn")?.addEventListener("click", ()=>modal.showModal());
  el("#adminClose")?.addEventListener("click", ()=>modal.close());
  el("#adminPwToggle")?.addEventListener("click", (ev)=>{
    const inp = el("#adminPassword"); if(!inp) return;
    const isPass = inp.type === "password"; inp.type = isPass ? "text":"password";
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

/* ---- Admin: Recipients ---- */
function buildRecipientsPanel(){
  const list = el("#recipientsList"); if(!list) return;
  const data = loadRecipients() || [];
  list.innerHTML = "";
  data.forEach(r=>{
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<div>${r.name||"—"}</div><div>${r.email||"—"}</div><div>${r.telegram_chat_id||r.chatId||"—"}</div><div><button class="btn rm">Remove</button></div>`;
    row.querySelector(".rm")?.addEventListener("click", ()=>{
      const next = (loadRecipients()||[]).filter(x => !(x.name===r.name && x.email===r.email && (x.telegram_chat_id||x.chatId)===(r.telegram_chat_id||r.chatId)));
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

/* ---- Admin: Templates ---- */
function buildTemplatesPanel(){
  const list = el("#templatesList"); if(!list) return;
  const name = el("#tmplName"), body = el("#tmplBody"), add = el("#addTemplate");
  const tpls = loadTemplates() || {};
  function refresh(){
    list.innerHTML = "";
    Object.entries(tpls).forEach(([k,v])=>{
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `<div><strong>${k}</strong></div><div class="small muted">${(v?.body||"").slice(0,120)}</div><div><button class="btn rm">Remove</button></div>`;
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

/* ---- Admin: Rules ---- */
function buildRulesPanel(){
  const s = loadNotifySettings();
  const qh = el("#quiet"), soon = el("#dueSoonHrs"), late = el("#onLate"), dsum = el("#summaryTime"), tmpl = el("#alertTemplate");
  if(qh)   qh.value   = s.quiet || "21:00-07:00";
  if(soon) soon.value = String(s.dueSoonHours ?? 24);
  if(late) late.checked = !!s.onLate;
  if(dsum) dsum.value = s.summaryTime || "19:30";
  if(tmpl) tmpl.value = s.alertTemplate || "due_soon";
  // Save button (if present)
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

/* ---- Admin: Bypass list ---- */
function buildBypassList(){
  const list = el("#bypassList"); if(!list) return;
  const map = loadBypass() || {};
  list.innerHTML = "";
  const ids = Object.keys(map);
  if(!ids.length){ const d = document.createElement("div"); d.className="muted small"; d.textContent="Nothing is bypassed."; list.appendChild(d); return; }
  ids.forEach(id=>{
    const row = document.createElement("div"); row.className="item";
    row.innerHTML = `<div>Assignment ${id}</div><div><button class="btn unb">Unbypass</button></div>`;
    row.querySelector(".unb")?.addEventListener("click", ()=>{ const m=loadBypass()||{}; delete m[id]; saveBypass(m); buildBypassList(); render(); });
    list.appendChild(row);
  });
}

/* ---- Admin: Test Email ---- */
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

/* ---------- boot ---------- */
function boot(){
  wireFilters();
  wireAdminModal();
  // sync button is already wired inside classroom.js; also auto-syncs on load there. 
}
document.addEventListener("DOMContentLoaded", boot);
