// homework-api/api/email.js
// Send plain email via SMTP. Use env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, [SMTP_FROM], [SMTP_SECURE=true|false]
const nodemailer = require("nodemailer");

const ALLOW_ORIGINS = [
  "https://theeuropean417.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

function setCors(res, origin) {
  if (ALLOW_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  setCors(res, req.headers.origin || "");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });

  try {
    if (typeof req.body === "string") { try { req.body = JSON.parse(req.body); } catch {} }
    const { password, messages } = req.body || {};
    if (password !== "241224") return res.status(403).json({ ok:false, error:"Forbidden" });

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user;
    const secure = String(process.env.SMTP_SECURE || "").toLowerCase()==="true" || port===465;

    if (!host || !port || !user || !pass) {
      return res.status(500).json({ ok:false, error:"SMTP not configured" });
    }
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ ok:false, error:"No messages" });
    }

    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
    try { await transporter.verify(); } catch (e) {
      return res.status(500).json({ ok:false, error:`SMTP verify failed: ${e.message || e}` });
    }

    const results = [];
    for (const m of messages) {
      const to = (m.to || "").trim();
      const subject = (m.subject || "").trim() || "Homework Notification";
      const text = String(m.text || m.body || "").slice(0, 4000);
      const html = m.html ? String(m.html) : undefined;
      if (!to || (!text && !html)) { results.push({ to, ok:false, error:"Missing to or body" }); continue; }

      /* eslint-disable no-await-in-loop */
      const info = await transporter.sendMail({ from, to, subject, text, html });
      results.push({ ok:true, to, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected });
    }
    const sent = results.filter(r=>r.ok).length;
    return res.status(200).json({ ok:true, sent, results });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
};
