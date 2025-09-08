import { state } from "./state.js";

// Load JSON from /data/ and normalize
export async function loadData() {
  const [student, coursesData, assignmentsData] = await Promise.all([
    fetch("data/student.json").then(r => r.json()),
    fetch("data/courses.json").then(r => r.json()),
    fetch("data/assignments.json").then(r => r.json())
  ]);

  state.students = [student];
  state.courses = coursesData;
  state.assignments = assignmentsData.map(a => ({
    ...a,
    student: student.name,
    due: new Date(a.dueDate)
  }));

  // Optionally, load routes/templates later from JSON (for static site)
}
