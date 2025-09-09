// assets/js/ui.js — complete replacement

// ------------------------ Imports ------------------------
import { CONFIG } from "./config.js";
import { syncFromClassroom } from "./classroom.js";
import {
  loadRecipients, saveRecipients,
  loadTemplates,  saveTemplates,
  loadSmsSettings, saveSmsSettings,
  loadBypass,     saveBypass
} from "./state.js";
import { sendEmailsToConfiguredRecipients } from "./email.js";

// ------------------------ DOM helpers ------------------------
const el  = (s, r=document) => r.querySelector(s);
const els = (s, r=document) => Array.from(r.querySelectorAll(s));

// ------------------------ Toast ------------------------
export function toast(msg) {
  const t = el("#toast");
  const m = el("#toastMsg");
  if (!t || !m) return;
  m.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

// ------------------------ Global-ish view state ------------------------
const cards   = el("#cards");
const loading = el("#loading");
const empty   = el("#empty");

let assignments = []; // normalized objects: {id,title,course,notes,status,dueDateISO}

// ------------------------ Utilities ------------------------
function fmtDate(iso){ try{ return iso ? new Date(iso).toLocaleString() : "—"; }catch{ return "—"; } }

function statusClass(s){
  if(s==="LATE") return "late";
  if(s==="DONE"||s==="COMPLETED") return "done";
  if(s==="BYPASSED") return "byp";
  if(s==="DUE_TODAY") return "today";
  if(s==="DUE_TOMORROW") return "tomorrow";
  return "up";
}

function matchesSearch(a, q){
  if(!q) return true;
  q = q.toLowerCase();
  return (a.title?.toLowerCase().includes(q) ||
          a.course?.toLowerCase().includes(q) ||
          a.notes?.toLowerCase().includes(q) ||
          a.status?.toLowerCase().includes(q));
}

function shouldShow(a){
  const q       = el("#searchInput")?.value.trim();
  const showLate= el("#toggleLate")?.checked ?? true;
  const showDue = el("#toggleDueSoon")?.checked ?? true;
  const showDone= el("#toggleCompleted")?.checked ?? false;
  const showByp = el("#toggleBypassed")?.checked ?? false;

  // quick search filter
  if(!matchesSearch(a,q)) return false;

  // BYPASSED visibility
  if(a.status==="BYPASSED" && !q && !showByp) return false;

  // group-based visibility
  if(a.status==="LATE")                       return showLate;
  if(a.status==="DONE" || a.status==="COMPLETED") return showDone;

  // treat everything else as active/due
  return showDue;
}

// ------------------------ Rendering ------------------------
function render() {
  if (!cards) return;
  cards.innerHTML = "";
  let shown = 0;

  const bypassMap = loadBypass() || {};

  for(const a of assignments){
    if(!shouldShow(a)) continue;
    shown++;

    const c = document.createElement("div");
    c.className = "card";

    // Head
    const head = document.createElement("div");
    head.className = "card-head";
    head.innerHTML = `
      <div class="title">
        <span class="dot ${statusClass(a.status)}"></span>
        ${a.title || "Untitled"}
      </div>
      <div class="badges">
        <span class="badge ${statusClass(a.status)}">${a.status?.replace("_"," ") || "UNKNOWN"}</span>
      </div>`;
    c.appendChild(head);

    // Meta
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerText = `${a.course || "—"} · Due: ${fmtDate(a.dueDateISO)}`;
    c.appendChild(meta);

    // Notes
    if(a.notes){
      const notes = document.createElement("div");
      notes.className = "small";
      notes.innerText = a.notes;
      c.appendChild(notes);
    }

    // Footer actions
    const foot = document.createElement("div");
    foot.className = "card-foot";

    const left = document.createElement("div");
    left.className = "muted small";
    left.textContent = bypassMap[a.id] ? "Bypassed" : "";
    foot.appendChild(left);

    const right = document.createElement("div");
    right.className = "card-actions";

    const btnByp = document.createElement("button");
    btnByp.className = "btn";
    btnByp.textContent = bypassMap[a.id] ? "Unbypass" : "Bypass";
    btnByp.addEventListener("click", () => {
      const map = loadBypass() || {};
      if (map[a.id]) delete map[a.id];
      else map[a.id] = true;
      saveBypass(map);
      render();
      toast(map[a.id] ? "Bypassed" : "Unbypassed");
    });
    right.appendChild(btnByp);

    foot.appendChild(right);
    c.appendChild(foot);

    cards.appendChild(c);
  }

  if (empty) empty.style.display = shown ? "none" : "block";
}

// ------------------------ Filters & controls ------------------------
function wireFilters(){
  el("#searchInput")?.addEventListener("input", () => render());
  ["#toggleLate","#toggleDueSoon","#toggleCompleted","#toggleBypassed"].forEach(s=>{
    el(s)?.addEventListener("change", () => render());
  });
}

// ------------------------ Sync button ------------------------
function wireSync(){
  const btn = el("#syncBtn");
  if(!btn) return;
  btn.addEventListener("click", async ()=>{
    try{
      loading && (loading.style.display = "block");
      btn.disabled = true;
      const res = await syncFromClassroom(); // your module populates data / local storage
      // Option A: If syncFromClassroom returns normalized items, use them
      if (Array.isArray(res?.assignments)) {
        assignments = res.assignments;
      } else {
        // Option B: fall back to what classroom.js places in state; caller can expose accessors if needed
        // For safety we just leave assignments as-is unless set elsewhere
      }
      render();
      toast("Classroom sync complete");
    }catch(e){
      console.error(e);
      toast("Sync failed");
      alert(String(e?.message||e));
    }finally{
      btn.disabled = false;
      loading && (loading.style.display = "none");
    }
  });
}

// ------------------------ Admin Modal (gate + UI) ------------------------
function wireAdminModal(){
  const modal = el("#adminModal");
  if(!modal) return;

  const openBtn   = el("#adminBtn");
  const closeBtn  = el("#adminClose");
  const unlockBtn = el("#adminUnlock");

  openBtn?.addEventListener("click", ()=> modal.showModal());
  closeBtn?.addEventListener("click", ()=> modal.close());

  // Eye toggle on password
  el("#adminPwToggle")?.addEventListener("click", (e) => {
    const inp = el("#adminPassword");
    if(!inp) return;
    const isPass = inp.type === "password";
    inp.type = isPass ? "text" : "password";
    e.currentTarget.setAttribute("aria-label", isPass ? "Hide password" : "Show password");
  });

  unlockBtn?.addEventListener("click", () => {
    const pwd = el("#adminPassword")?.value?.trim();
    if(pwd !== CONFIG.adminPassword){
      const err = el("#adminErr");
      if (err){ err.textContent = "Wrong password"; err.classList.remove("hidden"); }
      return;
    }
    el("#adminErr")?.classList.add("hidden");
    el("#adminGate")?.classList.add("hidden");
    el("#adminBody")?.classList.remove("hidden");
    loadAdminUI(); // populate panels once unlocked
    buildBypassList();
  });
}

// ------------------------ Admin: Recipients panel ------------------------
function buildRecipientsPanel(){
  const tbody = el("#recipientsBody");
  if(!tbody) return;

  const data = loadRecipients() || [];
  tbody.innerHTML = "";

  for(const r of data){
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <div>${r.name || "—"}</div>
      <div>${r.email || "—"}</div>
      <div>${r.telegram_chat_id || "—"}</div>
      <div class="right">
        <button class="acc-chip acc-danger btn remove">Remove</button>
      </div>
    `;
    row.querySelector(".remove")?.addEventListener("click", ()=>{
      const next = (loadRecipients() || []).filter(x => !(x.name===r.name && x.email===r.email && x.telegram_chat_id===r.telegram_chat_id));
      saveRecipients(next);
      buildRecipientsPanel();
      toast("Recipient removed");
    });
    tbody.appendChild(row);
  }

  // Add form
  el("#recipientAddBtn")?.addEventListener("click", ()=>{
    const name  = el("#recName")?.value?.trim();
    const email = el("#recEmail")?.value?.trim();
    const tg    = el("#recTg")?.value?.trim();
    if(!name && !email && !tg) { alert("Enter at least a name and an email or telegram chat_id."); return; }
    const items = loadRecipients() || [];
    items.push({ name, email, telegram_chat_id: tg });
    saveRecipients(items);
    el("#recName").value = ""; el("#recEmail").value = ""; el("#recTg").value = "";
    buildRecipientsPanel();
    toast("Recipient added");
  });
}

// ------------------------ Admin: Templates panel ------------------------
function buildTemplatesPanel(){
  const keyInput   = el("#tplKey");
  const subjInput  = el("#tplSubj");
  const bodyInput  = el("#tplBody");
  const saveBtn    = el("#tplSave");
  const removeBtn  = el("#tplRemove");

  if(!keyInput || !bodyInput || !saveBtn) return;

  const templates = loadTemplates() || {};

  function loadCurrent(){
    const k = keyInput.value.trim();
    const t = templates[k] || {};
    subjInput.value = t.subject || "";
    bodyInput.value = t.body || "";
  }

  keyInput.addEventListener("input", loadCurrent);

  saveBtn.addEventListener("click", ()=>{
    const k = keyInput.value.trim();
    if(!k) { alert("Template key is required"); return; }
    templates[k] = { subject: subjInput.value, body: bodyInput.value };
    saveTemplates(templates);
    toast("Template saved");
  });

  removeBtn?.addEventListener("click", ()=>{
    const k = keyInput.value.trim();
    if(!k) return;
    delete templates[k];
    saveTemplates(templates);
    subjInput.value = ""; bodyInput.value = "";
    toast("Template removed");
  });

  // initialize
  loadCurrent();
}

// ------------------------ Admin: Notification rules panel (SMS) ------------------------
function buildRulesPanel(){
  const s = loadSmsSettings();
  const qh   = el("#ruleQuietHours");
  const soon = el("#ruleDueSoonHours");
  const late = el("#ruleNotifyLate");
  const dsum = el("#ruleDailyTime");
  const save = el("#rulesSave");
  const reset= el("#rulesReset");

  if(qh)   qh.value   = s.quiet || "21:00-07:00";
  if(soon) soon.value = String(s.dueSoonHours ?? 24);
  if(late) late.checked = !!s.onLate;
  if(dsum) dsum.value = s.summaryTime || "19:30";

  save?.addEventListener("click", ()=>{
    const next = {
      enabled: true,
      quiet: (qh?.value || "21:00-07:00").trim(),
      dueSoonHours: Number(soon?.value || 24),
      onLate: !!(late?.checked),
      summaryTime: (dsum?.value || "19:30").trim(),
      alertTemplate: s.alertTemplate || "due_soon"
    };
    saveSmsSettings(next);
    toast("Rules saved");
  });

  reset?.addEventListener("click", ()=>{
    saveSmsSettings({
      enabled:false, quiet:"21:00-07:00", dueSoonHours:24, onLate:true, summaryTime:"19:30", alertTemplate:"due_soon"
    });
    buildRulesPanel();
    toast("Rules reset");
  });
}

// ------------------------ Admin: Bypass viewer ------------------------
function buildBypassList(){
  const list = el("#bypassList");
  if(!list) return;
  const map = loadBypass() || {};
  list.innerHTML = "";

  const ids = Object.keys(map);
  if(!ids.length){
    const d = document.createElement("div");
    d.className = "muted small";
    d.textContent = "Nothing is bypassed.";
    list.appendChild(d);
    return;
  }

  for(const id of ids){
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<div>Assignment ${id}</div><div><button class="btn">Unbypass</button></div>`;
    row.querySelector("button")?.addEventListener("click", ()=>{
      const m = loadBypass() || {};
      delete m[id]; saveBypass(m);
      buildBypassList(); render();
    });
    list.appendChild(row);
  }
}

// ------------------------ Admin: Email test wiring ------------------------
function wireEmailTest(){
  const emailBtn    = el("#sendTestEmail");
  const emailBody   = el("#emailTestBody");
  const emailSubject= el("#emailTestSubject");
  const emailStatus = el("#sendTestEmailStatus");

  if(!emailBtn) return;

  emailBtn.addEventListener("click", async ()=>{
    if(!CONFIG.emailEndpoint && !CONFIG.classroomEndpoints?.length){
      alert("Email endpoint is not configured."); return;
    }
    const pwd = prompt("Admin password to send test email:");
    if(pwd !== CONFIG.adminPassword) { alert("Incorrect password."); return; }

    emailBtn.disabled = true; if(emailStatus) emailStatus.textContent = "Sending…";
    try{
      const subject = (emailSubject?.value || "Homework — Test").trim();
      const text    = (emailBody?.value || "Test email from Homework").trim();
      const rsp     = await sendEmailsToConfiguredRecipients({ subject, text });
      if(emailStatus) emailStatus.textContent = `Sent ${rsp?.sent ?? 0} email(s)`;
      toast("Email sent");
    }catch(e){
      console.error(e);
      if(emailStatus) emailStatus.textContent = "Failed to send test";
      alert(String(e?.message||e));
    }finally{
      emailBtn.disabled = false;
      setTimeout(()=>{ if(emailStatus) emailStatus.textContent = ""; }, 4000);
    }
  });
}

// ------------------------ Admin UI boot ------------------------
function loadAdminUI(){
  buildRecipientsPanel();
  buildTemplatesPanel();
  buildRulesPanel();
  wireEmailTest();
}

// ------------------------ Boot ------------------------
function boot(){
  wireFilters();
  wireSync();
  wireAdminModal();

  // Auto-sync if configured
  if (CONFIG.autoSyncOnLoad) {
    el("#syncBtn")?.click();
  }
}

document.addEventListener("DOMContentLoaded", boot);
