import { CONFIG } from "./config.js";
import { evaluateAndMaybeSend } from "./sms.js";
import { loadBypass } from "./state.js";

export async function syncFromClassroom(){
  const cardsEl = document.getElementById("cards");
  const loadingEl = document.getElementById("loading");
  const emptyEl = document.getElementById("empty");
  loadingEl.classList.remove("hidden");
  emptyEl.classList.add("hidden");
  cardsEl.innerHTML = "";

  const endpoints = CONFIG.classroomEndpoints;
  if(!endpoints || !endpoints.length) throw new Error("No classroomEndpoints configured");

  let data = null, err = null;
  for(const url of endpoints){
    try{
      const res = await fetch(url, { mode:"cors" });
      if(!res.ok) throw new Error(`Classroom endpoint error: ${res.status}`);
      data = await res.json();
      break;
    }catch(e){ err = e; }
  }
  loadingEl.classList.add("hidden");
  if(!data){ console.error("Classroom fetch failed:", err); throw err; }

  // normalize → array of assignments
  // Expected shape: [{ id, title, course, dueDateISO, status, notes }]
  // Your API already returns a list; keep it simple and pass through.
  const bypassMap = loadBypass();
  const list = (data.assignments || data || []).map(a => {
    const id = a.id ?? `${a.title}-${a.dueDateISO ?? ""}`;
    const status = bypassMap[id] ? "BYPASSED" : (a.status || "UNKNOWN");
    return { id, title:a.title||"Untitled", course:a.course||"", dueDateISO:a.dueDateISO||null, notes:a.notes||"", status };
  });

  // SMS logic (auto, rules-driven)
  try { await evaluateAndMaybeSend(list); } catch(e){ console.warn("SMS rule eval/send failed:", e); }

  // Emit event for UI renderer
  document.dispatchEvent(new CustomEvent("assignments:loaded", { detail: list }));
}

document.getElementById("syncBtn")?.addEventListener("click", syncFromClassroom);

// Auto-sync if enabled
if (CONFIG.autoSyncOnLoad) {
  window.addEventListener("load", () => {
    setTimeout(() => syncFromClassroom().catch(console.error), 50);
  });
}
