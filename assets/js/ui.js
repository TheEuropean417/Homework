import { CONFIG } from "./config.js";
import { syncFromClassroom } from "./classroom.js";
import {
  loadBypass, saveBypass,
  loadRecipients, saveRecipients,
  loadTemplates, saveTemplates,
  loadSmsSettings, saveSmsSettings,
  loadTelegram, saveTelegram
} from "./state.js";

const el = sel => document.querySelector(sel);
const cards = el("#cards");
const empty = el("#empty");

let assignments = [];

function statusClass(s){
  if(s==="LATE") return "late";
  if(s==="DONE"||s==="COMPLETED") return "done";
  if(s==="BYPASSED") return "byp";
  return "due";
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
  const q = el("#searchInput").value.trim();
  const showLate = el("#toggleLate").checked;
  const showDue = el("#toggleDueSoon").checked;
  const showDone = el("#toggleCompleted").checked;
  const showByp = el("#toggleBypassed").checked;

  if(!matchesSearch(a,q)) return false;
  if(a.status==="BYPASSED" && !q && !showByp) return false;

  if(a.status==="LATE") return showLate;
  if(a.status==="DONE"||a.status==="COMPLETED") return showDone;
  return showDue;
}
function fmtDate(iso){ return iso ? new Date(iso).toLocaleString() : "—"; }

function render(){
  cards.innerHTML = "";
  let shown = 0;
  for(const a of assignments){
    if(!shouldShow(a)) continue;
    shown++;

    const c = document.createElement("div");
    c.className = "card";

    const head = document.createElement("div");
    head.className = "card-head";
    head.innerHTML = `
      <div class="title">${a.title}</div>
      <div class="badges">
        <span class="badge ${statusClass(a.status)}">${a.status || "UNKNOWN"}</span>
      </div>`;
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
}

async function onBypass(a){
  const pwd = prompt("Admin password to bypass:");
  if(pwd !== CONFIG.adminPassword){ alert("Incorrect password."); return; }
  const map = loadBypass();
  if(map[a.id]) delete map[a.id]; else map[a.id] = true;
  saveBypass(map);
  a.status = map[a.id] ? "BYPASSED" : (a.status==="BYPASSED"?"UNKNOWN":a.status);
  render();
}

// Filters & search
["#searchInput","#toggleLate","#toggleDueSoon","#toggleCompleted","#toggleBypassed"].forEach(sel=>{
  el(sel).addEventListener(sel==="#searchInput"?"input":"change", render);
});

// Listen for fresh data
document.addEventListener("assignments:loaded", e=>{
  assignments = e.detail || [];
  render();
});

// Admin modal
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
  list.innerHTML = "";
  for(const r of recs){
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<div>${r.name} <span class="muted small">${r.phone}</span></div>`;
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

  // templates
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

  // SMS settings
  const s = loadSmsSettings();
  el("#smsEnable").checked = !!s.enabled;
  el("#smsQuiet").value = s.quiet||"";
  el("#smsDueSoonHrs").value = s.dueSoonHours??24;
  el("#smsOnLate").checked = !!s.onLate;
  el("#smsSummaryTime").value = s.summaryTime||"";
  el("#smsAlertTemplate").value = s.alertTemplate||"";

  // Telegram settings
  const tg = loadTelegram();
  el("#tgEnable").checked = !!tg.enabled;
  el("#tgToken").value = tg.botToken || "";
  el("#tgChat").value = tg.chatId || "";
}

el("#addRecipient").addEventListener("click", ()=>{
  const name = el("#recName").value.trim();
  const phone = el("#recPhone").value.trim();
  if(!name || !phone) return;
  const recs = loadRecipients();
  recs.push({ id: `${Date.now()}-${Math.random()}`, name, phone });
  saveRecipients(recs);
  el("#recName").value = ""; el("#recPhone").value = "";
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
  const s = {
    enabled: el("#smsEnable").checked,
    quiet: el("#smsQuiet").value.trim(),
    dueSoonHours: Number(el("#smsDueSoonHrs").value)||24,
    onLate: el("#smsOnLate").checked,
    summaryTime: el("#smsSummaryTime").value.trim(),
    alertTemplate: el("#smsAlertTemplate").value.trim() || "due_soon"
  };
  saveSmsSettings(s);

  const tgNew = {
    enabled: el("#tgEnable").checked,
    botToken: el("#tgToken").value.trim(),
    chatId: el("#tgChat").value.trim()
  };
  saveTelegram(tgNew);

  alert("Saved.");
});

// Test SMS sender (uses existing /api/sms)
const testBtn = el("#sendTestSms");
const testBody = el("#smsTestBody");
const testStatus = el("#sendTestSmsStatus");
if (testBtn) {
  testBtn.addEventListener("click", async () => {
    const pwd = prompt("Admin password to send test SMS:");
    if (pwd !== CONFIG.adminPassword) { alert("Incorrect password."); return; }

    testBtn.disabled = true; testStatus.textContent = "Sending…";
    try {
      const body = (testBody?.value || "Test message").trim();
      const recipients = loadRecipients();
      if (!recipients.length) throw new Error("No recipients configured");

      const payload = {
        password: CONFIG.adminPassword,
        messages: recipients.map(r => ({ to: r.phone, body }))
      };
      const url = CONFIG.classroomEndpoints[0].replace("/api/classroom","/api/sms");
      const res = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      const rsp = await res.json();
      if (!rsp.ok) throw new Error(rsp.error || "Unknown SMS error");

      const lines = (rsp.results || []).map(r => r.ok ? `✅ ${r.to} ${r.via ? `(via ${r.via})`:""}`
                                                     : `❌ ${r.to} — ${r.error}`);
      testStatus.textContent = `Sent ${rsp.sent} / ${(rsp.results||[]).length}`;
      alert(lines.join("\n") || `Sent ${rsp.sent}`);
    } catch (e) {
      console.error(e);
      testStatus.textContent = "Failed to send test";
      alert(String(e.message || e));
    } finally {
      testBtn.disabled = false;
      setTimeout(()=>{ testStatus.textContent = ""; }, 5000);
    }
  });
}

// Test Telegram sender
const tgBtn = el("#sendTestTelegram");
const tgStatus = el("#sendTestTelegramStatus");
if (tgBtn) {
  tgBtn.addEventListener("click", async () => {
    const pwd = prompt("Admin password to send test:");
    if (pwd !== CONFIG.adminPassword) { alert("Incorrect password."); return; }

    const tg = loadTelegram();
    if (!tg.enabled) { alert("Enable Telegram first."); return; }
    if (!tg.botToken || !tg.chatId) { alert("Enter bot token and chat ID."); return; }

    tgBtn.disabled = true; tgStatus.textContent = "Sending…";
    try {
      const body = (testBody?.value || "Test: Homework alerts are working ✅").trim();
      const url = CONFIG.classroomEndpoints[0].replace("/api/classroom","/api/telegram");
      const rsp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ password: CONFIG.adminPassword, token: tg.botToken, chatId: tg.chatId, messages: [body] })
      }).then(r=>r.json());

      if (!rsp.ok) throw new Error(rsp.error || "Telegram send failed");
      tgStatus.textContent = `Sent ${rsp.sent} message(s)`;
      const lines = (rsp.results||[]).map(r => r.ok ? `✅ chat ${r.chatId} (msg ${r.msgId})` : `❌ ${r.chatId} — ${r.error}`);
      alert(lines.join("\n"));
    } catch (e) {
      tgStatus.textContent = "Failed";
      alert(String(e.message || e));
    } finally {
      tgBtn.disabled = false;
      setTimeout(()=>{ tgStatus.textContent = ""; }, 5000);
    }
  });
}

// First paint
render();
