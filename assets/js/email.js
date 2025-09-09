// assets/js/email.js
import { CONFIG } from "./config.js";
import { loadRecipients } from "./state.js";

export async function sendEmailsToConfiguredRecipients({ subject, text, html }) {
  const recipients = (loadRecipients() || []).filter(r => r.email && /\S+@\S+\.\S+/.test(r.email));
  if (!recipients.length) throw new Error("No recipients with a valid email set.");

  const payload = {
    password: CONFIG.adminPassword,
    messages: recipients.map(r => ({
      to: r.email,
      subject: subject || "Homework update",
      text, html
    }))
  };

  const res = await fetch(CONFIG.emailEndpoint || CONFIG.classroomEndpoints[0].replace("/api/classroom","/api/email"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    // credentials not needed; keep CORS simple.
  });
  if (!res.ok) throw new Error(`Email API ${res.status}: ${await res.text().catch(()=>res.statusText)}`);
  return res.json();
}
