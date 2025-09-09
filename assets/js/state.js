export const store = {
  get(key, fallback){
    try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }catch{ return fallback; }
  },
  set(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
};

// recipients: [{id, name, phone}]
export function loadRecipients(){ return store.get("recipients", []); }
export function saveRecipients(list){ store.set("recipients", list); }

// templates: { name: body }
export function loadTemplates(){ return store.get("templates", { due_soon: "Reminder: {title} for {course} is due {dueDate} ({dueIn}). Status: {status}." }); }
export function saveTemplates(map){ store.set("templates", map); }

// SMS rules/settings
export function loadSmsSettings(){
  return store.get("smsSettings", {
    enabled: false,
    quiet: "21:00-07:00",
    dueSoonHours: 24,
    onLate: true,
    summaryTime: "19:30",
    alertTemplate: "due_soon"
  });
}
export function saveSmsSettings(s){ store.set("smsSettings", s); }

// BYPASSED map by assignment id
export function loadBypass(){ return store.get("bypassMap", {}); }
export function saveBypass(map){ store.set("bypassMap", map); }

// last-run timestamps to avoid spamming SMS
export function loadLastSent(){ return store.get("lastSent", {}); }
export function saveLastSent(map){ store.set("lastSent", map); }
