import { loadRecipients, loadTemplates, loadSmsSettings, loadLastSent, saveLastSent } from "./state.js";
import { CONFIG } from "./config.js";

function nowISO(){ return new Date().toISOString(); }
function inQuietHours(quiet){
  // "21:00-07:00"
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
      // send at most once per day per assignment for dueSoon
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

  // Fan-out to recipients via serverless API
  const payload = {
    password: CONFIG.adminPassword,   // backend also accepts this
    messages: recipients.map(r => messages.map(m => ({
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

  // Mark sent
  const sentAt = nowISO();
  for(const m of messages) last[m.key] = sentAt;
  saveLastSent(last);
}
