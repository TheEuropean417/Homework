/* Generate a Google OAuth refresh token for Classroom (works on Windows/macOS/Linux)
   - Reads CLIENT ID/SECRET from env (or .env if you installed dotenv)
   - Spins up http://127.0.0.1:5555/callback to receive the code
   - Opens your default browser; also prints the URL in case auto-open fails
*/
const { google } = require("googleapis");
const http = require("http");

// Optional: load .env if present
try { require("dotenv").config(); } catch {}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const REDIRECT_URI = "http://127.0.0.1:5555/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly"
];

function assert(v, msg){ if(!v){ console.error(msg); process.exit(1); } }

// `open` is ESM-only; use a dynamic import so this CommonJS file can use it.
async function openInBrowser(url){
  try {
    const mod = await import('open');
    await mod.default(url);
  } catch {
    console.log("\nIf your browser didn't open automatically, copy/paste this URL into Chrome/Edge:\n" + url + "\n");
  }
}

(async function main() {
  assert(CLIENT_ID, "Missing GOOGLE_CLIENT_ID");
  assert(CLIENT_SECRET, "Missing GOOGLE_CLIENT_SECRET");

  const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES
  });

  const server = http.createServer(async (req, res) => {
    if (!req.url.startsWith("/callback")) {
      res.end("Waiting for Google OAuth callback…"); return;
    }
    try {
      const qs = new URL(req.url, REDIRECT_URI).searchParams;
      const code = qs.get("code");
      const error = qs.get("error");
      if (error) throw new Error("OAuth error: " + error);
      if (!code) throw new Error("Missing ?code");

      const { tokens } = await oAuth2Client.getToken(code);
      res.end("Success! You can close this tab."); server.close();

      if (!tokens.refresh_token) {
        console.error(`
No refresh_token returned.

Fixes:
- On the OAuth consent screen, PUBLISH the app or add this account as a Test user.
- Revoke previous access at https://myaccount.google.com/permissions then try again.
- Ensure we use prompt=consent (we do) and access_type=offline (we do).
`);
        process.exit(1);
      }

      console.log("\n=== COPY THIS INTO VERCEL ENV ===");
      console.log("GOOGLE_REFRESH_TOKEN=" + tokens.refresh_token + "\n");
      process.exit(0);
    } catch (e) {
      res.statusCode = 500; res.end("Error during token exchange");
      server.close(); console.error(e); process.exit(1);
    }
  });

  server.listen(5555, "127.0.0.1", async () => {
    console.log("Listening on " + REDIRECT_URI);
    console.log("Opening browser for Google consent…");
    await openInBrowser(authUrl);
  });
})();
