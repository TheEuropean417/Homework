import { CONFIG } from "./config.js";
import { syncFromClassroom } from "./classroom.js";
import {
  loadBypass, saveBypass,
  loadRecipients, saveRecipients,
  loadTemplates, saveTemplates,
  loadNotifySettings, saveNotifySettings,
  loadLocalDone, saveLocalDone,
  loadTelegram, saveTelegram, loadEmail, saveEmail
} from "./state.js";

/* ---------- small toast for Undo etc. ---------- */
function showToast(msg, undoCb){
  let t = document.querySelector(".toast");
  if(!t){
    t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<span class="tmsg"></span><span class="undo"></span>`;
    document.body.appendChild(t);
  }
  t.querySelector(".tmsg").textContent = msg;
  const u = t.querySelector(".undo");
  if (undoCb){
    u.textContent = "Undo";
    u.onclick = ()=>{ t.classList.remove("show"); undoCb(); };
    u.style.display = "inline";
  } else {
    u.style.display = "none";
  }
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 4500);
}

/* ---------- DOM refs ---------- */
const el = sel => document.querySelector(sel);
const cards = el("#cards");
const empty = el("#empty");
let assignments = [];

/* ---------- status logic ---------- */
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
const badgeClass = cat => ({LATE:"late",TODAY:"today",TOMORROW:"tomorrow",UPCOMING:"up",DONE:"done",BYPASSED:"byp"}[cat] || "up");
const dotClass   = cat => ({LATE:"late",TODAY:"today",TOMORROW:"tomorrow",UPCOMING:"up",DONE:"done",BYPASSED:"byp"}[cat] || "up");
const labelText  = cat => ({LATE:"LATE",TODAY:"TODAY",TOMORROW:"TOMORROW",UPCOMING:"UPCOMING",DONE:"DONE",BYPASSED:"BYPASSED"}[cat]||cat);

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
  const map = {
    LATE: el("#fLate")?.checked,
    TODAY: el("#fToday")?.checked,
    TOMORROW: el("#fTomorrow")?.checked,
    UPCOMING: el("#fUpcoming")?.checked,
    DONE: el("#fDone")?.checked,
    BYPASSED: el("#fBypassed")?.checked
  };
  if(!map[catOf(a)]) return false;
  const q = (el("#searchInput")?.value || "").trim().toLowerCase();
  if(!q) return true;
  return (a.title?.toLowerCase().includes(q) ||
          a.course?.toLowerCase().includes(q) ||
          a.notes?.toLowerCase().includes(q) ||
          (a.status||"").toLowerCase().includes(q));
}

/* ---------- render ---------- */
function render(){
  cards.innerHTML = "";
  let shown = 0;

  // ORDER: by due date ascending (no-date = bottom)
  const t = (x)=> x?.dueDateISO ? new Date(x.dueDateISO).getTime() : Number.POSITIVE_INFINITY;
  const sorted = [...assignments].sort((a,b)=> t(a)-t(b));

  for(const a of sorted){
    if(!passFilters(a)) continue;
    shown++;

    const cat = catOf(a);

    const c = document.createElement("div");
    c.className = "card";

    const head = document.createElement("div");
    head.className = "card-head";
    head.innerHTML = `
      <div class="title"><span class="dot ${dotClass(cat)}"></span>${a.title}</div>
      <div class="badges"><span class="badge ${badgeClass(cat)}">${labelText(cat)}</span></div>`;
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
    const wasDone = (cat==="DONE");
    doneBtn.textContent = wasDone ? "Reopen" : "Mark Done";
    doneBtn.addEventListener("click", ()=>onToggleDone(a, wasDone));
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

  empty?.classList.toggle("hidden", shown>0);
  recomputeSummary(assignments);
}

/* ---------- actions ---------- */
function onToggleDone(a, wasDone){
  const map = loadLocalDone();
  const prev = !!map[a.id];

  if (prev || wasDone){ // reopen
    delete map[a.id];
    a.status = "UNKNOWN";
    saveLocalDone(map);
    showToast("Reopened assignment.", ()=>{ map[a.id]=true; a.status="COMPLETED"; saveLocalDone(map); render(); });
  } else {               // mark done
    map[a.id] = true;
    a.status = "COMPLETED";
    saveLocalDone(map);
    showToast("Marked as done.", ()=>{ delete map[a.id]; a.status="UNKNOWN"; saveLocalDone(map); render(); });
  }
  render();
}

function onBypass(a){
  const pwd = prompt("Admin password to bypass:");
  if(pwd !== CONFIG.adminPassword){ alert("Incorrect password."); return; }
  const map = loadBypass();
  const was = !!map[a.id];
  if (was){ delete map[a.id]; a.status="UNKNOWN"; saveBypass(map); showToast("Bypass removed."); }
  else    { map[a.id]=true; a.status="BYPASSED"; saveBypass(map); showToast("Bypassed (hidden in filters)."); }
  render();
}

/* ---------- filters and listeners ---------- */
["#searchInput","#fLate","#fToday","#fTomorrow","#fUpcoming","#fDone","#fBypassed"].forEach(sel=>{
  el(sel)?.addEventListener(sel==="#searchInput"?"input":"change", render);
});

document.addEventListener("assignments:loaded", e=>{
  const list = e.detail || [];
  const done = loadLocalDone();
  assignments = list.map(a => ({ ...a, status: done[a.id] ? "COMPLETED" : a.status }));
  render();
});

/* ---------- Admin center (unchanged logic, cleaner fields) ---------- */
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
  // recipients
  const recs = loadRecipients();
  const list = el("#recipientsList");
  if (list){
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
  }

  // templates
  const tmpls = loadTemplates();
  const tlist = el("#templatesList");
  if (tlist){
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
  }

  // rules
  const ns = loadNotifySettings();
  el("#quiet")?.setAttribute("value", ns.quiet||"");
  if (el("#dueSoonHrs")) el("#dueSoonHrs").value = ns.dueSoonHours??24;
  if (el("#onLate")) el("#onLate").checked = !!ns.onLate;
  el("#summaryTime")?.setAttribute("value", ns.summaryTime||"");
  el("#alertTemplate")?.setAttribute("value", ns.alertTemplate||"");

  // channels
  const tg = loadTelegram();
  if (el("#tgEnable")) el("#tgEnable").checked = !!tg.enabled;
  if (el("#tgToken"))  el("#tgToken").value  = tg.botToken || "";
  if (el("#tgChatIds"))el("#tgChatIds").value= tg.chatIds || "";

  const em = loadEmail();
  if (el("#emailEnable")) el("#emailEnable").checked = !!em.enabled;
  if (el("#emailSubject")) el("#emailSubject").value = em.subject || "Homework Reminder";
}

el("#addRecipient")?.addEventListener("click", ()=>{
  const name = el("#recName")?.value.trim();
  const email = el("#recEmail")?.value.trim();
  const chatId = el("#recChatId")?.value.trim();
  if(!name || (!email && !chatId)) return;
  const recs = loadRecipients();
  recs.push({ id: `${Date.now()}-${Math.random()}`, name, email, chatId });
  saveRecipients(recs);
  if (el("#recName")) el("#recName").value = "";
  if (el("#recEmail")) el("#recEmail").value = "";
  if (el("#recChatId")) el("#recChatId").value = "";
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

/* hook search text */
el("#searchInput")?.addEventListener("input", render);

/* ensure Sync button forces a run */
document.getElementById("syncBtn")?.addEventListener("click", () => {
  syncFromClassroom(true).catch(console.error);
});

/* initial paint */
render();
