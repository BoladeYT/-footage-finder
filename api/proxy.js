// api/proxy.js  —  a tiny file relay (a Vercel Serverless Function)
//
// Why this exists: to bundle your selected clips into ONE .zip, the tool has to
// read each file's raw bytes in the browser. Pexels allows that directly, but
// Pixabay's servers don't send the permission header a browser needs — so the
// browser is blocked from reading Pixabay files.
//
// This file fixes that. The browser asks THIS relay for the file instead; the
// relay (running on Vercel's servers, where that browser rule doesn't apply)
// fetches it and hands it back WITH the permission header. Nothing secret is in
// here — it's safe to put on GitHub.
//
// It passes each piece of the file on the moment it arrives, instead of collecting
// the whole file first. Collecting it first meant your browser got nothing until
// Vercel had the entire clip — and Vercel refuses to send a collected reply bigger
// than 4.5 MB, so most 1080p clips simply failed here. A passed-on (streamed)
// reply has neither problem.
//
// SECURITY: it will ONLY fetch from Pexels/Pixabay. Anything else is refused, so
// this can never be abused as an open proxy to fetch arbitrary URLs.

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// How long one file may take. Now that the file flows through as it arrives, a big
// clip on a slow connection can need more than the old 60 seconds; 300 is the most
// a free (Hobby) Vercel account allows.
export const maxDuration = 300;

// Only these hosts (and their subdomains) may be fetched.
const ALLOWED = ["pixabay.com", "pexels.com"];

function hostAllowed(host) {
  host = (host || "").toLowerCase();
  return ALLOWED.some((d) => host === d || host.endsWith("." + d));
}

export default async function handler(req, res) {
  const raw = req.query && req.query.url;
  if (!raw) {
    res.status(400).json({ error: "Missing url" });
    return;
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    res.status(400).json({ error: "Bad url" });
    return;
  }

  if (target.protocol !== "https:" || !hostAllowed(target.hostname)) {
    res.status(403).json({ error: "Host not allowed" });
    return;
  }

  // If the browser hangs up (tab closed, download cancelled, gave up on a stall),
  // stop fetching from Pixabay too, rather than pulling the rest of the file for nobody.
  const ctrl = new AbortController();
  res.on("close", () => { if (!res.writableFinished) ctrl.abort(); });

  let upstream;
  try {
    upstream = await fetch(target.toString(), { signal: ctrl.signal });
  } catch {
    if (!res.headersSent && !res.destroyed) res.status(502).json({ error: "Fetch failed" });
    return;
  }
  if (!upstream.ok || !upstream.body) {
    if (upstream.body) upstream.body.cancel().catch(() => {}); // don't leave the error page half-read
    res.status(upstream.ok ? 502 : upstream.status).json({ error: "Upstream " + upstream.status });
    return;
  }

  res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
  // Pass the size on, so the browser can show a true percentage — but only when it
  // is the file's real size (a compressed reply's length isn't).
  const size = upstream.headers.get("content-length");
  if (size && !upstream.headers.get("content-encoding")) res.setHeader("Content-Length", size);
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Cache a fetched clip for a day so re-zipping the same picks is instant.
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.status(200);
  try {
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch {
    // The file broke off part-way (or the browser left). The reply has already
    // started, so the only honest signal left is to cut the connection: the
    // browser then sees an unfinished file and reports a failure, instead of
    // saving a short one as if it were complete.
    res.destroy();
  }
}
