import { state } from "./state.js";

function isSameDay(a, b) {
  if (!a || !b) return false;
  return a.toDateString() === b.toDateString();
}

export function refreshStats() {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(todayStart.getDate() + 1);

  const dueToday    = state.assignments.filter(a => a.due && isSameDay(a.due, todayStart)).length;
  const dueTomorrow = state.assignments.filter(a => a.due && isSameDay(a.due, tomorrowStart)).length;
  const upcoming    = state.assignments.filter(a => a.due && a.due > tomorrowStart && (a.due - now) <= 7*24*3600e3).length;
  const late        = state.assignments.filter(a => a.due && a.due < now).length;

  const set = (id, v) => (document.getElementById(id).textContent = String(v));
  set("statDueToday",    dueToday);
  set("statDueTomorrow", dueTomorrow);
  set("statUpcoming",    upcoming);
  set("statLate",        late);

  document.getElementById("statDueTodayHint").textContent    = dueToday    ? "Time-block the evening" : "All clear";
  document.getElementById("statDueTomorrowHint").textContent = dueTomorrow ? "Prep materials tonight" : "No rush";
  document.getElementById("statUpcomingHint").textContent    = upcoming    ? "Plan the week" : "Light week ahead";
  document.getElementById("statLateHint").textContent        = late        ? "Resolve ASAP" : "On track";
}
