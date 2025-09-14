// api/saveAssignments.js
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const { password, assignments } = req.body || {};
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ ok: false, error: "Invalid password" });
  }
  if (!Array.isArray(assignments)) {
    return res.status(400).json({ ok: false, error: "Assignments must be an array" });
  }

  try {
    const filePath = path.join(process.cwd(), "data", "assignments.json");
    fs.writeFileSync(filePath, JSON.stringify(assignments, null, 2), "utf-8");
    return res.status(200).json({ ok: true, saved: assignments.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
