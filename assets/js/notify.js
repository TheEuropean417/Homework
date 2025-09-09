import {
  loadRecipients, loadTemplates, loadNotifySettings,
  loadLastSent, saveLastSent, loadBypass
} from "./state.js";
import { loadTelegram, loadEmail } from "./state.js";
import { CONFIG } from "./config.js";

function nowISO(){ return new Date().toISOString(); }
function inQuietHours(quiet){
  if(!quiet) return false;
  const [start,end] = quiet.split("-"); if(!start || !end) return false;
  const toMin = s => { const [h,m]=s.split(":").map(Number); return h*60+(m||0); };
  const cur = new Date(); const mins = cur.getHours()*60 + cur.getMinutes();
  const a = toMin(start), b = toMin(end);
  return (a < b) ? (mins>=a && mins<=b) : (mins>=a || mins<=b);
}
function fmtDue(deltaMs){
  const mins = Math.round(deltaMs/60000);
  if (Math.abs(mins) < 60) return `${Math.abs(mins)} min${Math.abs(mins)===1?"":"s"} ${mins>=0?"left":"late"}`;
  const hrs = Math.round(Math.abs(mins)/60);
  return `${hrs} hour${hrs===1?"":"s"} ${mins>=0?"left":"late"}`;
}
function safeId(a){ return a.id || `${a.title}-${a.dueDateISO}`; }

export async function evaluateAndMaybeNotify(assignments){
  const settings = loadNotifySettings();
  const templates = loadTemplates();
  const last = loadLastSent();
  const bypass = loadBypass();
  const now = new Date();

  if(inQuietHours(settings.quiet)) return;

  // decide who to notify
  const toSend = [];
  for(const a0 of assignments){
    const a = { ...a0 };
    if (bypass[a.id]) continue; // hidden & ignored
    if(!a.dueDateISO) continue;

    const due = new Date(a.dueDateISO);
    const ms = due - now;

    // Late flag if past due
    if (ms < 0) a.status = "LATE";

    // Due soon
    if(ms > 0 && ms <= (settings.dueSoonHours*3600*1000)){
      const id = `dueSoon:${safeId(a)}`;
      const lastTime = last[id];
      const should = !lastTime || (Date.now()-new Date(lastTime).getTime() > 22*3600*1000);
      if(should) toSend.push({ key:id, a });
    }
    // Became late
    if(settings.onLate && ms < 0 && a.status === "LATE"){
      const id = `becameLate:${safeId(a)}`;
      const lastTime = last[id];
      if(!lastTime) toSend.push({ key:id, a });
    }
  }
  if(!toSend.length) return;

  // Build body factory
  const tmplStr = templates[settings.alertTemplate] || "Reminder: {title} due {dueDate} ({dueIn}).";
  const bodyFor = (a) =>
    tmplStr
      .replaceAll("{title}", a.title)
      .replaceAll("{course}", a.course || "")
      .replaceAll("{dueDate}", a.dueDateISO ? new Date(a.dueDateISO).toLocaleString() : "N/A")
      .replaceAll("{dueIn}", a.dueDateISO ? fmtDue(new Date(a.dueDateISO)-now) : "N/A")
      .replaceAll("{status}", a.status || "");

  // TELEGRAM
  const tg = loadTelegram();
  if (tg.enabled && tg.botToken && (tg.chatIds?.trim()?.length || true)) {
    // Prefer explicit chatIds CSV; otherwise collect from recipients that have chatId
    let ids = (tg.chatIds || "").split(",").map(s=>s.trim()).filter(Boolean);
    if (!ids.length) {
      ids = loadRecipients().map(r=>r.chatId).filter(Boolean);
    }
    if (ids.length) {
      const messages = toSend.map(({ a }) => bodyFor(a));
      try{
        const res = await fetch(CONFIG.classroomEndpoints[0].replace("/api/classroom","/api/telegram"),{
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ password: CONFIG.adminPassword, token: tg.botToken, chatId: ids, messages })
        });
        if(!res.ok){
          const txt = await res.text().catch(()=>res.statusText);
          console.warn("Telegram send failed:", res.status, txt);
        }else{
          const sentAt = nowISO();
          for (const {key} of toSend) last[key] = sentAt;
          saveLastSent(last);
        }
      }catch(e){ console.warn("Telegram error:", e); }
    }
  }

  // EMAIL
  const email = loadEmail();
  if (email.enabled) {
    const recips = loadRecipients().map(r=>r.email).filter(Boolean);
    if (recips.length) {
      const messages = recips.map(to => ({
        to,
        subject: email.subject || "Homework Reminder",
        text: toSend.map(({a})=>bodyFor(a)).join("\n\n")
      }));
      try{
        const res = await fetch(CONFIG.classroomEndpoints[0].replace("/api/classroom","/api/email"),{
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ password: CONFIG.adminPassword, messages })
        });
        if(!res.ok){
          const txt = await res.text().catch(()=>res.statusText);
          console.warn("Email send failed:", res.status, txt);
        }else{
          const sentAt = nowISO();
          for (const {key} of toSend) last[key] = sentAt;
          saveLastSent(last);
        }
      }catch(e){ console.warn("Email error:", e); }
    }
  }
}
