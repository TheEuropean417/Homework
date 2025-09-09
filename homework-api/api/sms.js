// homework-api/api/sms.js
// Email-to-SMS via SMTP (AT&T default). CommonJS build for maximum compatibility on Vercel.
// Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, [SMTP_FROM], [SMS_GATEWAY_DOMAIN], [SMTP_SECURE]

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

function normalizeUS10Digits(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D+/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

module.exports = async function handler(req, res) {
  // Always set CORS first so preflight never fails
  setCors(res, req.headers.origin || "");

  if (req.method === "GET") {
    // health/diagnostic
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    // Vercel usually parses JSON automatically; guard just in case
    if (typeof req.body === "string") {
      try { req.body = JSON.parse(req.body); } catch {}
    }

    const { password, messages } = req.body || {};
    if (password !== "241224") return res.status(403).json({ ok: false, error: "Forbidden" });
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, error: "No messages" });
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user;
    const gateway = process.env.SMS_GATEWAY_DOMAIN || "txt.att.net";
    const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;

    if (!host || !port || !user || !pass) {
      return res.status(500).json({ ok: false, error: "SMTP not configured" });
    }

    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

    const results = [];
    for (const m of messages) {
      const ten = normalizeUS10Digits(m.to);
      if (!ten || !m.body) continue;

      const toEmail = `${ten}@${gateway}`;
      const mailOptions = {
        from,
        to: toEmail,
        subject: " ",                               // keep blank/minimal for gateways
        text: String(m.body || "").slice(0, 480)    // keep short for SMS
      };

      // send serially to keep provider happy
      /* eslint-disable no-await-in-loop */
      const info = await transporter.sendMail(mailOptions);
      results.push({ to: toEmail, messageId: info.messageId });
    }

    return res.json({ ok: true, sent: results.length, results });
  } catch (e) {
    console.error("sms.js error:", e);
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
