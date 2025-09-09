const { google } = require("googleapis");

const ALLOW_ORIGINS = [
  "https://theeuropean417.github.io",          // your GitHub Pages site
  "http://localhost:5500",                     // local testing (python -m http.server 5500)
  "http://127.0.0.1:5500"
];

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allow = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function toIsoWithOffset(d) {
  // Convert JS Date to ISO with local offset (+/-HH:MM)
  const tz = d.getTimezoneOffset();
  const sign = tz > 0 ? "-" : "+";
  const pad = n => String(Math.abs(n)).padStart(2, "0");
  const hh = pad(Math.floor(Math.abs(tz) / 60));
  const mm = pad(Math.abs(tz) % 60);
  return d.toISOString().replace("Z", `${sign}${hh}:${mm}`);
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end(); return;
  }

  try {
    const {
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REFRESH_TOKEN
    } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
      res.status(500).json({ error: "Missing Google OAuth env vars." });
      return;
    }

    // OAuth client using refresh token
    const oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
      // redirect not needed here; using refresh token
    );
    oAuth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

    const classroom = google.classroom({ version: "v1", auth: oAuth2Client });

    // 1) Courses (ACTIVE)
    let courses = [];
    let pageTokenC = undefined;
    do {
      const resp = await classroom.courses.list({
        courseStates: ["ACTIVE"],
        pageToken: pageTokenC,
        pageSize: 100
      });
      courses = courses.concat(resp.data.courses || []);
      pageTokenC = resp.data.nextPageToken;
    } while (pageTokenC);

    // 2) Coursework per course
    const assignments = [];
    for (const c of courses) {
      let pageTokenW = undefined;
      do {
        const resp = await classroom.courses.courseWork.list({
          courseId: c.id,
          pageToken: pageTokenW,
          pageSize: 100
        });
        const works = resp.data.courseWork || [];
        for (const w of works) {
          let due = null;
          if (w.dueDate) {
            const d = w.dueDate;
            const t = w.dueTime || {};
            const js = new Date(
              d.year, (d.month - 1), d.day,
              t.hours || 0, t.minutes || 0, 0, 0
            );
            due = toIsoWithOffset(js);
          }
          assignments.push({
            id: String(w.id),
            courseId: String(c.id),
            courseName: c.name || "",
            title: w.title || "",
            description: w.description || "",
            dueDate: due,
            state: w.state || "PUBLISHED"
          });
        }
        pageTokenW = resp.data.nextPageToken;
      } while (pageTokenW);
    }

    // Oldest first (null due at the end)
    assignments.sort((a, b) => {
      const ax = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bx = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      return ax - bx;
    });

    res.status(200).json({
      generatedAt: new Date().toISOString(),
      courses: courses.map(c => ({ id: String(c.id), name: c.name || "" })),
      assignments
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
};
