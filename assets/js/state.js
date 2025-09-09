// Local storage helpers
export const store = {
  get(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }catch{ return fallback; } },
  set(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
};

// Recipients: [{id, name, email, chatId}]
export function loadRecipients(){ return store.get("recipients", []); }
export function saveRecipients(list){ store.set("recipients", list); }

// Templates for notifications
export function loadTemplates(){
  return store.get("templates", {
    due_soon: "Reminder: {title} for {course} is due {dueDate} ({dueIn}). Status: {status}."
  });
}
export function saveTemplates(map){ store.set("templates", map); }

// Notification rules (shared)
export function loadNotifySettings(){
  return store.get("notifySettings", {
    quiet: "21:00-07:00",
    dueSoonHours: 24,
    onLate: true,
    summaryTime: "19:30",
    alertTemplate: "due_soon"
  });
}
export function saveNotifySettings(s){ store.set("notifySettings", s); }

// Status maps
export function loadBypass(){ return store.get("bypassMap", {}); }
export function saveBypass(map){ store.set("bypassMap", map); }
export function loadLocalDone(){ return store.get("localDoneMap", {}); }
export function saveLocalDone(map){ store.set("localDoneMap", map); }
export function loadLastSent(){ return store.get("lastSent", {}); }
export function saveLastSent(map){ store.set("lastSent", map); }

// Channels
export function loadTelegram(){ return store.get("telegram", { enabled:false, botToken:"", chatIds:"" }); } // chatIds CSV or single
export function saveTelegram(v){ store.set("telegram", v); }
export function loadEmail(){ return store.get("email", { enabled:false, subject:"Homework Reminder" }); }
export function saveEmail(v){ store.set("email", v); }
