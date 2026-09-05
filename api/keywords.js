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
//
// SPARE NAMES. Even an alias can be withdrawn one day, and when it is, Google
// answers 404 and every single call fails — the tool is dead until this file is
// edited by hand. So we keep spares and move down the list on a 404. Order is
// deliberate: the best one first, then the only two others measured above that
// actually ANSWERED. A 404 comes back instantly, so walking the whole list costs
// about a second and can never push us past Vercel's time limit.
//
// Be clear about what this does NOT rescue: a model that still exists but stops
// answering (what gemini-flash-latest did). Waiting on one of those already eats
// 45 of our 60 seconds, so there is no room to try a second name in the same
// request. That case still needs a new version of this file.
const MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
];

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

// Hard stop for the whole request, kept a safe margin under maxDuration. At 60s
// Vercel kills the function WITHOUT letting it reply, so the browser would get
// nothing readable at all — worse than an error it can act on. Every attempt
// checks this clock first and shortens its own wait to fit what is left.
const BUDGET_MS = 50000;

// The relay can hold up to 3 Gemini keys: GEMINI_KEY (main) plus optional
// GEMINI_KEY2 / GEMINI_KEY3 from SEPARATE free Google accounts. Set them in the
// Vercel dashboard (Settings → Environment Variables). We rotate to the next key
// only when one is rate-limited, tripling the free-tier headroom for long scripts.
function geminiKeys() {
  return ["GEMINI_KEY", "GEMINI_KEY2", "GEMINI_KEY3"]
    .map((n) => process.env[n])
    .filter(Boolean);
}

// One model name, tried against each key in turn. Returns the moment it has an
// answer worth reporting. Kept as its own function so "give up on this name and
// try the next one" is a plain return instead of a jump out of two nested loops.
async function askGemini(model, keys, body, deadline) {
  let last = { status: 503, raw: "Gemini was not asked" };
  for (let i = 0; i < keys.length; i++) {
    // Only start an attempt if there is enough time left for it to mean anything.
    const left = deadline - Date.now();
    if (left < 4000) return last;
    let upstream;
    try {
      upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": keys[i] },
          body,
          signal: AbortSignal.timeout(Math.min(UPSTREAM_TIMEOUT_MS, left)),
        }
      );
    } catch (e) {
      // Timed out or the connection failed. Report it as 503 so the browser
      // treats it as temporary and retries, rather than killing the scene.
      last = { status: 503, raw: "Gemini did not answer in time" };
      continue; // try the next key, if there is one
    }
    const raw = await upstream.text();
    if (upstream.ok) return { status: 200, raw, model };
    last = { status: upstream.status, raw };
    // 404 means this NAME is wrong or withdrawn. Every key would be told the same
    // thing, so stop spending them and let the caller try the next name.
    if (upstream.status === 404) return { ...last, modelGone: true };
    // 429 and 503 mean busy — another key may still have room. Anything else is
    // a real fault and is worth reporting straight away.
    if (upstream.status !== 429 && upstream.status !== 503) return last;
  }
  return last;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const keys = geminiKeys();
  if (!keys.length) {
    // 403, not 500. The browser retries a 500 five times over half a minute
    // before showing anything, and no amount of retrying conjures up a key. 403
    // fails straight away with a message that names the actual fix.
    res.status(403).json({ error: "Server missing GEMINI_KEY. Set it in Vercel settings." });
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
    // Walk the spare names. In the normal case this loop runs exactly once.
    const deadline = Date.now() + BUDGET_MS;
    let last = { status: 502, raw: "No attempt was made" };
    for (const model of MODELS) {
      last = await askGemini(model, keys, body, deadline);
      if (last.status === 200) break;
      // A withdrawn name is the ONLY reason to try a different one. Busy, slow or
      // broken would go the same way further down the list, and we have no time
      // to spare proving it.
      if (!last.modelGone) break;
    }

    if (last.status !== 200) {
      // 404 from Gemini means the model name is gone. Report that as 410 ("gone")
      // instead, so the browser can tell it apart from the OTHER thing that
      // answers 404 here — this file not being uploaded at all. One needs a new
      // version of the tool; the other needs the api folder put on GitHub. Very
      // different fixes, so they must not share a status code.
      const status = last.modelGone ? 410 : last.status;
      res.status(status).json({ error: "Upstream error", detail: String(last.raw).slice(0, 500) });
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
    // model is only there so you can see which name actually answered, in case the
    // tool has quietly fallen back to a spare.
    res.status(200).json({ content: [{ type: "text", text }], keyCount: keys.length, model: last.model });
  } catch (err) {
    res.status(502).json({ error: "Relay failed", detail: String(err).slice(0, 300) });
  }
}
