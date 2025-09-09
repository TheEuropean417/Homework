import { CONFIG } from "./config.js";

// Ensure the Sync button triggers the fetch (and forces a visible run)
import { syncFromClassroom } from "./classroom.js";

document.getElementById("syncBtn")?.addEventListener("click", () => {
  syncFromClassroom(true).catch(console.error);
});

import {
  loadBypass, saveBypass,
  loadRecipients, saveRecipients,
  loadTemplates, saveTemplates,
  loadNotifySettings, saveNotifySettings,
  loadLocalDone, saveLocalDone,
  loadTelegram, saveTelegram, loadEmail, saveEmail
} from "./state.js";

const el = sel => document.querySelector(sel);
const cards = el("#cards");
const empty = el("#empty");

let assignments = [];

// ---- categorization for strong visuals ----
function catOf(a){
  if(a.status === "BYPASSED") return "BYPASSED";
  if(a.status === "COMPLETED" || a.status === "DONE") return "DONE";
  if(!a.dueDateISO) return "UPCOMING";
  const now = new Date();
  const due = new Date(a.dueDateISO);
  if (due < now) return "LATE";
  const sameDay = (x,y)=>x.getFullYear()===y.getFullYear() && x.getMonth()===y.getMonth() && x.getDate()===y.getDate();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate()+1);
  if (sameDay(due, now)) return "TODAY";
  if (sameDay(due, tomorrow)) return "TOMORROW";
  return "UPCOMING";
}
function badgeClass(cat){
  return { LATE:"late", TODAY:"due", TOMORROW:"due", UPCOMING:"due", DONE:"done", BYPASSED:"byp" }[cat] || "due";
}
function fmtDate(iso){ return iso ? new Date(iso).toLocaleString() : "—"; }

function recomputeSummary(list){
  const c = {LATE:0,TODAY:0,TOMORROW:0,UPCOMING:0,DONE:0,BYPASSED:0};
  list.forEach(a => c[catOf(a)] = (c[catOf(a)]||0)+1);
  el("#sumLate").textContent = c.LATE||0;
  el("#sumToday").textContent = c.TODAY||0;
  el("#sumTomorrow").textContent = c.TOMORROW||0;
  el("#sumUpcoming").textContent = c.UPCOMING||0;
  el("#sumDone").textContent = c.DONE||0;
}

function passFilters(a){
  const cat = catOf(a);
  const on = {
    LATE: el("#fLate").checked,
    TODAY: el("#fToday").checked,
    TOMORROW: el("#fTomorrow").checked,
    UPCOMING: el("#fUpcoming").checked,
    DONE: el("#fDone").checked,
    BYPASSED: el("#fBypassed").checked
  }[cat];
  if (!on) return false;
  const q = el("#searchInput").value.trim().toLowerCase();
  if(!q) return true;
  return (a.title?.toLowerCase().includes(q) ||
          a.course?.toLowerCase().includes(q) ||
          a.notes?.toLowerCase().includes(q) ||
          (a.status||"").toLowerCase().includes(q));
}

function render(){
  cards.innerHTML = "";
  let shown = 0;

  const order = {LATE:0,TODAY:1,TOMORROW:2,UPCOMING:3,DONE:4,BYPASSED:5};
  const sorted = [...assignments].sort((a,b)=>{
    const ca = catOf(a), cb = catOf(b);
    if (order[ca] !== order[cb]) return order[ca]-order[cb];
    const da = a.dueDateISO ? new Date(a.dueDateISO).getTime() : Infinity;
    const db = b.dueDateISO ? new Date(b.dueDateISO).getTime() : Infinity;
    return da - db;
  });

  for(const a of sorted){
    if(!passFilters(a)) continue;
    shown++;

    const cat = catOf(a);

    const c = document.createElement("div");
    c.className = "card";

    const head = document.createElement("div");
    head.className = "card-head";
    head.innerHTML = `
      <div class="title">${a.title}</div>
      <div class="badges"><span class="badge ${badgeClass(cat)}">${cat.replace("_"," ")}</span></div>`;
    c.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerText = `${a.course || "—"} · Due: ${fmtDate(a.dueDateISO)}`;
    c.appendChild(meta);

    if(a.notes){
      const notes = document.createElement("div");
      notes.className = "small";
      notes.innerText = a.notes;
      c.appendChild(notes);
    }

    const foot = document.createElement("div");
    foot.className = "card-foot";

    const left = document.createElement("div");
    left.className = "small muted";
    left.innerText = a.dueDateISO ? "" : "No due date";
    foot.appendChild(left);

    const right = document.createElement("div");
    right.className = "card-actions";

    const doneBtn = document.createElement("button");
    doneBtn.className = "btn";
    doneBtn.textContent = (cat==="DONE") ? "Mark Not Done" : "Mark Done";
    doneBtn.addEventListener("click", ()=>onToggleDone(a));
    right.appendChild(doneBtn);

    const bypassBtn = document.createElement("button");
    bypassBtn.className = "btn";
    bypassBtn.textContent = a.status==="BYPASSED" ? "Un-bypass" : "Bypass";
    bypassBtn.addEventListener("click", ()=>onBypass(a));
    right.appendChild(bypassBtn);

    foot.appendChild(right);
    c.appendChild(foot);

    cards.appendChild(c);
  }

  empty.classList.toggle("hidden", shown>0);
  recomputeSummary(assignments);
}

async function onToggleDone(a){
  const map = loadLocalDone();
  if (map[a.id]) { delete map[a.id]; a.status = "UNKNOWN"; }
  else { map[a.id] = true; a.status = "COMPLETED"; }
  saveLocalDone(map); render();
}
async function onBypass(a){
  const pwd = prompt("Admin password to bypass:");
  if(pwd !== CONFIG.adminPassword){ alert("Incorrect password."); return; }
  const map = loadBypass();
  if(map[a.id]) delete map[a.id]; else map[a.id] = true;
  saveBypass(map);
  a.status = map[a.id] ? "BYPASSED" : "UNKNOWN";
  render();
}

// Filters
["#searchInput","#fLate","#fToday","#fTomorrow","#fUpcoming","#fDone","#fBypassed"].forEach(sel=>{
  el(sel)?.addEventListener(sel==="#searchInput"?"input":"change", render);
});

// Fresh data
document.addEventListener("assignments:loaded", e=>{
  const list = e.detail || [];
  const done = loadLocalDone();
  assignments = list.map(a => ({ ...a, status: done[a.id] ? "COMPLETED" : a.status }));
  render();
});

// -------- Admin: clean, professional center --------
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
});

function loadAdminUI(){
  // Recipients
  const recs = loadRecipients();
  const list = el("#recipientsList");
  list.innerHTML = "";
  for(const r of recs){
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<div>${r.name} <span class="muted small">${r.email||"—"} ${r.chatId?("· TG:"+r.chatId):""}</span></div>`;
    const del = document.createElement("button");
    del.className = "btn";
    del.textContent = "Remove";
    del.addEventListener("click", ()=>{
      const upd = loadRecipients().filter(x=>x.id!==r.id);
      saveRecipients(upd); loadAdminUI();
    });
    row.appendChild(del);
    list.appendChild(row);
  }

  // Templates
  const tmpls = loadTemplates();
  const tlist = el("#templatesList");
  tlist.innerHTML = "";
  Object.entries(tmpls).forEach(([name,body])=>{
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<div><b>${name}</b><div class="small muted">${body}</div></div>`;
    const del = document.createElement("button");
    del.className = "btn";
    del.textContent = "Remove";
    del.addEventListener("click", ()=>{
      const m = loadTemplates(); delete m[name]; saveTemplates(m); loadAdminUI();
    });
    row.appendChild(del);
    tlist.appendChild(row);
  });

  const ns = loadNotifySettings();
  el("#quiet").value = ns.quiet||"";
  el("#dueSoonHrs").value = ns.dueSoonHours??24;
  el("#onLate").checked = !!ns.onLate;
  el("#summaryTime").value = ns.summaryTime||"";
  el("#alertTemplate").value = ns.alertTemplate||"";

  const tg = loadTelegram();
  el("#tgEnable").checked = !!tg.enabled;
  el("#tgToken").value = tg.botToken || "";
  el("#tgChatIds").value = tg.chatIds || "";

  const em = loadEmail();
  el("#emailEnable").checked = !!em.enabled;
  el("#emailSubject").value = em.subject || "Homework Reminder";
}

el("#addRecipient").addEventListener("click", ()=>{
  const name = el("#recName").value.trim();
  const email = el("#recEmail").value.trim();
  const chatId = el("#recChatId").value.trim();
  if(!name || (!email && !chatId)) return;
  const recs = loadRecipients();
  recs.push({ id: `${Date.now()}-${Math.random()}`, name, email, chatId });
  saveRecipients(recs);
  el("#recName").value = ""; el("#recEmail").value = ""; el("#recChatId").value = "";
  loadAdminUI();
});

el("#addTemplate").addEventListener("click", ()=>{
  const name = el("#tmplName").value.trim();
  const body = el("#tmplBody").value.trim();
  if(!name || !body) return;
  const t = loadTemplates(); t[name] = body; saveTemplates(t);
  el("#tmplName").value=""; el("#tmplBody").value="";
  loadAdminUI();
});

el("#saveAdmin").addEventListener("click", ()=>{
  saveNotifySettings({
    quiet: el("#quiet").value.trim(),
    dueSoonHours: Number(el("#dueSoonHrs").value)||24,
    onLate: el("#onLate").checked,
    summaryTime: el("#summaryTime").value.trim(),
    alertTemplate: el("#alertTemplate").value.trim() || "due_soon"
  });
  saveTelegram({
    enabled: el("#tgEnable").checked,
    botToken: el("#tgToken").value.trim(),
    chatIds: el("#tgChatIds").value.trim()
  });
  saveEmail({
    enabled: el("#emailEnable").checked,
    subject: el("#emailSubject").value.trim() || "Homework Reminder"
  });
  alert("Saved.");
});

// Test Email
el("#testEmailBtn")?.addEventListener("click", async ()=>{
  const pwd = prompt("Admin password to send test email:");
  if (pwd !== CONFIG.adminPassword) { alert("Incorrect password."); return; }
  const em = loadEmail(); if (!em.enabled) { alert("Enable Email first."); return; }
  const recips = loadRecipients().map(r=>r.email).filter(Boolean);
  if (!recips.length) { alert("Add at least one recipient with an email."); return; }
  const text = (el("#testMsg")?.value || "Test: Homework alerts are working ✅").trim();
  const messages = recips.map(to => ({ to, subject: em.subject || "Homework Reminder", text }));
  const url = CONFIG.classroomEndpoints[0].replace("/api/classroom","/api/email");
  const rsp = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ password: CONFIG.adminPassword, messages }) }).then(r=>r.json());
  if (!rsp.ok) return alert(rsp.error || "Email send failed");
  alert(`Sent ${rsp.sent} emails`);
});

// Test Telegram
el("#testTelegramBtn")?.addEventListener("click", async ()=>{
  const pwd = prompt("Admin password to send test telegram:");
  if (pwd !== CONFIG.adminPassword) { alert("Incorrect password."); return; }
  const tg = loadTelegram(); if (!tg.enabled) { alert("Enable Telegram first."); return; }
  const ids = (tg.chatIds || "").split(",").map(s=>s.trim()).filter(Boolean);
  let finalIds = ids.length ? ids : loadRecipients().map(r=>r.chatId).filter(Boolean);
  if (!tg.botToken || !finalIds.length) { alert("Enter bot token and at least one chat id (global or per-recipient)."); return; }
  const text = (el("#testMsg")?.value || "Test: Homework alerts are working ✅").trim();
  const url = CONFIG.classroomEndpoints[0].replace("/api/classroom","/api/telegram");
  const rsp = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ password: CONFIG.adminPassword, token: tg.botToken, chatId: finalIds, messages:[text] }) }).then(r=>r.json());
  if (!rsp.ok) return alert(rsp.error || "Telegram send failed");
  alert(`Sent ${rsp.sent} telegram messages`);
});

// First paint
render();
