import { state } from "./state.js";

async function fetchJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + " not found");
  return r.json();
}

export async function loadData() {
  // Try student.json, then students.json (some commits used plural)
  let student;
  try { student = await fetchJSON("data/student.json"); }
  catch { student = await fetchJSON("data/students.json"); }

  const [coursesData, assignmentsData] = await Promise.all([
    fetchJSON("data/courses.json"),
    fetchJSON("data/assignments.json")
  ]);

  state.students = [student];
  state.courses = coursesData;
  state.assignments = assignmentsData.map(a => ({
    ...a,
    student: student.name,
    due: a.dueDate ? new Date(a.dueDate) : null
  }));
}
