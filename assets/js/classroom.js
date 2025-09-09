import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { renderTable, loadFilters } from "./table.js";
import { refreshStats } from "./stats.js";
import { renderRoutes } from "./routes.js";
import { toast, setDiag } from "./ui.js";

function statusFromDue_(due) {
  if (!due) return "UPCOMING";
  const now = new Date();
  const d = new Date(due);
  const start = new Date(now); start.setHours(0,0,0,0);
  const tomorrow = new Date(start); tomorrow.setDate(start.getDate()+1);
  if (d < now) return "LATE";
  if (d.toDateString() === start.toDateString()) return "DUE_TODAY";
  if (d.toDateString() === tomorrow.toDateString()) return "DUE_TOMORROW";
  return (d - now <= 7*24*3600e3) ? "UPCOMING" : "UPCOMING";
}

function setSyncStatus(txt) {
  const el = document.getElementById("syncStatus");
  if (el) el.textContent = txt || "";
}

function renderAll() {
  loadFilters();
  refreshStats();
  renderTable();
  renderRoutes();
}

async function fetchJSON(url) {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function syncFromClassroom() {
  const urls = CONFIG.classroomEndpoints || [];
  try {
    if (!urls.length) throw new Error("No classroomEndpoints configured");
    setSyncStatus("Syncing…");
    toast("Syncing from Classroom…");
    setDiag(`Calling: ${urls.join(" → ")}`);

    let data = null, lastErr = null, used = null;
    for (const u of urls) {
      try { data = await fetchJSON(u); used = u; break; }
      catch (e) { lastErr = e; console.error("Classroom fetch failed:", u, e); }
    }
    if (!data) throw lastErr || new Error("No endpoint succeeded");

    state.courses = (data.courses || []).map(c => ({ id: String(c.id), name: c.name || "" }));
    state.assignments = (data.assignments || []).map(a => ({
      id: String(a.id),
      courseId: String(a.courseId),
      title: a.title || "",
      description: a.description || "",
      due: a.dueDate ? new Date(a.dueDate) : null,
      status: statusFromDue_(a.dueDate),
      student: state.students[0]?.name || "Student"
    }));

    renderAll();
    const ts = new Date().toLocaleString();
    setSyncStatus(`Last synced ${ts}`);
    setDiag(`OK from: ${used} @ ${ts}`);
    toast("Classroom sync complete");
  } catch (err) {
    console.error("Sync error:", err);
    setSyncStatus("Sync failed");
    setDiag("Sync failed: " + (err?.message || err));
    toast("Classroom sync failed");
  }
}

export async function maybeAutoSync() {
  setSyncStatus("Ready");
  if (CONFIG.autoSyncOnLoad) setTimeout(() => { syncFromClassroom(); }, 300);
}
