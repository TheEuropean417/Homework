// assets/js/email.js
import { CONFIG } from "./config.js";
import { loadRecipients } from "./state.js";

function validEmail(s){ return /\S+@\S+\.\S+/.test(s||""); }

export async function sendEmailsToConfiguredRecipients({ subject, text, html }) {
  const recipients = (loadRecipients() || []).filter(r => validEmail(r.email));
  if (!recipients.length) throw new Error("No recipients with a valid email set.");

  // Many email APIs expect a plain-text body; we send both for compatibility.
  const bodyText = (text || "").trim() || (html ? html.replace(/<[^>]+>/g," ").trim() : "");

  const payload = {
    password: CONFIG.adminPassword,
    messages: recipients.map(r => ({
      to: r.email,
      subject: (subject || "Homework — Test Notification").trim(),
      // Provide all three fields for maximum compatibility
      body: bodyText,                 // <-- REQUIRED by your API
      text: bodyText,                 // good for most providers
      html: html || undefined         // optional if you pass rich content
    }))
  };

  const url = CONFIG.emailEndpoint || (CONFIG.classroomEndpoints?.[0] || "").replace("/api/classroom","/api/email");
  if (!url) throw new Error("Email endpoint URL is not configured.");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const raw = await res.text().catch(()=> "");
  let json;
  try { json = raw ? JSON.parse(raw) : {}; } catch { json = { ok:false, error: raw || res.statusText }; }

  if (!res.ok) throw new Error(`Email API ${res.status}: ${json?.error || raw || res.statusText}`);

  // If the API claims success but sent none, raise a friendly hint so we see it.
  if ((json?.sent ?? 0) === 0) {
    throw new Error("Email API returned ok but sent 0. Check server SMTP env (SMTP_HOST/PORT/USER/PASS/MAIL_FROM) and ADMIN_PASSWORD match.");
  }

  return json;
}
