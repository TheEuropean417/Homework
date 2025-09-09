const { google } = require("googleapis");
const http = require("http");
const open = require("open");

// ── 1) Set these via env or paste temporarily
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "PASTE_CLIENT_ID";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "PASTE_CLIENT_SECRET";
const REDIRECT_URI = "http://127.0.0.1:5555/callback";

// Scopes: read courses + YOUR coursework
const SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly"
];

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.log("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars (or paste into script).");
    process.exit(1);
  }

  const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES
  });

  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith("/callback")) {
      const qs = new URL(req.url, REDIRECT_URI).searchParams;
      const code = qs.get("code");
      try {
        const { tokens } = await oAuth2Client.getToken(code);
        res.end("Success! You can close this tab.");
        server.close();
        console.log("\n=== COPY THIS REFRESH TOKEN INTO VERCEL ENV ===");
        console.log("GOOGLE_REFRESH_TOKEN=" + tokens.refresh_token + "\n");
        process.exit(0);
      } catch (e) {
        res.statusCode = 500;
        res.end("Error getting token.");
        server.close();
        console.error(e);
        process.exit(1);
      }
    } else {
      res.end("Waiting for Google OAuth callback…");
    }
  }).listen(5555, () => {
    console.log("Listening on " + REDIRECT_URI);
    console.log("Opening browser for Google consent…");
    open(authUrl);
  });
}

main();
