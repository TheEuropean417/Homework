import { state } from "./state.js";
import { lookupCourseName } from "./table.js";

function formatDue(d) {
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function hb(template, ctx) {
  // Tiny Handlebars-ish render for {{var}} only
  return template.replace(/\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g, (_, k) => {
    const parts = k.split(".");
    let val = ctx;
    for (const p of parts) val = val?.[p];
    return (val ?? "").toString();
  });
}

function findTemplate(id) {
  return state.templates.find(t => t.id === id);
}

function buildContext(a) {
  return {
    student: state.students[0]?.name || "Student",
    course: lookupCourseName(a.courseId),
    title: a.title,
    dueDate: formatDue(a.due)
  };
}

// Filter assignments by “when” policy
function selectAssignments(when) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (when === "DUE_TOMORROW") {
    start.setDate(now.getDate() + 1); start.setHours(0,0,0,0);
    end.setDate(now.getDate() + 2);   end.setHours(0,0,0,0);
  } else if (when === "DUE_TODAY") {
    start.setHours(0,0,0,0);
    end.setDate(now.getDate() + 1); end.setHours(0,0,0,0);
  } else if (when === "WEEKLY_DIGEST") {
    start.setDate(now.getDate() + 1); start.setHours(0,0,0,0);
    end.setDate(start.getDate() + 7);
  } else {
    // default: upcoming 7d
    start.setHours(0,0,0,0);
    end.setDate(start.getDate() + 7);
  }

  return state.assignments.filter(a => a.due >= start && a.due < end);
}

export function openPreviewReminders() {
  const listEl = document.getElementById("reminderList");
  const summaryEl = document.getElementById("reminderSummary");
  const items = [];

  for (const route of state.routes.filter(r => r.active !== false)) {
    const policy = (typeof route.policy === "string") ? JSON.parse(route.policy) : route.policy;
    const when = policy?.when || "DUE_TOMORROW";
    const matches = selectAssignments(when);

    if (!matches.length) continue;

    const tmpl = findTemplate(route.templateId) || state.templates[0];
    for (const a of matches) {
      const ctx = buildContext(a);
      const subject = tmpl.subject ? hb(tmpl.subject, ctx) : null;
      const body = hb(tmpl.body, ctx);
      items.push({
        channel: route.channel,
        destination: route.destination,
        subject,
        body
      });
    }
  }

  if (!items.length) {
    listEl.innerHTML = `<div class="muted">No reminders to send for the current policies.</div>`;
    summaryEl.textContent = "";
  } else {
    summaryEl.textContent = `${items.length} message${items.length!==1?"s":""} generated.`;
    listEl.innerHTML = items.map((m, idx) => `
      <div class="reminder-item">
        <div class="reminder-head">
          <div><span class="chip">${m.channel}</span> → <b>${m.destination}</b></div>
          ${m.subject ? `<span class="chip">Subject</span>` : ``}
        </div>
        ${m.subject ? `<div class="codebox">${m.subject}</div>` : ``}
        <div class="codebox">${m.body}</div>
        <div class="toolbar end" style="margin-top:6px">
          <button class="btn copy-btn" data-copy="${idx}">Copy</button>
        </div>
      </div>
    `).join("");

    // single-item copy buttons
    listEl.querySelectorAll("[data-copy]").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-copy"));
        const nodes = listEl.querySelectorAll(".reminder-item");
        const node = nodes[idx];
        const subject = node.querySelectorAll(".codebox")[0]?.innerText;
        const body = node.querySelectorAll(".codebox")[subject ? 1 : 0]?.innerText;
        const text = subject ? (`${subject}\n\n${body}`) : body;
        navigator.clipboard.writeText(text || "");
      });
    });
  }

  document.getElementById("reminderModal").showModal();
}

export function copyAllReminders() {
  const boxes = document.querySelectorAll("#reminderList .codebox");
  const text = Array.from(boxes).map(b => b.innerText).join("\n\n---\n\n");
  navigator.clipboard.writeText(text || "");
}
