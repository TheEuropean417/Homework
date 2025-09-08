import { state } from "./state.js";
import { toast, openModal } from "./ui.js";

export function renderRoutes() {
  const grid = document.getElementById("routesGrid");
  if (!state.routes.length) {
    grid.innerHTML = `<div class="muted">No recipients yet. Click <b>Add Recipient</b>.</div>`;
    return;
  }
  grid.innerHTML = state.routes.map(r => {
    const stu = state.students.find(s => s.id === r.studentId);
    const chipClass = r.channel === "SMS" ? "b-tomorrow" : "b-up";
    return `
      <div class="card glass">
        <div class="row between">
          <div style="font-weight:600">${stu?.name || "Unknown"}</div>
          <span class="badge ${chipClass}">${r.channel}</span>
        </div>
        <div class="muted" style="margin-top:6px;word-break:break-all">${r.destination}</div>
        <div class="muted" style="font-size:12px;margin-top:4px">Policy: <code>${JSON.stringify(r.policy)}</code></div>
        <div class="toolbar" style="margin-top:8px">
          <button class="btn" data-edit="${r.id}">Edit</button>
          <button class="btn" data-delete="${r.id}">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

export function setupRouteModal() {
  document.getElementById("addRouteBtn").addEventListener("click", () => {
    document.getElementById("routeModalTitle").textContent = "Add Recipient";
    document.getElementById("routeDestination").value = "";
    document.getElementById("routeChannel").value = "SMS";
    document.getElementById("routeStudent").value = state.students[0]?.id || "";
    openModal("routeModal");
  });

  document.getElementById("routeSaveBtn").addEventListener("click", () => {
    const id = "r" + Math.random().toString(36).slice(2, 8);
    const studentId = document.getElementById("routeStudent").value;
    const channel = document.getElementById("routeChannel").value;
    const destination = document.getElementById("routeDestination").value.trim();
    const policy = document.getElementById("routePolicy").value;
    const templateId = document.getElementById("routeTemplate").value;

    if (!studentId || !destination) return toast("Student and destination required");
    state.routes.push({ id, studentId, channel, destination, policy, templateId });
    document.getElementById("routeModal").close();
    renderRoutes();
    toast("Recipient saved");
    // TODO: persist routes to JSON via backend (when you add one)
  });

  document.getElementById("refreshRoutesBtn").addEventListener("click", () => {
    renderRoutes();
    toast("Routes refreshed");
  });

  // Delegated edit/delete actions
  document.getElementById("routesGrid").addEventListener("click", (e) => {
    const el = e.target.closest("button");
    if (!el) return;
    if (el.dataset.delete) {
      const id = el.dataset.delete;
      state.routes = state.routes.filter(r => r.id !== id);
      renderRoutes();
      toast("Recipient deleted");
    } else if (el.dataset.edit) {
      toast("Edit flow (TODO)"); // left as exercise
    }
  });
}
