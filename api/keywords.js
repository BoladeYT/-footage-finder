// api/keywords.js  —  the "relay" (a Vercel Serverless Function)
//
// The browser calls THIS file at /api/keywords. This file runs on Vercel's
// servers (not in the browser), so it can safely hold your Google Gemini key
// and pass requests to Google's AI. Your key is never sent to the browser.
//
// Your key is read from an environment variable named GEMINI_KEY, which you set
// once in the Vercel dashboard (see README). Nothing secret lives in this file,
// so it is safe to put on GitHub.
//
// The browser expects an Anthropic-style reply: { content: [ { type, text } ] }.
// Gemini returns a different shape, so at the end we repackage Gemini's answer
// into that same shape. That way app.jsx never had to change.

// "gemini-flash-latest" is an alias that always points to Google's current
// free Flash model, so the tool keeps working even when Google retires a
// specific version (which is exactly what breaks a pinned name over time).
const MODEL = "gemini-flash-latest";

// The relay can hold up to 3 Gemini keys: GEMINI_KEY (main) plus optional
// GEMINI_KEY2 / GEMINI_KEY3 from SEPARATE free Google accounts. Set them in the
// Vercel dashboard (Settings → Environment Variables). We rotate to the next key
// only when one is rate-limited, tripling the free-tier headroom for long scripts.
function geminiKeys() {
  return ["GEMINI_KEY", "GEMINI_KEY2", "GEMINI_KEY3"]
    .map((n) => process.env[n])
    .filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const keys = geminiKeys();
  if (!keys.length) {
    res.status(500).json({ error: "Server missing GEMINI_KEY. Set it in Vercel settings." });
    return;
  }

  // The browser sends { prompt: "..." }.
  const prompt = req.body && req.body.prompt;
  if (!prompt) {
    res.status(400).json({ error: "Missing prompt" });
    return;
  }

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      // Roomy cap: newer Gemini models "think" before answering, and that
      // thinking shares the output budget. The scene-segmentation step also
      // returns the whole script as many short strings in one call. 2048
      // truncated those long lists mid-array; 8192 gives ample headroom.
      maxOutputTokens: 8192,
    },
  });

  try {
    // Try each key in order; rotate to the next ONLY on a rate-limit/overload
    // (429/503). Any other status is a real error, so stop and report it.
    let last = { status: 500, raw: "No Gemini keys configured" };
    for (let i = 0; i < keys.length; i++) {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": keys[i] },
          body,
        }
      );
      const raw = await upstream.text();
      if (upstream.ok) { last = { status: 200, raw }; break; }
      last = { status: upstream.status, raw };
      if (upstream.status !== 429 && upstream.status !== 503) break;
    }

    if (last.status !== 200) {
      res.status(last.status).json({ error: "Upstream error", detail: last.raw.slice(0, 500) });
      return;
    }

    // Pull the text out of Gemini's response shape.
    let text = "";
    try {
      const g = JSON.parse(last.raw);
      const parts = g?.candidates?.[0]?.content?.parts || [];
      text = parts.map((p) => p.text || "").join("");
    } catch (e) {
      res.status(502).json({ error: "Could not read Gemini reply", detail: last.raw.slice(0, 300) });
      return;
    }

    // Repackage into the Anthropic shape the browser already understands.
    res.status(200).json({ content: [{ type: "text", text }] });
  } catch (err) {
    res.status(502).json({ error: "Relay failed", detail: String(err).slice(0, 300) });
  }
}
