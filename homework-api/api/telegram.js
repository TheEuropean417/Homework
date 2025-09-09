// homework-api/api/telegram.js
// POST: { password:"241224", token:"<bot>", chatId:"<id>"|["<id>",...], messages:["text", ...] }
const ALLOW_ORIGINS = [
  "https://theeuropean417.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];
function setCors(res, origin) {
  if (ALLOW_ORIGINS.includes(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary","Origin"); }
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
}
module.exports = async (req, res) => {
  setCors(res, req.headers.origin || "");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
  try {
    if (typeof req.body === "string") { try { req.body = JSON.parse(req.body); } catch {} }
    const { password, token, chatId, messages } = req.body || {};
    if (password !== "241224") return res.status(403).json({ ok:false, error:"Forbidden" });
    if (!token) return res.status(400).json({ ok:false, error:"Missing bot token" });
    const ids = Array.isArray(chatId) ? chatId : (chatId ? [chatId] : []);
    if (!ids.length) return res.status(400).json({ ok:false, error:"Missing chatId" });
    const list = Array.isArray(messages) ? messages : (messages ? [messages] : []);
    if (!list.length) return res.status(400).json({ ok:false, error:"No messages" });

    const results = [];
    for (const id of ids) {
      for (const text of list) {
        /* eslint-disable no-await-in-loop */
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({ chat_id: id, text: String(text).slice(0, 4000), disable_web_page_preview: true })
        });
        const j = await r.json().catch(()=>({}));
        results.push({ chatId: id, ok: j?.ok === true, error: j?.description, msgId: j?.result?.message_id });
      }
    }
    const sent = results.filter(r=>r.ok).length;
    return res.status(200).json({ ok:true, sent, results });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
};
