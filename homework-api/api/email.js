// homework-api/api/email.js
import nodemailer from "nodemailer";

const ALLOWED_ORIGINS = [
  "https://theeuropean417.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin || "") ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

export default async function handler(req, res) {
  const headers = corsHeaders(req.headers.origin);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ ok:false, error:"Method not allowed" });

  try {
    const { password, messages } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) return res.status(403).json({ ok:false, error:"Forbidden" });
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ ok:false, error:"No messages" });

    const host = process.env.SMTP_HOST, port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER, pass = process.env.SMTP_PASS, from = process.env.MAIL_FROM || user;
    if (!host || !port || !user || !pass || !from) return res.status(500).json({ ok:false, error:"SMTP not configured" });

    const transporter = nodemailer.createTransport({
      host, port, secure: String(process.env.SMTP_SECURE||"").toLowerCase()==="true" || port===465,
      auth: { user, pass }
    });

    const results = [];
    for (const m of messages) {
      const to = m?.to;
      const subject = m?.subject || "Homework notice";
      const body = (m?.body ?? m?.text ?? "").toString();  // <-- accept body OR text
      const html  = m?.html || `<pre style="font:14px/1.4 system-ui,Segoe UI,Roboto">${body}</pre>`;
      if (!to || !subject || !body) continue;

      /* eslint-disable no-await-in-loop */
      const info = await transporter.sendMail({ from, to, subject, text: body, html });
      results.push({ id: info.messageId, to });
    }

    return res.status(200).json({ ok:true, sent: results.length, results });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
}
