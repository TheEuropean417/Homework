// assets/js/admin.js — admin modal, recipients/templates/rules/bypass, test tools

import { CONFIG } from "./config.js";
import {
  loadRecipients, saveRecipients,
  loadTemplates,  saveTemplates,
  loadNotifySettings, saveNotifySettings,
  loadBypass,     saveBypass
} from "./state.js";
import { sendEmailsToConfiguredRecipients } from "./email.js";

// ------- Defaults for Telegram on the Admin page -------
const DEFAULT_TG_CHAT_ID = (CONFIG.telegramDefaultChatId ?? "6406811650").trim();
const DEFAULT_TG_BOT     = (CONFIG.telegramBotToken      ?? "8427542086:AAEms3DMRG692b084EgUcgyaFSdjV_jdjjo").trim();

export function ensureTelegramDefaults(){
  // Try several likely IDs so we work with your current markup
  const chat = document.querySelector("#recChatId") || document.querySelector("#recTg") || document.querySelector("#tgChatId");
  if (chat && !chat.value) chat.value = DEFAULT_TG_CHAT_ID;

  const bot = document.querySelector("#tgBotToken");
  if (bot && !bot.value) bot.value = DEFAULT_TG_BOT;

  // Also set placeholders so users can see the defaults even if a value exists
  if (chat && !chat.placeholder) chat.placeholder = DEFAULT_TG_CHAT_ID;
  if (bot  && !bot.placeholder ) bot.placeholder  = DEFAULT_TG_BOT;
}

// ------- Admin modal wiring (open/close/unlock) -------
function wireAdminModal(){
  const modal = document.querySelector("#adminModal");
  if(!modal) return;

  const openBtn   = document.querySelector("#adminBtn");
  const closeBtn  = document.querySelector("#adminClose");
  const unlockBtn = document.querySelector("#adminUnlock");

  openBtn?.addEventListener("click", ()=>modal.showModal());
  closeBtn?.addEventListener("click", ()=>modal.close());

  document.querySelector("#adminPwToggle")?.addEventListener("click", (ev)=>{
    const inp = document.querySelector("#adminPassword"); if(!inp) return;
    const isPass = inp.type === "password"; inp.type = isPass ? "text" : "password";
    ev.currentTarget.setAttribute("aria-label", isPass ? "Hide password":"Show password");
  });

  unlockBtn?.addEventListener("click", ()=>{
    const pwd = document.querySelector("#adminPassword")?.value?.trim();
    if(pwd !== CONFIG.adminPassword){
      const err = document.querySelector("#adminErr");
      if (err){ err.textContent = "Wrong password"; err.classList.remove("hidden"); }
      return;
    }
    document.querySelector("#adminErr")?.classList.add("hidden");
    document.querySelector("#adminGate")?.classList.add("hidden");
    document.querySelector("#adminBody")?.classList.remove("hidden");

    ensureTelegramDefaults();
    buildRecipientsPanel();
    buildTemplatesPanel();
    buildRulesPanel();
    buildBypassList();
    wireEmailTests();        // new “Send Test Email to All”
    wireLegacyTests();       // old test block buttons (kept working if present)
  });
}

// ------- Recipients -------
function buildRecipientsPanel(){
  const list = document.querySelector("#recipientsList");
  if(!list) return;

  const data = loadRecipients() || [];
  list.innerHTML = "";
  for (const r of data){
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
      saveRecipients(next);
      buildRecipientsPanel();
    });
    list.appendChild(row);
  }

  // Add new recipient
  const addBtn = document.querySelector("#addRecipient");
  if (addBtn && !addBtn.__wired){
    addBtn.__wired = true;
    addBtn.addEventListener("click", ()=>{
      const name  = document.querySelector("#recName")?.value?.trim();
      const email = document.querySelector("#recEmail")?.value?.trim();
      const chat  = (document.querySelector("#recChatId") || document.querySelector("#recTg"))?.value?.trim();
      if(!name && !email && !chat){ alert("Enter at least a name and an email or Telegram chat_id."); return; }
      const next = loadRecipients() || [];
      next.push({ name, email, telegram_chat_id: chat });
      saveRecipients(next);
      const n = id => document.querySelector(id);
      if (n("#recName"))  n("#recName").value  = "";
      if (n("#recEmail")) n("#recEmail").value = "";
      if (n("#recChatId")) n("#recChatId").value = "";
      if (n("#recTg")) n("#recTg").value = "";
      buildRecipientsPanel();
    });
  }
}

// ------- Templates -------
function buildTemplatesPanel(){
  const list = document.querySelector("#templatesList");
  if(!list) return;

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

  const add = document.querySelector("#addTemplate");
  if (add && !add.__wired){
    add.__wired = true;
    add.addEventListener("click", ()=>{
      const key = document.querySelector("#tmplName")?.value?.trim();
      const txt = document.querySelector("#tmplBody")?.value ?? "";
      if(!key){ alert("Template key is required"); return; }
      tpls[key] = { body: txt };
      saveTemplates(tpls);
      refresh();
    });
  }

  refresh();
}

// ------- Rules / Notification settings -------
function buildRulesPanel(){
  const s = loadNotifySettings();
  const qh = document.querySelector("#quiet") || document.querySelector("#ruleQuietHours");
  const soon = document.querySelector("#dueSoonHrs") || document.querySelector("#ruleDueSoonHours");
  const late = document.querySelector("#onLate") || document.querySelector("#ruleNotifyLate");
  const dsum = document.querySelector("#summaryTime") || document.querySelector("#ruleDailyTime");
  const tmpl = document.querySelector("#alertTemplate");
  if(qh)   qh.value   = s.quiet || "21:00-07:00";
  if(soon) soon.value = String(s.dueSoonHours ?? 24);
  if(late) late.checked = !!s.onLate;
  if(dsum) dsum.value = s.summaryTime || "19:30";
  if(tmpl) tmpl.value = s.alertTemplate || "due_soon";

  const save = document.querySelector("#rulesSave");
  if (save && !save.__wired){
    save.__wired = true;
    save.addEventListener("click", ()=>{
      saveNotifySettings({
        quiet: qh?.value || "21:00-07:00",
        dueSoonHours: Number(soon?.value || 24),
        onLate: !!late?.checked,
        summaryTime: dsum?.value || "19:30",
        alertTemplate: tmpl?.value || "due_soon"
      });
      alert("Rules saved");
    });
  }
}

// ------- Bypass list -------
function buildBypassList(){
  const list = document.querySelector("#bypassList");
  if(!list) return;
  const map = loadBypass() || {};
  list.innerHTML = "";
  const ids = Object.keys(map);
  if(!ids.length){
    const d = document.createElement("div");
    d.className="muted small"; d.textContent="Nothing is bypassed.";
    list.appendChild(d); return;
  }
  for (const id of ids){
    const row = document.createElement("div"); row.className="item";
    row.innerHTML = `<div>Assignment ${id}</div><div><button class="btn unb">Unbypass</button></div>`;
    row.querySelector(".unb")?.addEventListener("click", ()=>{
      const m = loadBypass() || {}; delete m[id]; saveBypass(m);
      buildBypassList();
      // ui.js will re-render on next sync or can listen to a custom event if needed
    });
    list.appendChild(row);
  }
}

// ------- Email test panels -------
function wireEmailTests(){
  const btn    = document.querySelector("#sendTestEmail");
  const subject= document.querySelector("#emailTestSubject");
  const body   = document.querySelector("#emailTestBody");
  const status = document.querySelector("#sendTestEmailStatus");

  if (btn && !btn.__wired){
    btn.__wired = true;
    btn.addEventListener("click", async ()=>{
      // Collect recipients with valid emails
      const recipients = (loadRecipients()||[]).filter(r => r.email && /\S+@\S+\.\S+/.test(r.email));
      if (!recipients.length){
        if (status) status.textContent = "No recipients with valid email — add one in Recipients.";
        alert("No recipients with a valid email. Add at least one in Recipients.");
        return;
      }

      btn.disabled = true; if(status) status.textContent = "Sending…";
      try{
        const rsp = await sendEmailsToConfiguredRecipients({
          subject: (subject?.value || "Homework — Test Notification").trim(),
          text: (body?.value || "Test: Homework email notifications are configured and working.").trim()
        });
        if(status) status.textContent = `Sent ${rsp?.sent ?? 0} email(s)`;
      }catch(e){
        console.error(e);
        if(status) status.textContent = "Failed to send";
        alert(String(e?.message||e));
      }finally{
        btn.disabled = false;
        setTimeout(()=>{ if(status) status.textContent = ""; }, 4000);
      }
    });
  }
}

// ------- Legacy “Send Test Email / Telegram” block (if present) -------
function wireLegacyTests(){
  const legacyEmailBtn = document.querySelector("#testEmailBtn");
  const legacyMsg      = document.querySelector("#testMsg");

  if (legacyEmailBtn && !legacyEmailBtn.__wired){
    legacyEmailBtn.__wired = true;
    legacyEmailBtn.addEventListener("click", async ()=>{
      const recipients = (loadRecipients()||[]).filter(r => r.email && /\S+@\S+\.\S+/.test(r.email));
      if (!recipients.length){ alert("No recipients with a valid email. Add at least one in Recipients."); return; }
      try{
        await sendEmailsToConfiguredRecipients({
          subject: "Homework — Test Notification",
          text: (legacyMsg?.value || "Test: Notifications are working ✅").trim()
        });
        alert("Test email sent.");
      }catch(e){ console.error(e); alert(String(e?.message||e)); }
    });
  }
}

// ------- Public entry ----------
export function wireAdmin(){
  wireAdminModal();
}
