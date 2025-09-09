// assets/js/classroom.js
// ES module for the browser. Handles syncing from your /api/classroom,
// normalizes results, triggers notifications, and broadcasts to the UI.

import { CONFIG } from "./config.js";
import { evaluateAndMaybeNotify } from "./notify.js";
import { loadBypass } from "./state.js";

let firstSyncDone = false;

/**
 * Pull assignments from API and emit "assignments:loaded".
 * @param {boolean} force - if true, shows the loading state even after first sync.
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

  // Endpoints: allow string or array in config, coerce to array
  const endpointsRaw = CONFIG.classroomEndpoints ?? [];
  const endpoints = Array.isArray(endpointsRaw) ? endpointsRaw : [endpointsRaw];
  if (endpoints.length === 0) {
    console.warn("CONFIG.classroomEndpoints is missing or empty.");
    loadingEl?.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }

  // Try each endpoint until one succeeds
  let payload = null;
  let lastErr = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { mode: "cors" });
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
    console.warn("Classroom sync failed:", lastErr);
    emptyEl?.classList.remove("hidden");
    if (cardsEl) cardsEl.innerHTML = "";
    return;
  }

  // Accept either { assignments: [...] } or a raw array
  const raw = Array.isArray(payload) ? payload : (payload.assignments || []);

  // Local bypass overlay
  const bypassMap = loadBypass();

  // Normalize records for the UI
  const list = (raw || []).map(a => {
    const id = String(a.id ?? `${a.title}-${a.dueDateISO ?? ""}`);
    return {
      id,
      title: a.title || "Untitled",
      course: a.course || a.courseName || "",
      dueDateISO: a.dueDateISO || null,
      notes: a.description || a.notes || "",
      // Classroom submission fields (if provided by API):
      submissionState: a.submissionState || null, // NEW | CREATED | TURNED_IN | RETURNED | RECLAIMED_BY_STUDENT
      late: !!a.late,                               // boolean flag from API (if present)
      // Local-only UI status (bypass overlay)
      status: bypassMap[id] ? "BYPASSED" : (a.status || "UNKNOWN")
    };
  });

  // Fire notification pipeline (Telegram/Email) but never block rendering
  try { await evaluateAndMaybeNotify(list); } catch (e) { console.warn("Notify failed:", e); }

  // Let the UI render
  document.dispatchEvent(new CustomEvent("assignments:loaded", { detail: list }));
}

// Auto-sync on load if enabled
if (typeof window !== "undefined" && CONFIG.autoSyncOnLoad) {
  window.addEventListener("load", () => {
    setTimeout(() => { syncFromClassroom().catch(console.error); }, 80);
  });
}

// Also wire the button here (safe if it's absent)
document.getElementById("syncBtn")?.addEventListener("click", () => {
  syncFromClassroom(true).catch(console.error);
});
