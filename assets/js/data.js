import { state } from "./state.js";

async function maybeLoad(path, fallback) {
  try {
    const r = await fetch(path);
    if (!r.ok) throw new Error("not found");
    return await r.json();
  } catch {
    return fallback;
  }
}

// Load JSON from /data/ and normalize
export async function loadData() {
  const [student, coursesData, assignmentsData] = await Promise.all([
    fetch("data/student.json").then(r => r.json()),
    fetch("data/courses.json").then(r => r.json()),
    fetch("data/assignments.json").then(r => r.json())
  ]);

  const templates = await maybeLoad("data/templates.json", [
    {
      id: "sms_due_tomorrow_default",
      channel: "SMS",
      name: "SMS: Due Tomorrow",
      subject: null,
      body: 'Reminder: {{student}} has "{{title}}" for {{course}} due {{dueDate}}.'
    },
    {
      id: "email_due_tomorrow_default",
      channel: "EMAIL",
      name: "Email: Due Tomorrow",
      subject: "Due tomorrow: {{title}} ({{course}})",
      body: "<p>{{student}} has <b>{{title}}</b> for <b>{{course}}</b> due {{dueDate}}</p>"
    }
  ]);

  const routes = await maybeLoad("data/routes.json", [
    // Default fallback: if none provided, build one SMS to parent's phone if present, else to email
    ...(student.phoneE164 ? [{
      id: "r1",
      studentId: "s1",
      channel: "SMS",
      destination: student.phoneE164,
      active: true,
      policy: { when: "DUE_TOMORROW", hour: 19, tz: "America/Chicago" },
      templateId: "sms_due_tomorrow_default"
    }] : []),
    ...(student.email ? [{
      id: "r2",
      studentId: "s1",
      channel: "EMAIL",
      destination: student.email,
      active: true,
      policy: { when: "DUE_TODAY", hour: 17, tz: "America/Chicago" },
      templateId: "email_due_tomorrow_default"
    }] : [])
  ]);

  state.students = [student];
  state.courses = coursesData;
  state.assignments = assignmentsData.map(a => ({
    ...a,
    student: student.name,
    due: new Date(a.dueDate)
  }));
  state.templates = templates;
  state.routes = routes;
}
