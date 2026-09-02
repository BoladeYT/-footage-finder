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

// A "-latest" name is an alias: Google keeps it pointed at a current model, so
// the tool keeps working even when a specific version is retired (a pinned name
// like "gemini-2.5-flash" eventually returns 404 and breaks everything).
//
// We use the LITE alias on purpose. Measured 2026-09-02 with the real prompts
// from app.jsx, on real narration scripts of 791 / 1,582 / 2,373 words:
//   gemini-flash-lite-latest  4-11s to split a script, 1.1-1.5s per keyword batch
//   gemini-3.1-flash-lite     10-18s          (5x slower, vaguer keywords)
//   gemini-3.6-flash          503 "high demand" after 52s   (unusable)
//   gemini-flash-latest       NO REPLY AT ALL after 120s    (this is what was
//                             deployed, and it is why a 54-second job ran past
//                             8 minutes: every call hung, then retried)
// The lite model was also the BEST at this job, not just the fastest — richer,
// more cinematic queries with framing words. Big models "think" before
// answering, which is wasted effort for writing a six-word search phrase.
// It also never truncated: the longest script above produced 261 scenes using
// 3,531 of the 8,192 output tokens, and gave the identical answer every time.
const MODEL = "gemini-flash-lite-latest";

// If Google has not answered in this long, stop waiting, return 503, and let the
// browser retry. Without this a model that hangs forever holds the whole run
// hostage — which is exactly what the old model did.
//
// 45s, not the 25s first tried here. Measured over twelve whole-script splits:
// ten came back in 3-11s, but TWO stalled at 28s and 34s. That is Google's own
// queueing, not script length — the 34s stall was on the SHORTEST script. A 25s
// limit therefore killed roughly one call in six that was going to succeed,
// costing a pointless 25s wait plus a retry. 45s still separates "slow today"
// from "dead" (the broken model gave nothing at all after 120s), and leaves
// room under Vercel's 60s ceiling to return the error properly.
const UPSTREAM_TIMEOUT_MS = 45000;

// Vercel cuts a serverless function off after ~10s by default. Raising it gives
// the timeout above room to fire and return a clean error instead of the
// function being killed mid-flight. 60s is the max the Hobby (free) plan allows.
export const maxDuration = 60;

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
    // (429/503) or a timeout. Any other status is a real error, so stop and report it.
    let last = { status: 500, raw: "No Gemini keys configured" };
    for (let i = 0; i < keys.length; i++) {
      let upstream;
      try {
        upstream = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": keys[i] },
            body,
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          }
        );
      } catch (e) {
        // Timed out or the connection failed. Report it as 503 so the browser
        // treats it as temporary and retries, rather than killing the scene.
        last = { status: 503, raw: "Gemini did not answer within " + UPSTREAM_TIMEOUT_MS + "ms" };
        continue; // try the next key, if there is one
      }
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
    // keyCount tells the browser HOW MANY keys we hold (never the keys) so it can
    // pace its calls: 3 keys means it can go faster, 1 key means it must go gentler.
    res.status(200).json({ content: [{ type: "text", text }], keyCount: keys.length });
  } catch (err) {
    res.status(502).json({ error: "Relay failed", detail: String(err).slice(0, 300) });
  }
}
