// homework-api/api/sms.js
// Email→SMS for AT&T with immediate send, connection verify, and MMS fallback.
// Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, [SMTP_FROM], [SMTP_SECURE], [SMS_GATEWAY_DOMAIN]
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

function trimForSms(s) {
  // Keep it short for SMS gateways; many clip around 140–160.
  // We'll also provide an MMS fallback which tolerates longer text.
  const body = String(s || "");
  return body.length <= 160 ? body : body.slice(0, 160);
}

module.exports = async function handler(req, res) {
  setCors(res, req.headers.origin || "");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });

  try {
    // Parse JSON if needed
    if (typeof req.body === "string") {
      try { req.body = JSON.parse(req.body); } catch { /* ignore */ }
    }
    const { password, messages } = req.body || {};
    if (password !== "241224") return res.status(403).json({ ok:false, error:"Forbidden" });
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ ok:false, error:"No messages" });
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user;
    const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
    const smsDomain = process.env.SMS_GATEWAY_DOMAIN || "txt.att.net"; // primary
    const mmsDomain = "mms.att.net"; // fallback

    if (!host || !port || !user || !pass) {
      return res.status(500).json({ ok:false, error:"SMTP not configured" });
    }

    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

    // Verify SMTP immediately so failures show fast
    try { await transporter.verify(); } catch (e) {
      return res.status(500).json({ ok:false, error:`SMTP verify failed: ${e.message || e}` });
    }

    const results = [];
    for (const m of messages) {
      const ten = normalizeUS10Digits(m.to);
      const rawBody = String(m.body || "");
      if (!ten || !rawBody) {
        results.push({ to: m.to, ok:false, error:"Invalid phone or empty body" });
        continue;
      }

      // 1) Try SMS domain (short body)
      const smsBody = trimForSms(rawBody);
      let sent = false, info = null, lastErr = null;

      const trySend = async (toEmail, body) => {
        const mailOptions = {
          from,
          to: toEmail,
          subject: " ", // many gateways ignore subject; keep minimal
          text: body
        };
        return transporter.sendMail(mailOptions);
      };

      try {
        info = await trySend(`${ten}@${smsDomain}`, smsBody);
        sent = true;
        results.push({ to: `${ten}@${smsDomain}`, ok:true, messageId: info.messageId, via:"sms" });
      } catch (e1) {
        lastErr = e1;
        // 2) Fallback to MMS domain with full body if SMS failed
        try {
          info = await trySend(`${ten}@${mmsDomain}`, rawBody);
          sent = true;
          results.push({ to: `${ten}@${mmsDomain}`, ok:true, messageId: info.messageId, via:"mms", smsError: String(e1.message || e1) });
        } catch (e2) {
          results.push({ to: m.to, ok:false, error:`SMS and MMS failed: sms=${String(e1.message||e1)}; mms=${String(e2.message||e2)}` });
        }
      }
    }

    const sentCount = results.filter(r => r.ok).length;
    return res.status(200).json({ ok:true, sent: sentCount, results });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
};
