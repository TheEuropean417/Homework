import { state } from "./state.js";
import { renderTable } from "./table.js";
import { toast } from "./ui.js";
import { openPreviewReminders, copyAllReminders } from "./reminders.js";
import { syncFromClassroom } from "./classroom.js";

export function wireEvents() {
  ["filterStudent","filterCourse","filterStatus","filterWindow","sortSelect","searchBox"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => { state.page = 1; renderTable(); });
  });

  document.getElementById("prevPage").addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    renderTable();
  });
  document.getElementById("nextPage").addEventListener("click", () => {
    state.page = state.page + 1;
    renderTable();
  });

  // Classroom sync
  document.getElementById("syncBtn").addEventListener("click", syncFromClassroom);

  // Reminder preview
  document.getElementById("notifyBtn").addEventListener("click", openPreviewReminders);
  document.getElementById("copyAllBtn").addEventListener("click", copyAllReminders);

  // Table delegated actions
  document.getElementById("assignmentTbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (btn?.dataset.action === "complete") {
      toast("Marked complete");
    }
  });
}
