import { state } from "./state.js";
import { fmtDate, statusBadge } from "./ui.js";

export function loadFilters() {
  // Student (single student but keep generic)
  const sSel = document.getElementById("filterStudent");
  const rStu = document.getElementById("routeStudent");
  [sSel, rStu].forEach(sel => {
    sel.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "All";
    sel.appendChild(opt);
    state.students.forEach(s => {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.name;
      sel.appendChild(o);
    });
  });

  // Courses
  const cSel = document.getElementById("filterCourse");
  cSel.innerHTML = "";
  const optc = document.createElement("option");
  optc.value = "";
  optc.textContent = "All";
  cSel.appendChild(optc);
  state.courses.forEach(c => {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name;
    cSel.appendChild(o);
  });

  // Templates
  const tSel = document.getElementById("routeTemplate");
  tSel.innerHTML = "";
  state.templates.forEach(t => {
    const o = document.createElement("option");
    o.value = t.id;
    o.textContent = t.name;
    tSel.appendChild(o);
  });
}

export function renderTable() {
  const tbody = document.getElementById("assignmentTbody");
  const search = (document.getElementById("searchBox").value || "").toLowerCase();
  const studentFilter = document.getElementById("filterStudent").value;
  const courseFilter = document.getElementById("filterCourse").value;
  const statusFilter = document.getElementById("filterStatus").value;
  const sort = document.getElementById("sortSelect").value;

  let rows = state.assignments.filter(a => {
    const text = [lookupCourseName(a.courseId), a.title, a.student].join(" ").toLowerCase();
    const okText = text.includes(search);
    const okStu = !studentFilter || state.students[0]?.id === studentFilter; // single student
    const okCrs = !courseFilter || a.courseId === courseFilter;
    const okSt = !statusFilter || a.status === statusFilter;
    return okText && okStu && okCrs && okSt;
  });

  rows.sort((x,y) => {
    if (sort === "dueAsc") return x.due - y.due;
    if (sort === "dueDesc") return y.due - x.due;
    if (sort === "courseAsc") return lookupCourseName(x.courseId).localeCompare(lookupCourseName(y.courseId));
    if (sort === "courseDesc") return lookupCourseName(y.courseId).localeCompare(lookupCourseName(x.courseId));
    return 0;
  });

  const total = rows.length;
  const start = (state.page - 1) * state.pageSize;
  const slice = rows.slice(start, start + state.pageSize);

  tbody.innerHTML = slice.map(a => `
    <tr>
      <td>${lookupCourseName(a.courseId)}</td>
      <td>${a.title}</td>
      <td>${a.student}</td>
      <td>${fmtDate(a.due)}</td>
      <td>${statusBadge(a.status)}</td>
      <td class="right">
        <button class="btn" data-action="complete" data-id="${a.id}">Complete</button>
      </td>
    </tr>
  `).join("");

  document.getElementById("tableCount").textContent = `${total} item${total !== 1 ? "s" : ""}`;
  document.getElementById("emptyState").style.display = total ? "none" : "block";
  document.getElementById("prevPage").disabled = state.page === 1;
  document.getElementById("nextPage").disabled = start + state.pageSize >= total;
}

export function lookupCourseName(courseId) {
  return state.courses.find(c => c.id === courseId)?.name || "—";
}
