import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { renderTable, loadFilters } from "./table.js";
import { refreshStats } from "./stats.js";
import { renderRoutes } from "./routes.js";
import { toast } from "./ui.js";

// ----- helpers
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

// ----- primary fetch (CORS normal)
async function fetchClassroomJSON() {
  const res = await fetch(CONFIG.classroomEndpoint, { mode: "cors" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ----- JSONP fallback (used when CONFIG.useJsonp === true)
function fetchClassroomJSONP() {
  return new Promise((resolve, reject) => {
    const cbName = "onClassroomJSON_" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    const url = `${CONFIG.classroomEndpoint}?callback=${cbName}`;
    window[cbName] = (data) => { resolve(data); cleanup(); };
    function cleanup(){ try{ delete window[cbName]; }catch{} s.remove(); }
    s.onerror = () => { reject(new Error("JSONP load failed")); cleanup(); };
    s.src = url;
    document.head.appendChild(s);
  });
}

export async function syncFromClassroom() {
  try {
    if (!CONFIG.classroomEndpoint) {
      toast("No Classroom endpoint configured");
      return;
    }
    setSyncStatus("Syncing…");
    toast("Syncing from Classroom…");

    const data = CONFIG.useJsonp ? await fetchClassroomJSONP() : await fetchClassroomJSON();

    // Merge into state
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
    const t = new Date();
    setSyncStatus(`Last synced ${t.toLocaleString()}`);
    toast("Classroom sync complete");
  } catch (err) {
    console.error(err);
    setSyncStatus("Sync failed");
    toast("Classroom sync failed");
  }
}

// auto-sync hook (optional)
export async function maybeAutoSync() {
  if (CONFIG.autoSyncOnLoad) {
    setTimeout(() => { syncFromClassroom(); }, 300);
  } else {
    setSyncStatus("Ready");
  }
}
