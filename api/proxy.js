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
// SECURITY: it will ONLY fetch from Pexels/Pixabay. Anything else is refused, so
// this can never be abused as an open proxy to fetch arbitrary URLs.

export const maxDuration = 60;

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

  try {
    const upstream = await fetch(target.toString());
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: "Upstream " + upstream.status });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Access-Control-Allow-Origin", "*");
    // Cache a fetched clip for a day so re-zipping the same picks is instant.
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).send(buf);
  } catch {
    res.status(502).json({ error: "Fetch failed" });
  }
}
