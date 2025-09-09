import { loadRecipients, loadTemplates, loadSmsSettings, loadLastSent, saveLastSent, loadTelegram } from "./state.js";
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

export async function evaluateAndMaybeSend(assignments){
  const settings = loadSmsSettings();
  const templates = loadTemplates();
  const last = loadLastSent();
  const recipients = loadRecipients();
  const now = new Date();

  if(inQuietHours(settings.quiet)) return;

  const toSend = [];
  for(const a of assignments){
    if(!a.dueDateISO) continue;
    const due = new Date(a.dueDateISO);
    const ms = due - now;

    if(a.status === "BYPASSED") continue;

    if(ms > 0 && ms <= (settings.dueSoonHours*3600*1000)){
      const id = `dueSoon:${safeId(a)}`;
      const lastTime = last[id];
      const should = !lastTime || (Date.now()-new Date(lastTime).getTime() > 22*3600*1000);
      if(should) toSend.push({ key:id, a });
    }

    if(settings.onLate && ms < 0 && a.status === "LATE"){
      const id = `becameLate:${safeId(a)}`;
      const lastTime = last[id];
      if(!lastTime) toSend.push({ key:id, a });
    }
  }

  if(!toSend.length) return;

  // ---- Telegram path (preferred free option) ----
  const tg = loadTelegram();
  if (tg.enabled && tg.botToken && tg.chatId) {
    const bodyFor = (a) =>
      (templates[settings.alertTemplate] || "Reminder: {title} due {dueDate} ({dueIn}).")
        .replaceAll("{title}", a.title)
        .replaceAll("{course}", a.course||"")
        .replaceAll("{dueDate}", a.dueDateISO ? new Date(a.dueDateISO).toLocaleString() : "N/A")
        .replaceAll("{dueIn}", a.dueDateISO ? fmtDue(new Date(a.dueDateISO)-now) : "N/A")
        .replaceAll("{status}", a.status||"");

    const messages = toSend.map(({ a }) => bodyFor(a));
    const url = CONFIG.classroomEndpoints[0].replace("/api/classroom","/api/telegram");
    try{
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          password: CONFIG.adminPassword,
          token: tg.botToken,
          chatId: tg.chatId,
          messages
        })
      });
      if(!res.ok){
        const txt = await res.text().catch(()=>res.statusText);
        console.warn("Telegram send failed:", res.status, txt);
      }else{
        const sentAt = nowISO();
        for (const {key} of toSend) last[key] = sentAt;
        saveLastSent(last);
      }
    }catch(e){
      console.warn("Telegram send exception:", e);
    }
    return; // skip SMS below
  }

  // ---- SMS path (only if enabled and Telegram not used) ----
  if(!settings.enabled || !recipients.length) return;

  const tmpl = templates[settings.alertTemplate] || "Reminder: {title} due {dueDate} ({dueIn}).";
  const messages = toSend.map(({key,a})=>{
    const body = tmpl
      .replaceAll("{title}", a.title)
      .replaceAll("{course}", a.course||"")
      .replaceAll("{dueDate}", a.dueDateISO ? new Date(a.dueDateISO).toLocaleString() : "N/A")
      .replaceAll("{dueIn}", a.dueDateISO ? fmtDue(new Date(a.dueDateISO)-now) : "N/A")
      .replaceAll("{status}", a.status||"");
    return { key, a, body };
  });

  const payload = {
    password: CONFIG.adminPassword,
    messages: recipients.map(r => messages.map(m => ({
      to: r.phone, body: m.body, tag: m.key
    }))).flat()
  };

  try {
    const res = await fetch(CONFIG.classroomEndpoints[0].replace("/api/classroom","/api/sms"),{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      const txt = await res.text().catch(()=>res.statusText);
      console.warn("SMS send failed:", res.status, txt);
      return;
    }
    const sentAt = nowISO();
    for(const m of messages) last[m.key] = sentAt;
    saveLastSent(last);
  } catch(e){
    console.warn("SMS send exception:", e);
  }
}
