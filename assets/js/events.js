import { state } from "./state.js";
import { renderTable } from "./table.js";
import { toast } from "./ui.js";
import { openPreviewReminders, copyAllReminders } from "./reminders.js";
import { syncFromClassroom } from "./classroom.js";

export function wireEvents() {
  ["filterStudent","filterCourse","filterStatus","filterWindow","sortSelect","searchBox"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => { state.page = 1; renderTable(); });
  });

  const prev = document.getElementById("prevPage");
  const next = document.getElementById("nextPage");
  prev?.addEventListener("click", () => { state.page = Math.max(1, state.page - 1); renderTable(); });
  next?.addEventListener("click", () => { state.page = state.page + 1; renderTable(); });

  document.getElementById("syncBtn")?.addEventListener("click", syncFromClassroom);
  document.getElementById("notifyBtn")?.addEventListener("click", openPreviewReminders);
  document.getElementById("copyAllBtn")?.addEventListener("click", copyAllReminders);

  document.getElementById("assignmentTbody")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (btn?.dataset.action === "complete") toast("Marked complete");
  });
}
