/**
 * One-time Google OAuth setup script.
 * Run this on the host machine (not inside Docker).
 *
 * Usage:
 *   node --require tsx/cjs host/scripts/google-auth.ts ~/Downloads/client_secret_*.json
 *
 * Prerequisites: add http://127.0.0.1:9004 as an authorized redirect URI
 * in Google Cloud Console → APIs & Services → Credentials → your OAuth client.
 */

import { readFileSync, writeFileSync } from "fs";
import { createServer } from "http";
import https from "https";
import path from "path";
import { HttpsProxyAgent } from "https-proxy-agent";

// Load HTTPS_PROXY from .env if not already set
if (!process.env.HTTPS_PROXY) {
  try {
    const env = readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
    const match = env.match(/^HTTPS_PROXY=(.+)$/m);
    if (match) process.env.HTTPS_PROXY = match[1].trim();
  } catch {
    // no .env, that's fine
  }
}

if (process.env.HTTPS_PROXY) {
  console.log(`Using proxy: ${process.env.HTTPS_PROXY}`);
}

interface GoogleCredentials {
  client_id: string;
  client_secret: string;
}

interface CredentialsFile {
  installed?: GoogleCredentials;
  web?: GoogleCredentials;
}

interface TokenResponse {
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

const jsonArg = process.argv[2];
if (!jsonArg) {
  console.error(
    "Usage: node --require tsx/cjs host/scripts/google-auth.ts ~/Downloads/client_secret_*.json",
  );
  process.exit(1);
}

let raw: CredentialsFile;
try {
  raw = JSON.parse(readFileSync(jsonArg, "utf8")) as CredentialsFile;
} catch {
  console.error(`Error: could not read/parse "${jsonArg}"`);
  process.exit(1);
}

const creds = raw.installed ?? raw.web;
if (!creds?.client_id || !creds?.client_secret) {
  console.error("Error: JSON does not contain client_id / client_secret.");
  process.exit(1);
}

const CLIENT_ID = creds.client_id;
const CLIENT_SECRET = creds.client_secret;
const PORT = 9004;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

const params = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: SCOPES.join(" "),
  access_type: "offline",
  prompt: "consent",
});

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

console.log("\n=== Google OAuth Setup ===\n");
console.log("Open this URL in your browser:\n");
console.log(`   ${authUrl}\n`);
console.log("Waiting for authorization (listening on port 9004)...\n");

void (async () => {
  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:${PORT}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.end(`<h2>Error: ${error}</h2><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (code) {
        res.end(
          "<h2>Authorization successful!</h2><p>You can close this tab and return to the terminal.</p>",
        );
        server.close();
        resolve(code);
      }
    });

    server.listen(PORT, "127.0.0.1");
    server.on("error", reject);
  });

  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  }).toString();

  const agent = process.env.HTTPS_PROXY ? new HttpsProxyAgent(process.env.HTTPS_PROXY) : undefined;

  const data = await new Promise<TokenResponse>((resolve, reject) => {
    const req = https.request(
      {
        hostname: "oauth2.googleapis.com",
        path: "/token",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
        agent,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk: string) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw) as TokenResponse);
          } catch {
            reject(new Error(`Invalid JSON response: ${raw}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  if (data.error) {
    console.error("\nError:", data.error, data.error_description ?? "");
    process.exit(1);
  }

  const envPath = path.resolve(__dirname, "../../.env");
  let env = "";
  try {
    env = readFileSync(envPath, "utf8");
  } catch {
    /* no .env yet */
  } // eslint-disable-line

  const set = (key: string, value: string) => {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    return re.test(env)
      ? env.replace(re, line)
      : env + (env.endsWith("\n") || !env ? "" : "\n") + line + "\n";
  };

  env = set("GOOGLE_CLIENT_ID", CLIENT_ID);
  env = set("GOOGLE_CLIENT_SECRET", CLIENT_SECRET);
  env = set("GOOGLE_REFRESH_TOKEN", data.refresh_token!);
  writeFileSync(envPath, env);

  console.log("=== Success! ===\n");
  console.log(".env updated with:");
  console.log(`  GOOGLE_CLIENT_ID=${CLIENT_ID}`);
  console.log(`  GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
  console.log(`  GOOGLE_REFRESH_TOKEN=${data.refresh_token}\n`);
  console.log("Rebuild the Docker image: docker compose build");
})();
