import { loadRecipients, loadTemplates, loadSmsSettings, loadLastSent, saveLastSent } from "./state.js";
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
  if(!settings.enabled) return;
  if(inQuietHours(settings.quiet)) return;

  const templates = loadTemplates();
  const tmpl = templates[settings.alertTemplate] || "Reminder: {title} due {dueDate} ({dueIn}).";

  const recipients = loadRecipients();
  if(!recipients.length) return;

  const last = loadLastSent();
  const toSend = [];
  const now = new Date();

  for(const a of assignments){
    if(!a.dueDateISO) continue;
    const due = new Date(a.dueDateISO);
    const ms = due - now;

    if(a.status === "BYPASSED") continue;

    // Due soon window
    if(ms > 0 && ms <= (settings.dueSoonHours*3600*1000)){
      const id = `dueSoon:${safeId(a)}`;
      const lastTime = last[id];
      const should = !lastTime || (Date.now()-new Date(lastTime).getTime() > 22*3600*1000);
      if(should) toSend.push({ key:id, a });
    }

    // Late trigger
    if(settings.onLate && ms < 0 && a.status === "LATE"){
      const id = `becameLate:${safeId(a)}`;
      const lastTime = last[id];
      if(!lastTime) toSend.push({ key:id, a });
    }
  }

  if(!toSend.length) return;

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
    messages: loadRecipients().map(r => messages.map(m => ({
      to: r.phone, body: m.body, tag: m.key
    }))).flat()
  };

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
}

// ---- Test SMS helper ----
export async function sendTestSmsToAll(message) {
  const { adminPassword, classroomEndpoints } = CONFIG;
  const { loadRecipients } = await import("./state.js");
  const recipients = loadRecipients();
  if (!recipients.length) throw new Error("No recipients configured");

  const payload = {
    password: adminPassword,
    messages: recipients.map(r => ({ to: r.phone, body: (message || "Test message").trim() }))
  };

  const url = classroomEndpoints[0].replace("/api/classroom", "/api/sms");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`SMS API ${res.status}: ${txt}`);
  }
  return res.json();
}
