import { state } from "./state.js";

export function refreshStats() {
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isSameDay = (a, b) => a.toDateString() === b.toDateString();

  const dueToday = state.assignments.filter(a => isSameDay(a.due, now)).length;
  const dueTomorrow = state.assignments.filter(a => isSameDay(a.due, tomorrow)).length;
  const upcoming = state.assignments.filter(a => a.due > tomorrow && a.due - now <= 7 * 24 * 3600e3).length;
  const late = state.assignments.filter(a => a.due < now).length;

  const set = (id, v) => (document.getElementById(id).textContent = String(v));

  set("statDueToday", dueToday);
  set("statDueTomorrow", dueTomorrow);
  set("statUpcoming", upcoming);
  set("statLate", late);

  document.getElementById("statDueTodayHint").textContent = dueToday ? "Time-block the evening" : "All clear";
  document.getElementById("statDueTomorrowHint").textContent = dueTomorrow ? "Prep materials tonight" : "No rush";
  document.getElementById("statUpcomingHint").textContent = upcoming ? "Plan the week" : "Light week ahead";
  document.getElementById("statLateHint").textContent = late ? "Resolve ASAP" : "On track";
}
