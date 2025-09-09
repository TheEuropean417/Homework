// homework-api/api/telegram_getupdates.js
// Returns recent chat ids from Telegram getUpdates.
// POST: { password: "241224", token: "<bot_token>" }
// Response: { ok:true, chats:[{id, type, title, username, first_name, last_name}] }

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
    const { password, token } = req.body || {};
    if (password !== "241224") return res.status(403).json({ ok:false, error:"Forbidden" });
    if (!token) return res.status(400).json({ ok:false, error:"Missing bot token" });

    const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const j = await r.json().catch(()=>({}));
    if (!j || j.ok !== true) {
      return res.status(200).json({ ok:false, error: j?.description || "getUpdates failed" });
    }

    const seen = new Map();
    for (const u of j.result || []) {
      const msg = u.message || u.channel_post || u.edited_message || u.edited_channel_post;
      const chat = msg?.chat;
      if (!chat || !chat.id) continue;
      if (!seen.has(chat.id)) {
        seen.set(chat.id, {
          id: chat.id,
          type: chat.type,
          title: chat.title || null,
          username: msg.from?.username || null,
          first_name: msg.from?.first_name || null,
          last_name: msg.from?.last_name || null
        });
      }
    }

    return res.status(200).json({ ok:true, chats: Array.from(seen.values()) });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
};
