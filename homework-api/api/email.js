// /api/email.js
import nodemailer from "nodemailer"; // or your email provider SDK

const ALLOWED_ORIGINS = [
  "https://theeuropean417.github.io",
  // add any others you need (dev localhost, etc.)
];

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  // Always set CORS headers
  const headers = corsHeaders(origin);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { password, messages } = req.body || {};
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, error: "No messages" });
    }

    // Example Nodemailer (configure transport via env)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const results = [];
    for (const m of messages) {
      if (!m.to || !m.subject || !m.body) continue;
      /* eslint-disable no-await-in-loop */
      const info = await transporter.sendMail({
        from: process.env.MAIL_FROM, // e.g. "Homework <no-reply@yourdomain.com>"
        to: m.to,
        subject: m.subject,
        text: m.body,
        html: `<pre style="font:14px/1.4 system-ui,Segoe UI,Roboto">${m.body}</pre>`,
      });
      results.push({ id: info.messageId, to: m.to });
    }

    return res.status(200).json({ ok: true, sent: results.length, results });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
