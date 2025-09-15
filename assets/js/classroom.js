// assets/js/classroom.js
// ES module: fetch Classroom data, overlay local + committed BYPASSED, dispatch to UI.

import { CONFIG } from "./config.js";
import { evaluateAndMaybeNotify } from "./notify.js";
import { loadBypass } from "./state.js";

let firstSyncDone = false;

/**
 * Pull assignments from API endpoints and emit "assignments:loaded".
 * @param {boolean} force - if true, shows loading even after first sync.
 */
export async function syncFromClassroom(force = false) {
  const cardsEl   = document.getElementById("cards");
  const loadingEl = document.getElementById("loading");
  const emptyEl   = document.getElementById("empty");

  // Show loading on first run or when explicitly forced
  if (!firstSyncDone || force) {
    loadingEl?.classList.remove("hidden");
    emptyEl?.classList.add("hidden");
    if (cardsEl && force) cardsEl.innerHTML = "";
  }

  // Endpoints: allow string or array in config
  const endpointsRaw = CONFIG?.classroomEndpoints ?? [];
  const endpoints = Array.isArray(endpointsRaw) ? endpointsRaw : [endpointsRaw];
  if (endpoints.length === 0) {
    console.warn("[classroom] CONFIG.classroomEndpoints is missing/empty.");
    loadingEl?.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }

  // Try each endpoint until one succeeds
  let payload = null;
  let lastErr = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { mode: "cors", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = await res.json();
      break;
    } catch (e) {
      lastErr = e;
    }
  }

  loadingEl?.classList.add("hidden");
  firstSyncDone = true;

  if (!payload) {
    console.warn("[classroom] sync failed:", lastErr);
    emptyEl?.classList.remove("hidden");
    if (cardsEl) cardsEl.innerHTML = "";
    return;
  }

  // Accept either { assignments: [...] } or raw array
  const raw = Array.isArray(payload) ? payload : (payload.assignments || []);

  // Overlay from local bypass map first
  const bypassMap = loadBypass() || {};

  // Normalize records for the UI (no classification; UI handles it later)
  let list = (raw || []).map(a => {
    const id = String(a.id ?? `${a.title}-${(a.dueDateISO ?? a.dueDate ?? "")}`);
    return {
      id,
      title: a.title || a.name || "Untitled",
      course: a.course || a.courseName || a.courseTitle || "",
      dueDateISO: a.dueDateISO || a.dueDate || a.due || null,
      notes: a.description || a.notes || "",
      submissionState: a.submissionState || a.submission_state || null,
      late: !!a.late,
      // Local overlay wins for BYPASSED; otherwise keep server-provided status if any (uppercased), else UNKNOWN
      status: bypassMap[id] ? "BYPASSED" : ((a.status || "UNKNOWN").toUpperCase())
    };
  });

  // Overlay BYPASSED from committed /data/assignments.json (fresh, no cache)
  try {
    const fileUrl = new URL("data/assignments.json", location.href);
    fileUrl.searchParams.set("ts", String(Date.now())); // cache buster
    const fr = await fetch(fileUrl.href, { cache: "no-store", mode: "cors" });
    if (fr.ok) {
      const fileArr = await fr.json();
      if (Array.isArray(fileArr)) {
        const fileMap = new Map(fileArr.map(x => [String(x.id), String((x.status || "").toUpperCase())]));
        list = list.map(a => (fileMap.get(a.id) === "BYPASSED" ? { ...a, status: "BYPASSED" } : a));
      }
    }
  } catch (e) {
    console.warn("[classroom] Overlay from data/assignments.json failed:", e);
  }

  // Fire notification pipeline (non-blocking)
  try { if (typeof evaluateAndMaybeNotify === "function") await evaluateAndMaybeNotify(list); }
  catch (e) { console.warn("[classroom] notify failed:", e); }

  // Let the UI render
  document.dispatchEvent(new CustomEvent("assignments:loaded", { detail: list }));
}

// Auto-sync on load if enabled
if (typeof window !== "undefined" && CONFIG?.autoSyncOnLoad) {
  window.addEventListener("load", () => {
    setTimeout(() => { syncFromClassroom().catch(console.error); }, 80);
  });
}

// Also wire the Sync button here (safe if absent)
document.getElementById("syncBtn")?.addEventListener("click", () => {
  syncFromClassroom(true).catch(console.error);
});
