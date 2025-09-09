import { CONFIG } from "./config.js";
import { evaluateAndMaybeNotify } from "./notify.js";
import { loadBypass } from "./state.js";

let firstSyncDone = false;

export async function syncFromClassroom(force = false){
  const cardsEl   = document.getElementById("cards");
  const loadingEl = document.getElementById("loading");
  const emptyEl   = document.getElementById("empty");

  if (!firstSyncDone || force) {
    loadingEl?.classList.remove("hidden");
    emptyEl?.classList.add("hidden");
    if (cardsEl && force) cardsEl.innerHTML = "";
  }

  const endpoints = CONFIG.classroomEndpoints || [];
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    console.warn("CONFIG.classroomEndpoints is missing or empty.");
    loadingEl?.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }

  let data = null, lastErr = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      break;
    } catch (e) {
      lastErr = e;
    }
  }

  loadingEl?.classList.add("hidden");
  firstSyncDone = true;

  if (!data) {
    console.warn("Classroom sync failed:", lastErr);
    emptyEl?.classList.remove("hidden");
    if (cardsEl) cardsEl.innerHTML = "";
    return;
  }

  // Accept either { assignments: [...] } or raw array
  const raw = Array.isArray(data) ? data : (data.assignments || []);
  const bypassMap = loadBypass();

  const list = (raw || []).map(a => {
    const id = a.id ?? `${a.title}-${a.dueDateISO ?? ""}`;
    const status = bypassMap[id] ? "BYPASSED" : (a.status || "UNKNOWN");
    return {
      id,
      title: a.title || "Untitled",
      course: a.course || a.courseName || "",
      dueDateISO: a.dueDateISO || null,
      notes: a.description || a.notes || "",
      status
    };
  });

  try { await evaluateAndMaybeNotify(list); } catch (e) { console.warn("Notify failed:", e); }
  document.dispatchEvent(new CustomEvent("assignments:loaded", { detail: list }));
}

// Auto-sync on load if enabled
if (typeof window !== "undefined" && CONFIG.autoSyncOnLoad) {
  window.addEventListener("load", () => {
    // tiny delay to ensure DOM is ready
    setTimeout(() => { syncFromClassroom().catch(console.error); }, 80);
  });
}
