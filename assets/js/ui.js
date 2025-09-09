// UI helpers: toast, modal open/close, badge, date formatting, etc.

export function toast(msg) {
  const t = document.getElementById("toast");
  const m = document.getElementById("toastMsg");
  m.textContent = msg;
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 1800);
}

export function fmtDate(d) {
  if (!d) return "—";
  try {
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function statusBadge(status) {
  const map = {
    DUE_TODAY: "b-today",
    DUE_TOMORROW: "b-tomorrow",
    UPCOMING: "b-up",
    LATE: "b-late",
    COMPLETED: "b-up"
  };
  return `<span class="badge ${map[status] || "b-up"}">${status.replace("_", " ")}</span>`;
}

export function openModal(id) {
  const dlg = document.getElementById(id);
  dlg?.showModal();
}

export function closeModal(id) {
  const dlg = document.getElementById(id);
  dlg?.close();
}
