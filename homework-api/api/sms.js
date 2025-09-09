// homework-api/api/sms.js
import Twilio from "twilio";

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

export default async function handler(req, res){
  cors(res, req.headers.origin || "");
  if (req.method === "OPTIONS") return res.status(204).end();

  try{
    const { password, messages } = req.body || {};
    if(password !== "241224") return res.status(403).json({ ok:false, error:"Forbidden" });
    if(!Array.isArray(messages) || !messages.length) return res.status(400).json({ ok:false, error:"No messages" });

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if(!sid || !token || !from) return res.status(500).json({ ok:false, error:"Twilio not configured" });

    const client = Twilio(sid, token);

    const results = [];
    for(const m of messages){
      if(!m.to || !m.body) continue;
      /* eslint-disable no-await-in-loop */
      const rsp = await client.messages.create({ from, to: m.to, body: m.body });
      results.push({ sid:rsp.sid, to:m.to });
    }
    res.json({ ok:true, sent:results.length, results });
  }catch(e){
    console.error(e);
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
}
