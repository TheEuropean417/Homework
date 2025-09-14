// /api/saveAssignments.js
// Commits data/assignments.json to your GitHub repo using the Contents API.

export default async function handler(req, res) {
  try {
    // --- CORS (allow your GitHub Pages origin) ---
    const ORIGINS = [
      "https://theeuropean417.github.io", // GH Pages
      "http://localhost:5500",            // dev (optional)
      "http://127.0.0.1:5500"             // dev (optional)
    ];
    const origin = req.headers.origin || "";
    const allow = ORIGINS.includes(origin) ? origin : ORIGINS[0];
    res.setHeader("Access-Control-Allow-Origin", allow);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(200).end();

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    // --- Auth / payload ---
    const {
      password,
      assignments
    } = req.body || {};

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    if (!Array.isArray(assignments)) {
      return res.status(400).json({ ok: false, error: "assignments must be an array" });
    }

    // --- GitHub target ---
    const GH_TOKEN  = process.env.GH_TOKEN;   // classic fine; scope: repo
    const GH_OWNER  = process.env.GH_OWNER;   // e.g. "TheEuropean417"
    const GH_REPO   = process.env.GH_REPO;    // e.g. "Homework"
    const GH_BRANCH = process.env.GH_BRANCH || "main";
    const FILEPATH  = "data/assignments.json";

    if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
      return res.status(500).json({ ok: false, error: "Server not configured" });
    }

    // 1) GET to read current sha
    const base = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(FILEPATH)}`;
    const getUrl = `${base}?ref=${encodeURIComponent(GH_BRANCH)}`;
    const ghHeaders = {
      "Authorization": `Bearer ${GH_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json"
    };
    const cur = await fetch(getUrl, { headers: ghHeaders });
    const curJson = await cur.json().catch(()=> ({}));
    const sha = cur.ok ? curJson.sha : undefined;

    // 2) PUT new content
    const content = Buffer.from(JSON.stringify(assignments, null, 2), "utf8").toString("base64");
    const putRsp = await fetch(base, {
      method: "PUT",
      headers: ghHeaders,
      body: JSON.stringify({
        message: "Homework: sync assignments.json from UI bypass update",
        content,
        sha,                 // include when file exists
        branch: GH_BRANCH
      })
    });
    const putJson = await putRsp.json().catch(()=> ({}));
    if (!putRsp.ok) {
      return res.status(500).json({ ok: false, error: putJson.message || "GitHub PUT failed" });
    }

    return res.status(200).json({ ok: true, saved: assignments.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
