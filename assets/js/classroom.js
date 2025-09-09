// homework-api/api/classroom.js
// Classroom fetch with CORS + student submission states (TURNED_IN, RETURNED, etc.) and 'late'.
// If googleapis/env are missing, returns { assignments: [] } so UI stays up.

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
    res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGINS[0]);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function toIsoWithOffset(d) {
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
  if (req.method !== "GET") return res.status(405).json({ ok:false, error:"Method not allowed" });

  // try to require here so module load never crashes
  let googlePkg = null;
  try { googlePkg = require("googleapis"); } catch { /* keep null */ }

  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN
  } = process.env;

  if (!googlePkg || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    return res.status(200).json({ assignments: [], note: "Google not configured; returning empty list." });
  }

  try {
    const { google } = googlePkg;
    const oAuth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    oAuth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    const classroom = google.classroom({ version: "v1", auth: oAuth2Client });

    // 1) ACTIVE courses
    let courses = [];
    let pageTokenC;
    do {
      const r = await classroom.courses.list({ courseStates: ["ACTIVE"], pageToken: pageTokenC, pageSize: 100 });
      courses = courses.concat(r.data.courses || []);
      pageTokenC = r.data.nextPageToken;
    } while (pageTokenC);

    const assignments = [];

    for (const c of courses) {
      // 2) CourseWork (published only)
      let works = [];
      let pageTokenW;
      do {
        const r = await classroom.courses.courseWork.list({
          courseId: c.id, pageToken: pageTokenW, pageSize: 100
        });
        const all = r.data.courseWork || [];
        works = works.concat(all.filter(w => w.state === "PUBLISHED")); // ignore DRAFT/DELETED
        pageTokenW = r.data.nextPageToken;
      } while (pageTokenW);

      // 3) Student submissions for the *current user* across all work in this course
      //    (use courseWorkId "-" + userId="me" to batch list)
      const subMap = new Map(); // courseWorkId -> StudentSubmission
      let pageTokenS;
      do {
        const r = await classroom.courses.courseWork.studentSubmissions.list({
          courseId: c.id,
          courseWorkId: "-",
          userId: "me",
          pageToken: pageTokenS,
          pageSize: 200
        });
        for (const s of (r.data.studentSubmissions || [])) {
          subMap.set(String(s.courseWorkId), s);
        }
        pageTokenS = r.data.nextPageToken;
      } while (pageTokenS);

      // 4) Normalize
      for (const w of works) {
        // due date/time
        let dueISO = null;
        if (w.dueDate) {
          const d = w.dueDate;
          const t = w.dueTime || {};
          const local = new Date(d.year, (d.month - 1), d.day, t.hours || 0, t.minutes || 0, 0, 0);
          dueISO = toIsoWithOffset(local);
        }
        // submission state (if present)
        const sub = subMap.get(String(w.id));
        const submissionState = sub?.state || null; // NEW | CREATED | TURNED_IN | RETURNED | RECLAIMED_BY_STUDENT
        const late = sub?.late === true;

        assignments.push({
          id: String(w.id),
          courseId: String(c.id),
          courseName: c.name || "",
          title: w.title || "",
          description: w.description || "",
          dueDateISO: dueISO,
          submissionState, // raw Classroom state for accuracy
          late,
          status: "UNKNOWN" // UI will compute LATE/TODAY/etc, but we keep raw submissionState too
        });
      }
    }

    return res.status(200).json({ assignments });
  } catch (err) {
    return res.status(200).json({ assignments: [], error: String(err && err.message || err) });
  }
};
