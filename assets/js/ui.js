import { CONFIG } from "./config.js";
import { syncFromClassroom } from "./classroom.js";
import {
  loadBypass, saveBypass,
  loadRecipients, saveRecipients,
  loadTemplates, saveTemplates,
  loadNotifySettings, saveNotifySettings,
  loadLocalDone, saveLocalDone,  // kept for future; not used as UI state
  loadTelegram, saveTelegram, loadEmail, saveEmail
} from "./state.js";

/* ---------- tiny toast for messages ---------- */
function showToast(msg){
  let t = document.querySelector(".toast");
  if(!t){
    t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<span class="tmsg"></span>`;
    document.body.appendChild(t);
  }
  t.querySelector(".tmsg").textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2600);
}

/* ---------- DOM ---------- */
const el = s => document.querySelector(s);
const cards = el("#cards");
const empty = el("#empty");
let assignments = [];

/* ---------- mapping ---------- */
function submissionLabel(a){
  switch (a.submissionState) {
    case "TURNED_IN": return "SUBMITTED";
    case "RETURNED": return "RETURNED";
    case "RECLAIMED_BY_STUDENT": return "UNSUBMITTED";
    default: return null;
  }
}
function urgencyCat(a){
  if(a.status === "BYPASSED") return "BYPASSED";
  const now = new Date();
  const due = a.dueDateISO ? new Date(a.dueDateISO) : null;
  const isLate = a.late === true || (!!due && due < now && a.submissionState !== "TURNED_IN");
  if(isLate) return "LATE";
  if(!due) return "UPCOMING";
  const sameDay = (x,y)=>x.getFullYear()===y.getFullYear() && x.getMonth()===y.getMonth() && x.getDate()===y.getDate();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate()+1);
  if (sameDay(due, now)) return "TODAY";
  if (sameDay(due, tomorrow)) return "TOMORROW";
  return "UPCOMING";
}
const badgeClass = (cat, sub) => {
  if (sub === "SUBMITTED") return "sub";
  if (sub === "RETURNED") return "ret";
  return ({LATE:"late",TODAY:"today",TOMORROW:"tomorrow",UPCOMING:"up",BYPASSED:"byp"}[cat] || "up");
};
const dotClass = (cat, sub) => {
  if (sub === "SUBMITTED") return "sub";
  if (sub === "RETURNED") return "ret";
  return ({LATE:"late",TODAY:"today",TOMORROW:"tomorrow",UPCOMING:"up",BYPASSED:"byp"}[cat] || "up");
};
const labelText  = (cat, sub) => sub || ({LATE:"LATE",TODAY:"TODAY",TOMORROW:"TOMORROW",UPCOMING:"UPCOMING",BYPASSED:"BYPASSED"}[cat]||cat);
function fmtDate(iso){ return iso ? new Date(iso).toLocaleString() : "—"; }

/* ---------- counters ---------- */
function recomputeSummary(list){
  let kLate=0,kToday=0,kTom=0,kUp=0,kSub=0,kRet=0;
  for (const a of list) {
    const sub = submissionLabel(a);
    if (sub === "SUBMITTED") kSub++;
    if (sub === "RETURNED")  kRet++;
    switch (urgencyCat(a)){
      case "LATE": kLate++; break;
      case "TODAY": kToday++; break;
      case "TOMORROW": kTom++; break;
      case "UPCOMING": kUp++; break;
    }
  }
  const set = (id, v) => { const n = el(id); if (n) n.textContent = String(v); };
  set("#kLate", kLate); set("#kToday", kToday); set("#kTom", kTom); set("#kUp", kUp); set("#kSub", kSub); set("#kRet", kRet);
}

/* ---------- filters ---------- */
const keyToCheckbox = {
  Late: "#fLate", Today:"#fToday", Tomorrow:"#fTomorrow", Upcoming:"#fUpcoming",
  Submitted:"#fSubmitted", Returned:"#fReturned"
};
function passFilters(a){
  const map = {
    LATE: el("#fLate")?.checked,
    TODAY: el("#fToday")?.checked,
    TOMORROW: el("#fTomorrow")?.checked,
    UPCOMING: el("#fUpcoming")?.checked,
    BYPASSED: el("#fBypassed")?.checked,
    SUBMITTED: el("#fSubmitted")?.checked,
    RETURNED: el("#fReturned")?.checked
  };
  const sub = submissionLabel(a);
  if (sub === "SUBMITTED" && !map.SUBMITTED) return false;
  if (sub === "RETURNED"  && !map.RETURNED)  return false;
  if (!map[urgencyCat(a)]) return false;

  const q = (el("#searchInput")?.value || "").trim().toLowerCase();
  if(!q) return true;
  return (a.title?.toLowerCase().includes(q) ||
          a.course?.toLowerCase().includes(q) ||
          a.notes?.toLowerCase().includes(q) ||
          (a.submissionState||"").toLowerCase().includes(q));
}
function syncCountersFromFilters(){
  for (const [k,sel] of Object.entries(keyToCheckbox)){
    const cb = el(sel); const tile = document.querySelector(`.stat.toggle[data-key="${k}"]`);
    if (cb && tile) tile.classList.toggle("off", !cb.checked);
  }
}

/* ---------- render ---------- */
function render(){
  cards.innerHTML = "";
  let shown = 0;

  // strict by due date
  const t = a => a?.dueDateISO ? new Date(a.dueDateISO).getTime() : Number.POSITIVE_INFINITY;
  const sorted = [...assignments].sort((a,b)=> t(a)-t(b));

  for (const a of sorted) {
    if (!passFilters(a)) continue;
    shown++;

    const cat = urgencyCat(a);
    const sub = submissionLabel(a);

    const card = document.createElement("div");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "card-head";
    head.innerHTML = `
      <div class="title"><span class="dot ${dotClass(cat, sub)}"></span>${a.title}</div>
      <div class="badges"><span class="badge ${badgeClass(cat, sub)}">${labelText(cat, sub)}</span></div>`;
    card.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerText = `${a.course || "—"} · Due: ${fmtDate(a.dueDateISO)}`;
    card.appendChild(meta);

    if(a.notes){
      const notes = document.createElement("div");
      notes.className = "small";
      notes.innerText = a.notes;
      card.appendChild(notes);
    }

    const foot = document.createElement("div");
    foot.className = "card-foot";

    const left = document.createElement("div");
    left.className = "small muted";
    left.innerText = a.dueDateISO ? "" : "No due date";
    foot.appendChild(left);

    const right = document.createElement("div");
    right.className = "card-actions";

    // READ-ONLY: Only Bypass
    const bypBtn = document.createElement("button");
    bypBtn.className = "btn";
    bypBtn.textContent = a.status === "BYPASSED" ? "Un-bypass" : "Bypass";
    bypBtn.addEventListener("click", ()=>onBypass(a));
    right.appendChild(bypBtn);

    foot.appendChild(right);
    card.appendChild(foot);

    cards.appendChild(card);
  }

  empty?.classList.toggle("hidden", shown>0);
  recomputeSummary(assignments);
  syncCountersFromFilters();
}

/* ---------- actions ---------- */
function onBypass(a){
  const pwd = prompt("Admin password to toggle bypass:");
  if(pwd !== CONFIG.adminPassword){ alert("Incorrect password."); return; }
  const map = loadBypass();
  if (map[a.id]) { delete map[a.id]; a.status="UNKNOWN"; showToast("Un-bypassed."); }
  else { map[a.id]=true; a.status="BYPASSED"; showToast("Bypassed."); }
  saveBypass(map);
  render();
}

/* ---------- listeners ---------- */
["#searchInput","#fLate","#fToday","#fTomorrow","#fUpcoming","#fBypassed","#fSubmitted","#fReturned"].forEach(sel=>{
  el(sel)?.addEventListener(sel==="#searchInput"?"input":"change", ()=>{ syncCountersFromFilters(); render(); });
});

// Clickable counters toggle their matching filters
document.querySelectorAll(".stat.toggle").forEach(tile=>{
  tile.addEventListener("click", ()=>{
    const key = tile.getAttribute("data-key"); const cbSel = keyToCheckbox[key];
    const cb = cbSel ? el(cbSel) : null;
    if (cb){ cb.checked = !cb.checked; }
    syncCountersFromFilters(); render();
  });
});

document.addEventListener("assignments:loaded", e=>{
  const list = e.detail || [];
  const bypass = loadBypass();
  assignments = list.map(a => ({ ...a, status: bypass[a.id] ? "BYPASSED" : a.status, late: !!a.late }));
  render();
});

/* ---------- Admin (unchanged core + Bypass Manager additions) ---------- */
const adminModal = el("#adminModal");
el("#adminBtn").addEventListener("click", ()=>adminModal.showModal());
el("#adminClose").addEventListener("click", ()=>adminModal.close());
el("#adminUnlock").addEventListener("click", ()=>{
  const pwd = el("#adminPassword").value.trim();
  if(pwd !== CONFIG.adminPassword){
    const err = el("#adminErr"); err.textContent = "Wrong password"; err.classList.remove("hidden");
    return;
  }
  el("#adminErr").classList.add("hidden");
  el("#adminGate").classList.add("hidden");
  el("#adminBody").classList.remove("hidden");
  loadAdminUI();
  buildBypassList(); // populate Bypass Manager
});

function loadAdminUI(){
  // Recipients
  const recs = loadRecipients();
  const list = el("#recipientsList");
  if (list){
    list.innerHTML = "";
    for(const r of recs){
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `<div>${r.name} <span class="muted small">${r.email||"—"} ${r.chatId?("· TG:"+r.chatId):""}</span></div>`;
      const del = document.createElement("button"); del.className="btn"; del.textContent="Remove";
      del.addEventListener("click", ()=>{ const upd = loadRecipients().filter(x=>x.id!==r.id); saveRecipients(upd); loadAdminUI(); });
      row.appendChild(del);
      list.appendChild(row);
    }
  }

  // Templates
  const tmpls = loadTemplates(); const tlist = el("#templatesList");
  if (tlist){
    tlist.innerHTML = "";
    Object.entries(tmpls).forEach(([name,body])=>{
      const row = document.createElement("div"); row.className="item";
      row.innerHTML = `<div><b>${name}</b><div class="small muted">${body}</div></div>`;
      const del=document.createElement("button"); del.className="btn"; del.textContent="Remove";
      del.addEventListener("click", ()=>{ const m=loadTemplates(); delete m[name]; saveTemplates(m); loadAdminUI(); });
      row.appendChild(del); tlist.appendChild(row);
    });
  }

  // Rules
  const ns = loadNotifySettings();
  if (el("#quiet")) el("#quiet").value = ns.quiet||"";
  if (el("#dueSoonHrs")) el("#dueSoonHrs").value = ns.dueSoonHours??24;
  if (el("#onLate")) el("#onLate").checked = !!ns.onLate;
  if (el("#summaryTime")) el("#summaryTime").value = ns.summaryTime||"";
  if (el("#alertTemplate")) el("#alertTemplate").value = ns.alertTemplate||"";

  // Channels
  const tg = loadTelegram();
  if (el("#tgEnable")) el("#tgEnable").checked = !!tg.enabled;
  if (el("#tgToken")) el("#tgToken").value = tg.botToken || "";
  if (el("#tgChatIds")) el("#tgChatIds").value = tg.chatIds || "";

  const em = loadEmail();
  if (el("#emailEnable")) el("#emailEnable").checked = !!em.enabled;
  if (el("#emailSubject")) el("#emailSubject").value = em.subject || "Homework Reminder";
}

el("#addRecipient")?.addEventListener("click", ()=>{
  const name = el("#recName")?.value.trim();
  const email = el("#recEmail")?.value.trim();
  const chatId = el("#recChatId")?.value.trim();
  if(!name || (!email && !chatId)) return;
  const recs = loadRecipients(); recs.push({ id: `${Date.now()}-${Math.random()}`, name, email, chatId });
  saveRecipients(recs);
  el("#recName").value=""; el("#recEmail").value=""; el("#recChatId").value="";
  loadAdminUI();
});
el("#addTemplate")?.addEventListener("click", ()=>{
  const name = el("#tmplName")?.value.trim();
  const body = el("#tmplBody")?.value.trim();
  if(!name || !body) return;
  const t = loadTemplates(); t[name] = body; saveTemplates(t);
  el("#tmplName").value=""; el("#tmplBody").value="";
  loadAdminUI();
});
el("#saveAdmin")?.addEventListener("click", ()=>{
  const ns = {
    quiet: (el("#quiet")?.value||"").trim(),
    dueSoonHours: Number(el("#dueSoonHrs")?.value)||24,
    onLate: !!el("#onLate")?.checked,
    summaryTime: (el("#summaryTime")?.value||"").trim(),
    alertTemplate: (el("#alertTemplate")?.value||"due_soon").trim()
  };
  saveNotifySettings(ns);
  const tg = {
    enabled: !!el("#tgEnable")?.checked,
    botToken: (el("#tgToken")?.value||"").trim(),
    chatIds: (el("#tgChatIds")?.value||"").trim()
  };
  saveTelegram(tg);
  const em = {
    enabled: !!el("#emailEnable")?.checked,
    subject: (el("#emailSubject")?.value||"Homework Reminder").trim()
  };
  saveEmail(em);
  alert("Saved.");
});

/* ---- Bypass Manager ---- */
function buildBypassList(){
  const listEl = el("#bypassList"); if(!listEl) return;
  const map = loadBypass();
  const ids = Object.keys(map);
  listEl.innerHTML = "";
  if (!ids.length){ listEl.innerHTML = `<div class="small muted">No bypassed items.</div>`; return; }

  const lookup = new Map(assignments.map(a=>[a.id,a]));
  ids.forEach(id=>{
    const a = lookup.get(id);
    const row = document.createElement("div"); row.className="item";
    const label = a ? `${a.title} — ${a.course||"—"} · Due: ${fmtDate(a.dueDateISO)}` : `Assignment ${id}`;
    row.innerHTML = `<div>${label}</div>`;
    const btn = document.createElement("button"); btn.className="btn"; btn.textContent="Un-bypass";
    btn.addEventListener("click", ()=>{
      const m = loadBypass(); delete m[id]; saveBypass(m); buildBypassList(); // update list
      // also update current UI if that assignment is present
      const found = assignments.find(x=>x.id===id); if(found){ found.status="UNKNOWN"; render(); }
      showToast("Un-bypassed.");
    });
    row.appendChild(btn); listEl.appendChild(row);
  });
}
el("#refreshBypass")?.addEventListener("click", buildBypassList);
el("#unbypassAll")?.addEventListener("click", ()=>{
  const m = loadBypass(); if(!Object.keys(m).length) return;
  if (!confirm("Remove bypass from all items?")) return;
  saveBypass({}); buildBypassList();
  // update any visible assignment state
  assignments = assignments.map(a => ({...a, status:"UNKNOWN"})); render();
  showToast("All un-bypassed.");
});

/* search */
el("#searchInput")?.addEventListener("input", ()=>{ render(); });

/* sync button */
document.getElementById("syncBtn")?.addEventListener("click", () => {
  syncFromClassroom(true).catch(console.error);
});

/* initial paint */
render();
