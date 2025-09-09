// homework-api/api/sms.js
// Email-to-SMS sender for AT&T via SMTP (free). Works with any SMTP account.
// Default gateway is AT&T (txt.att.net). You can override via env.

import nodemailer from "nodemailer";

const ALLOW_ORIGINS = [
  "https://theeuropean417.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

function cors(res, origin){
  if (ALLOW_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
}

// Normalize US phone like "+1 (417) 555-0123" -> "4175550123"
function normalizeUS10Digits(phone){
  if (!phone) return null;
  const digits = String(phone).replace(/\D+/g, "");
  // keep last 10 digits (strip leading 1 if present)
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export default async function handler(req, res){
  cors(res, req.headers.origin || "");
  if (req.method === "OPTIONS") return res.status(204).end();

  try{
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });

    const { password, messages } = req.body || {};
    if (password !== "241224") return res.status(403).json({ ok:false, error:"Forbidden" });
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ ok:false, error:"No messages" });

    // SMTP config from env
    const host = process.env.SMTP_HOST;         // e.g. "smtp.gmail.com"
    const port = Number(process.env.SMTP_PORT); // e.g. 465 or 587
    const user = process.env.SMTP_USER;         // e.g. your Gmail address
    const pass = process.env.SMTP_PASS;         // e.g. app password
    const from = process.env.SMTP_FROM || user; // e.g. "Homework <you@gmail.com>"
    const gateway = process.env.SMS_GATEWAY_DOMAIN || "txt.att.net"; // AT&T SMS
    const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;

    if (!host || !port || !user || !pass) {
      return res.status(500).json({ ok:false, error:"SMTP not configured" });
    }

    const transporter = nodemailer.createTransport({
      host, port, secure,
      auth: { user, pass }
    });

    const results = [];
    for (const m of messages){
      const ten = normalizeUS10Digits(m.to);
      if (!ten || !m.body) continue;

      const toEmail = `${ten}@${gateway}`;
      // many gateways ignore Subject; we keep it minimal
      const mailOptions = {
        from,
        to: toEmail,
        subject: " ",                 // keep blank/minimal for SMS gateways
        text: String(m.body || "").slice(0, 480)  // keep it short for SMS
      };

      /* eslint-disable no-await-in-loop */
      const info = await transporter.sendMail(mailOptions);
      results.push({ to: toEmail, messageId: info.messageId });
    }

    res.json({ ok:true, sent: results.length, results });
  }catch(e){
    console.error(e);
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
}
