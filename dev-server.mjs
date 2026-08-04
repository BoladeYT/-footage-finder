// dev-server.mjs — local preview only (not used in production).
// Serves the static files AND implements /api/keywords, so the tool behaves
// exactly like it will on Vercel. Reads your AgentRouter key from .env.local.
//
// Run with:  npm run dev    (see package.json)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

// --- load AGENTROUTER_KEY from .env.local (simple parser, no dependency) ---
let AGENTROUTER_KEY = process.env.AGENTROUTER_KEY || "";
try {
  const env = await readFile(join(__dirname, ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*AGENTROUTER_KEY\s*=\s*(.+?)\s*$/);
    if (m) AGENTROUTER_KEY = m[1].replace(/^["']|["']$/g, "");
  }
} catch {}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  // --- the relay (mirrors api/keywords.js) ---
  if (req.url === "/api/keywords") {
    if (req.method !== "POST") { res.writeHead(405); res.end("Use POST"); return; }
    if (!AGENTROUTER_KEY) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing AGENTROUTER_KEY in .env.local" }));
      return;
    }
    try {
      const { prompt } = JSON.parse((await readBody(req)) || "{}");
      const upstream = await fetch("https://agentrouter.org/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": AGENTROUTER_KEY,
          "authorization": "Bearer " + AGENTROUTER_KEY,
          "anthropic-version": "2023-06-01",
          "user-agent": "claude-cli/1.0.0 (external, cli)",
          "x-app": "cli",
        },
        body: JSON.stringify({
          model: "claude-opus-4-8",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const text = await upstream.text();
      console.log(`[relay] AgentRouter responded ${upstream.status}`);
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(text);
    } catch (err) {
      console.error("[relay] failed:", err);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Relay failed", detail: String(err) }));
    }
    return;
  }

  // --- static files ---
  let path = req.url.split("?")[0];
  if (path === "/") path = "/index.html";
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, "");
  const file = join(__dirname, safe);
  try {
    const buf = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`\n  Footage Finder preview running:  http://localhost:${PORT}`);
  console.log(`  AgentRouter key loaded: ${AGENTROUTER_KEY ? "yes" : "NO — add it to .env.local"}\n`);
});
