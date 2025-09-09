// homework-api/api/classroom.js
// Classroom fetch with bulletproof CORS + "empty list" fallback so it never crashes.
// If Google env vars or googleapis are missing, returns { assignments: [] } with 200.

const ALLOW_ORIGINS = [
  "https://theeuropean417.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

function setCors(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOW_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    // default to Pages origin (helps when opening function URL directly)
    res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGINS[0]);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function toIsoWithOffset(d) {
  // Convert local date to ISO with timezone offset like 2025-09-08T10:00:00-05:00
  const tz = -d.getTimezoneOffset(); // minutes east of UTC
  const sign = tz >= 0 ? "+" : "-";
  const abs = Math.abs(tz);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return new Date(d.getTime() - tz * 60000).toISOString().replace("Z", `${sign}${hh}:${mm}`);
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  // Try to require googleapis inline so missing dep doesn't crash module load
  let googlePkg = null;
  try { googlePkg = require("googleapis"); } catch { /* keep null; fallback below */ }

  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN
  } = process.env;

  // If we can't use Google right now, return an empty list (still 200 + CORS)
  if (!googlePkg || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    return res.status(200).json({
      assignments: [],
      note: "Google not configured (or googleapis not installed). Returning empty list."
    });
  }

  try {
    const { google } = googlePkg;

    const oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    );
    oAuth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

    const classroom = google.classroom({ version: "v1", auth: oAuth2Client });

    // 1) Fetch ACTIVE courses
    let courses = [];
    let pageTokenC = undefined;
    do {
      const r = await classroom.courses.list({
        courseStates: ["ACTIVE"],
        pageToken: pageTokenC,
        pageSize: 100
      });
      courses = courses.concat(r.data.courses || []);
      pageTokenC = r.data.nextPageToken;
    } while (pageTokenC);

    // 2) Fetch coursework for each course
    const assignments = [];
    for (const c of courses) {
      let pageTokenW = undefined;
      do {
        const r = await classroom.courses.courseWork.list({
          courseId: c.id,
          pageToken: pageTokenW,
          pageSize: 100
        });
        const works = r.data.courseWork || [];
        for (const w of works) {
          let dueISO = null;
          if (w.dueDate) {
            const d = w.dueDate;            // {year,month,day}
            const t = w.dueTime || {};      // {hours,minutes}
            const local = new Date(d.year, (d.month - 1), d.day, t.hours || 0, t.minutes || 0, 0, 0);
            dueISO = toIsoWithOffset(local);
          }
          assignments.push({
            id: String(w.id),
            courseId: String(c.id),
            course: c.name || "",
            title: w.title || "",
            notes: w.description || "",
            dueDateISO: dueISO,
            status: w.state === "PUBLISHED" ? "DUE" : (w.state || "UNKNOWN")
          });
        }
        pageTokenW = r.data.nextPageToken;
      } while (pageTokenW);
    }

    return res.status(200).json({ assignments });
  } catch (err) {
    // Keep CORS; don't crash
    return res.status(200).json({ assignments: [], error: String(err && err.message || err) });
  }
};
