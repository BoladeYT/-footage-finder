// React hooks + icons are provided as globals by index.html (loaded from a CDN).
// No build step, no npm install — the browser reads this file directly.
const { useState, useEffect, useMemo, useRef } = React;
const {
  Play, Download, ExternalLink, Shuffle, RefreshCw, Check, X,
  Film, Image: ImageIcon, Sparkles, KeyRound, ArrowRight,
  Loader2, FileText, Settings, Pencil, CheckCircle2, Circle, Trash2,
  Sun, Moon, Monitor, Smartphone, Package, Info, AlertTriangle, Plus,
} = lucideReact;

/* ------------------------------------------------------------------ */
/*  PALETTE & TYPE                                                     */
/* ------------------------------------------------------------------ */
// Two palettes with identical keys. `C` points at whichever is active; the
// theme toggle in the header swaps it. Every component reads colors through C,
// so the swap re-themes the whole app with no other changes.
const LIGHT = {
  paper: "#f5efe4",
  paperLine: "#eee5d4",
  card: "#fbf8f1",
  cardAlt: "#f1ead9",
  line: "#e4d9c4",
  ink: "#2c2a25",
  inkSoft: "#5b5346",
  muted: "#9c9078",
  brown: "#7a4d2b",
  brownHover: "#653e21",
  brownDark: "#39271a",
  green: "#3f6b47",
  greenSoft: "#4e7a4e",
  // Status accents, the one place the meaning of each is written down:
  // brown = active/primary, green = done/photo, red = error, amber = caution.
  red: "#a14b3a",
  amber: "#b8862b",
  veil: "rgba(245,239,228,0.6)",
  thumbBg: "#ddd4c2",
  field: "#fffdf8",
};
const DARK = {
  paper: "#181310",
  paperLine: "#231c15",
  card: "#221b14",
  cardAlt: "#2a2219",
  line: "#3a2f23",
  ink: "#efe6d6",
  inkSoft: "#c3b6a0",
  muted: "#8c7e66",
  brown: "#c08a5a",
  brownHover: "#d29b6a",
  brownDark: "#7a4d2b",
  green: "#6a9b6f",
  greenSoft: "#7aa87a",
  // Same semantic keys as LIGHT, lifted for legibility on the dark canvas.
  red: "#d0765f",
  amber: "#d7a24a",
  veil: "rgba(18,14,10,0.62)",
  thumbBg: "#2a2219",
  field: "#15100c",
};
let C = LIGHT;
function applyTheme(mode) { C = mode === "dark" ? DARK : LIGHT; }
try { if (localStorage.getItem("ff_theme") === "dark") applyTheme("dark"); } catch {}
const serif = { fontFamily: '"Fraunces", Georgia, "Times New Roman", Times, serif' };
const mono = { fontFamily: '"SFMono-Regular","SF Mono",Menlo,Consolas,"Roboto Mono",monospace' };
const sans = { fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif' };
// One quiet treatment shared by every uppercase label, so they speak in a single
// voice instead of each inventing its own tracking and weight. Used by <Label>, the
// stat captions, and the notice eyebrows.
const overline = { ...sans, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 };

/* ------------------------------------------------------------------ */
/*  WAITING ROOM — facts + time estimate                               */
/* ------------------------------------------------------------------ */
// Even a fast run has a quiet stretch, and a silent progress bar makes that feel
// like a hang. These rotate in the status panel while the tool works, so there is
// always visible proof something is happening — and half of them teach you
// something about the tool or about cutting footage.
//
// Written deliberately in PLAIN ENGLISH: short sentences, everyday words, one
// idea each. The user's note was that the old wording had to be read twice, so
// anything needing a second pass has been split into two simple sentences.
const FACTS = [
  "First, the AI reads your whole script. That way, when it picks search words for one line, it knows what the video is about and what comes before and after.",
  "In a hurry? Under Options, set \"Clips per scene\" to 2 instead of 4. Each scene then loads half as many clips, so the whole run finishes faster.",
  "Editing tip: change the picture every 3 to 5 seconds. When one clip stays on screen too long, viewers get bored and click away.",
  "Editing tip: don't skip the photos. In your video editor, a slow zoom across a good photo often looks better than a shaky video clip.",
  "Your Pexels and Pixabay keys (the codes you pasted during setup) are saved only in this browser, on this device. They are never sent to anyone else.",
  "When you download your chosen clips as one ZIP file, each file name starts with its scene number (01, 02, 03…). Drag them all into your editor and they line up in script order.",
  "To choose a clip, click its picture. A tick appears in the corner and the clip is added to the bar at the bottom of the screen. From that bar you can download all your chosen clips at once.",
  "Rest your mouse on a video to see a silent preview. To watch it bigger, with sound, click Expand.",
  "Don't like a scene's clips? Shuffle (the crossed arrows) shows different clips for the same search words. Regenerate (the circle arrow) asks the AI for new search words.",
  "Under each scene's line are the words used to search for it, in quotes. Click them to type your own, then press Enter to search again.",
  "The free stock websites have lots of everyday footage: hands, faces, people walking, weather, streets. Very specific things, like one brand or one famous place, may only find something close.",
  "Each scene has a small screen button and a phone button. They switch just that scene between wide clips (for normal YouTube videos) and tall clips (for Shorts and Reels).",
  "Pexels, the main stock website, lets each free key do 200 searches an hour, and every scene uses a few. Adding a backup key in Settings gives you another 200.",
  "Once the AI has written search words for every scene, the tool searches the stock websites for each one. That is usually the part you are waiting on.",
  "Editing tip: read each line out loud. Where you naturally pause is a good place to change to the next clip.",
  "Editing tip: for one scene, try a wide shot, then a close-up, then a face. Three clips in a row make a scene feel planned.",
  "There's no subscription to pay. This copy of the tool is yours to keep.",
  "If a scene shows no clips, its search words were too specific, even after the tool tried a shorter version. Click the search words and try something simpler.",
  "The Shot list button, in the bar at the bottom, saves a text file listing every clip you chose with its scene and a link. Handy if someone else edits your video.",
  "Editing tip: if something moves left in one clip, pick a next clip where things also move left. Changing direction between clips feels jumpy.",
  "Still working. Longer scripts take longer, because every scene gets its own search on the stock websites.",
];

// Rough wall-clock estimate for a run, in seconds. Deliberately a little
// generous — a countdown that finishes early feels good, one that stalls at
// "1s left" does not. Parameterised so it stays honest if the pacing changes.
//
// All the numbers below were MEASURED on 2026-09-02 against the lite model the
// relay now uses, on real narration scripts of 791 / 1,582 / 2,373 words:
//   whole-script split   4.2s / 5.7s / 10.4s   (median of 4 samples each)
//   one keyword batch    1.1-1.5s, flat, whatever the script length
// Two of the twelve split calls stalled at 28-34s — that is Google's own
// queueing, not script length (the 33.7s one was the SHORTEST script). So the
// split figure leans high on purpose. Under-promising the time is the only
// version of this that actually annoys anyone.
function estimateSeconds({ sceneCount, gapMs = GEMINI_MIN_GAP_MS, pool = SCENE_POOL }) {
  const batches = Math.max(1, Math.ceil(sceneCount / KEYWORD_BATCH));
  // The split call reads the WHOLE script at once, so unlike the keyword
  // batches it gets slower as the script gets longer. Scene count tracks length
  // closely (measured ~9 words per scene), so it stands in for word count.
  const segment = 5 + sceneCount * 0.04; // 87 scenes -> 8.5s, 261 -> 15.4s
  const phase1 = ((batches - 1) * gapMs) / 1000 + 4; // staggered starts, then the last call runs
  const phase2 = (sceneCount / pool) * 2.2; // footage searches, several at a time
  return Math.round(segment + phase1 + phase2);
}

function fmtDuration(s) {
  if (s >= 60) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  return `${s}s`;
}

/* ------------------------------------------------------------------ */
/*  API HELPERS                                                        */
/* ------------------------------------------------------------------ */
// Google Gemini's free tier allows only ~15 requests per minute PER KEY. A long
// script fires many keyword calls in a few seconds, which blows past that and
// comes back as 429 "rate limited" — the cause of scenes showing the raw script
// line instead of a real search. Two defences keep every AI call reliable:
//
//   1) throttleGemini() — a shared gate that spaces our calls out, so we stay
//      under the per-minute ceiling instead of flooding it.
//   2) callClaude()'s retry loop — if a call is rate-limited anyway (429) or the
//      model is briefly overloaded (500/503), it waits and tries again a few
//      times with growing pauses, instead of giving up and falling back to a
//      raw script line.
//
// (The function is still named callClaude for historical reasons; the relay it
// calls now talks to Google Gemini, not Claude. The browser never sees the key.)

/* --- The three speed knobs. Everything about how fast a run goes is here. --- */

// Gap between AI calls. ~15/min per key, so with the relay's 3 keys the safe
// combined ceiling is ~45/min; 1600ms ≈ 37/min leaves comfortable margin, and if
// one key does hit its cap the relay rotates to the next. This is the default —
// setGeminiGap() below narrows it automatically if the relay reports fewer keys.
let GEMINI_MIN_GAP_MS = 1600; // 60000 / 1600 ≈ 37 calls per minute across 3 keys

// How many script lines get keyworded per AI call. Bigger = fewer calls but a
// longer wait for each one; 10 is the sweet spot found in testing.
const KEYWORD_BATCH = 10;

// How many scenes search for footage at the same time. The old code did one at a
// time, which is what made long scripts take an hour. 6 at once is a big speed-up
// while staying polite to Pexels and Pixabay (see pacePixabay below).
const SCENE_POOL = 6;

// How many clips "Download ZIP" fetches at the same time. 3 is a big speed-up
// over one at a time without flooding a home connection or the Pixabay relay.
const ZIP_POOL = 3;

// The browser can't see how many Gemini keys the server holds — the whole point
// of the relay is that it keeps them hidden. So the relay tells us the *count*
// (never the keys) with its first reply, and we adjust: 3 keys → 1600ms as
// before, 1 key → 4800ms so a one-key buyer paces safely instead of hammering a
// single quota and stalling on 429 retries. Called once, from callClaude().
let _gapLocked = false;
function setGeminiGap(keyCount) {
  if (_gapLocked || !keyCount) return;
  _gapLocked = true;
  GEMINI_MIN_GAP_MS = Math.round(4800 / Math.min(3, Math.max(1, keyCount)));
}

let _geminiChain = Promise.resolve();
let _geminiLast = 0;
function throttleGemini() {
  // Serialise callers and enforce a minimum gap between each Gemini call. Each
  // caller chains onto the previous one, so even concurrent calls line up.
  _geminiChain = _geminiChain.then(async () => {
    const wait = Math.max(0, _geminiLast + GEMINI_MIN_GAP_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    _geminiLast = Date.now();
  });
  return _geminiChain;
}

async function callClaude(prompt) {
  const MAX_RETRIES = 4;
  // Never wait forever on one call. This has to sit ABOVE the relay's own 45s
  // Gemini timeout, or the browser hangs up first and throws the relay's clean
  // "temporary, please retry" answer away. Order that matters:
  //     45s relay gives up on Gemini  <  55s here  <  60s Vercel kills the function
  // So this is only a backstop for the rare case where the relay itself stops
  // answering. Without it a single hung request holds up the whole run — which
  // is exactly what a stalled model once did.
  const CALL_TIMEOUT_MS = 55000;
  for (let attempt = 0; ; attempt++) {
    await throttleGemini();
    let res;
    try {
      res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch (e) {
      // Timed out or the network dropped. Treat it like a temporary fault.
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, Math.min(15000, 2000 * Math.pow(2, attempt))));
        continue;
      }
      throw new Error("Claude request failed (timeout)");
    }
    if (res.ok) {
      const data = await res.json();
      setGeminiGap(data.keyCount); // older relays don't send this; ignored if absent
      return (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
    }
    // 429 = rate limited, 500/503 = model briefly overloaded or slow to answer.
    // These are temporary — wait (2s, 4s, 8s, capped at 15s) and try again
    // rather than failing the scene. Any other status is a real error, so throw.
    const temporary = res.status === 429 || res.status === 503 || res.status === 500;
    if (temporary && attempt < MAX_RETRIES) {
      const backoff = Math.min(15000, 2000 * Math.pow(2, attempt));
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    throw new Error("Claude request failed (" + res.status + ")");
  }
}

// Turn a failed AI call into a sentence that names the real problem and the real
// fix. The old version said "being rate-limited by Google" for every possible
// fault, which sent people off to wait a minute even when waiting could not
// possibly help: a withdrawn model stays withdrawn, and a missing key stays
// missing. The number comes from callClaude's message just above.
function aiFailMessage(msg) {
  const m = /\((\d{3})\)/.exec(msg || "");
  switch (m ? Number(m[1]) : 0) {
    case 410:
      // The relay walked its whole list of model names and Google no longer
      // recognises any of them. Nothing here can fix that.
      return "This tool uses Google's free AI (called Gemini) to turn each line of your script into search words. Google has switched off the version this tool uses, so that step can't work until the tool is updated. Ask whoever gave you the tool for the latest version.";
    case 404:
      // Vercel's own "no such page" — the relay file was never uploaded.
      return "The part of your website that talks to Google's AI is missing, so no search words could be written. On GitHub, the \"api\" folder has to sit next to index.html. Upload it, then open Vercel and click Redeploy.";
    case 400:
    case 401:
    case 403:
      return "Google didn't accept the AI key your website uses, so no search words could be written. (This is the Gemini key added in Vercel when the tool was first set up.) In Vercel, go to Settings → Environment Variables, check that GEMINI_KEY is correct, then click Redeploy.";
    case 429:
      return "Google's free AI only answers a certain number of times per minute, and this run reached that limit. Wait a minute, then press Analyse again. Adding a second Gemini key in Vercel doubles the limit.";
    default:
      // Includes "(timeout)", which carries no number at all: Google was asked
      // and simply never answered.
      return "Google's AI, which writes the search words for each scene, is busy right now and didn't answer. This is on Google's side, not yours. Wait a minute, then press Analyse again.";
  }
}

// A run never stops when the AI fails — it quietly carries on with your own
// sentences as the search words. That is the right behaviour (some clips beat no
// clips), but on its own it is a lie: the tool said "Done" while the AI was
// dead, and the honest message above never got a chance to appear. So each
// fallback writes a note here, and the end of the run reads the notes.
//
//   reason   — the FIRST failure's message. Later ones are the same fault
//              repeating, and the first arrived before retries muddied it.
//   fellBack — scenes searched with your own words instead of AI keywords.
//   wrote    — scenes the AI did write. If this is 0 and fellBack is not, the
//              AI never worked at all, which is worth saying out loud.
const aiTrouble = { reason: "", fellBack: 0, wrote: 0 };
function resetAITrouble() {
  aiTrouble.reason = "";
  aiTrouble.fellBack = 0;
  aiTrouble.wrote = 0;
}
function noteAITrouble(e) {
  if (!aiTrouble.reason) aiTrouble.reason = (e && e.message) || String(e || "");
}

// Fallback splitter (used only if the AI segmentation step fails): splits on
// sentence-ending punctuation. Safe but coarse — a sentence with several actions
// stays as one scene. segmentScript() below is the primary path.
function splitIntoScenes(script) {
  const cleaned = script.replace(/\s+/g, " ").trim();
  const matches = cleaned.match(/[^.!?]+[.!?]+/g);
  if (!matches) return cleaned ? [cleaned] : [];
  return matches.map((s) => s.trim()).filter((s) => s.length > 1);
}

// Ask the AI to break the script into individual filmable "beats" — one visual
// action per scene. This is a meaning task (knowing "kids climbed trees" is an
// action but "A hundred years ago" is just a lead-in), so a human-written rule
// can't do it well; the model can. Returns an array of short scene lines.
async function segmentScript(script) {
  // Some scripts have a blank line between every sentence. That formatting makes
  // the model read each isolated line as its own beat and OVER-SPLIT (an 8-min
  // script ballooning to 100+ scenes). Collapse the empty lines into flowing
  // prose first so it segments by MEANING, not by how the text was spaced out.
  const tidy = script.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
  const prompt =
    `You are a video editor breaking a YouTube script into individual B-roll shots.\n` +
    `Split the script into separate FILMABLE BEATS - one distinct visual per beat, IN THE ` +
    `SCRIPT'S OWN WORDS.\n\n` +
    `#1 RULE - DO NOT SUMMARIZE. Keep each beat's real wording and full meaning. Never ` +
    `collapse a sentence into a short vague label:\n` +
    `  BAD:  "The safest childhood in history might actually be making kids weaker"\n` +
    `        -> "A safe childhood"   (WRONG: drops "making kids weaker" and flips the meaning)\n` +
    `  GOOD: "The safest childhood in history might actually be making kids weaker"\n` +
    `        -> ["The safest childhood in history might actually be making kids weaker"]  (kept whole)\n\n` +
    `AIM FOR ROUGHLY ONE BEAT PER SENTENCE. Most sentences are a single shot - keep them whole. ` +
    `Only split a sentence when it shows two or more clearly SEPARATE ACTIONS a camera would film ` +
    `as different shots. Keep each piece's real words; you may carry the subject forward so a ` +
    `piece stands alone, but change nothing else:\n` +
    `  "kids climbed trees, built forts, and disappeared outside for hours"\n` +
    `    -> ["kids climbed trees", "kids built forts", "kids disappeared outside for hours"]\n\n` +
    `KEEP AS ONE - a single idea, or a list of ADJECTIVES/moods describing the SAME thing, stays ` +
    `ONE beat in the script's own words. Do NOT split descriptive words into separate shots ` +
    `(one clip covers the whole mood):\n` +
    `  "the room they're in is warm, safe, well-lit" -> ["a warm, safe, well-lit room"]  (one room)\n` +
    `  "an ordinary, perfectly nice room" -> ["an ordinary, perfectly nice room"]  (still one room)\n` +
    `  "a crisp point on the retina, the sheet of light-sensitive cells lining the back of it"\n` +
    `    -> ["light landing in a crisp point on the retina"]  (the rest just defines the retina)\n\n` +
    `MORE RULES:\n` +
    `- Prefer the script's exact words. The ONLY edit allowed is carrying a subject forward into ` +
    `a bare beat (e.g. "built forts" -> "kids built forts"). Never swap in different words that ` +
    `change the meaning.\n` +
    `- Fold pure lead-in fragments that aren't filmable alone (e.g. "A hundred years ago", ` +
    `"Meanwhile", "On the other hand") into the beat they introduce, don't make them their own beat.\n` +
    `- Preserve the script's order. Do NOT invent, summarize, or add anything not in the script.\n\n` +
    `Return ONLY a JSON array of strings, in order. No commentary.\n\nScript:\n"""${tidy}"""`;
  const arr = parseJSONArray(await callClaude(prompt));
  return arr.map((s) => (s || "").toString().trim()).filter((s) => s.length > 1);
}

function parseJSONArray(text) {
  let clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = clean.indexOf("[");
  const b = clean.lastIndexOf("]");
  if (a !== -1 && b !== -1) clean = clean.slice(a, b + 1);
  return JSON.parse(clean);
}

async function generateKeywords(fullScript, batch) {
  const prompt =
    `You are a senior YouTube video editor sourcing B-roll on Pexels/Pixabay. ` +
    `Here is the FULL script, for context only:\n\n"""${fullScript}"""\n\n` +
    `For each numbered line below, write ONE rich, cinematic stock-footage search query.\n\n` +
    `STYLE — match these real examples exactly:\n` +
    `  "They groan."  ->  child eye roll reluctant expression close-up\n` +
    `  "They drag their feet."  ->  child feet dragging slow walking floor\n` +
    `  "Twenty minutes later they're back in, bored."  ->  bored child slumped couch indoors afternoon\n` +
    `  "That room is changing the shape of their eyes."  ->  child eye close-up macro indoor room\n` +
    `  "Bright light hits the retina."  ->  bright sunlight burst streaming through window\n` +
    `  "Dim light, thin dopamine."  ->  dim indoor artificial lamp dark room\n` +
    `  "A park."  ->  lush green park trees dappled light path\n\n` +
    `RULES:\n` +
    `- Build each query as: SUBJECT + visible action or expression + setting, and add a ` +
    `framing word when it fits (close-up, macro, wide, aerial, silhouette, timelapse).\n` +
    `- Usually 4 to 6 words. Detailed and evocative, but ALWAYS a real shot a camera could film.\n` +
    `- Turn abstract ideas into a concrete visual: don't write "the reward chemical" — ` +
    `picture it, e.g. "child face lighting up pleased moment".\n` +
    `- Use the script's context (what's happening before/after) to pick the right subject and mood.\n` +
    `- For a comparison or contrast, a "X versus Y" shot is allowed (e.g. "bright outdoor doorway versus dim indoor room").\n\n` +
    `Return ONLY a JSON array of strings, one per line, in order. No commentary.\n\nLines:\n` +
    batch.map((s, i) => `${i + 1}. ${s}`).join("\n");
  let arr = [];
  try {
    arr = parseJSONArray(await callClaude(prompt));
  } catch (e) {
    // Keep going with an empty batch (each line gets its own retry below), but
    // leave a note so the end of the run can admit the AI is in trouble.
    noteAITrouble(e);
    arr = [];
  }
  // First pass from the batch response.
  const out = batch.map((s, i) => (arr[i] || "").toString().trim());
  // Any line Claude skipped or returned blank gets its OWN focused retry,
  // so we never fall back to a chopped-off sentence like "Everything far away starts".
  for (let i = 0; i < out.length; i++) {
    if (out[i]) {
      aiTrouble.wrote++;
      continue;
    }
    try {
      out[i] = await oneKeyword(fullScript, batch[i]);
    } catch (e) {
      noteAITrouble(e);
      out[i] = "";
    }
    if (out[i]) {
      aiTrouble.wrote++;
      continue;
    }
    // Last resort only if the retry also failed: use the FULL line (cleaned),
    // never a truncated slice — a whole sentence still searches sensibly.
    out[i] = batch[i].replace(/[".]+$/g, "").trim();
    aiTrouble.fellBack++;
  }
  return out;
}

// Generate one cinematic search query for a single line (used to repair any
// line the batch call skipped). Kept separate from regenKeyword, which is for
// asking for a *different* angle than a previous search.
async function oneKeyword(fullScript, line) {
  const prompt =
    `You are a senior YouTube video editor sourcing B-roll on Pexels/Pixabay.\n` +
    `Full script for context only:\n"""${fullScript}"""\n\n` +
    `Write ONE rich, cinematic stock-footage search query for this line: "${line}".\n` +
    `Format: SUBJECT + visible action/expression + setting, plus a framing word when it fits ` +
    `(close-up, macro, wide, aerial, silhouette, timelapse). Usually 4 to 6 words, always a real ` +
    `filmable shot, no abstract phrases. Return ONLY the query text, nothing else.`;
  const t = (await callClaude(prompt)).trim().replace(/^["']|["']$/g, "");
  return t;
}

async function regenKeyword(fullScript, line, prev, before, after) {
  const around =
    (before ? `The line right BEFORE it: "${before}".\n` : "") +
    (after ? `The line right AFTER it: "${after}".\n` : "");
  const prompt =
    `You are a senior YouTube video editor sourcing B-roll on Pexels/Pixabay.\n` +
    `Full script for context only:\n"""${fullScript}"""\n\n` +
    `Focus on THIS line: "${line}".\n` + around +
    `The previous search "${prev}" didn't fit. Write ONE fresh search for the SAME moment: ` +
    `same subject, same place, same mood as this line, just a DIFFERENT shot of it ` +
    `(new framing or action). Do NOT switch to a different topic.\n` +
    `Format: SUBJECT + visible action/expression + setting, ` +
    `plus a framing word when it fits (close-up, macro, wide, aerial, silhouette, timelapse). ` +
    `Usually 4 to 6 words, cinematic but always a real filmable shot (e.g. ` +
    `"child eye roll reluctant expression close-up"). No abstract phrases. ` +
    `Return ONLY the query text, nothing else.`;
  const t = (await callClaude(prompt)).trim().replace(/^["']|["']$/g, "");
  return t || prev;
}

/* ---- shared: choose a ~1080p source instead of the biggest available ---- */
// Both providers offer several sizes of the SAME clip. Instead of grabbing the
// largest (often 2K/4K), pick the lightest file that still fills a 1080p timeline:
// long edge <= 1920 AND short edge <= 1080 (works for landscape, portrait, square).
// Prefer an exact 1920x1080 / 1080x1920, else the biggest that still fits. If EVERY
// option is bigger than 1080p, take the smallest of those (closest to target, never
// a needless 4K). No re-encoding — it just points at the right file the API returns.
function pickVideoFile(files) {
  const valid = (files || []).filter((f) => f && f.link && f.width > 0 && f.height > 0);
  if (!valid.length) return (files || []).find((f) => f && f.link) || null;
  const long = (f) => Math.max(f.width, f.height);
  const short = (f) => Math.min(f.width, f.height);
  const area = (f) => f.width * f.height;
  const fits = valid.filter((f) => long(f) <= 1920 && short(f) <= 1080);
  if (fits.length) {
    const exact = fits.find(
      (f) => (f.width === 1920 && f.height === 1080) || (f.width === 1080 && f.height === 1920)
    );
    return exact || fits.slice().sort((a, b) => area(b) - area(a))[0];
  }
  return valid.slice().sort((a, b) => area(a) - area(b))[0];
}

// The other half of the pair. Every result now carries TWO download links: the
// 1080p pick above, and this one — the biggest file the API offers. The Settings
// "Download quality" switch decides which is used at download time, so flipping it
// never re-runs a search or spends an API request. Same clip either way.
function pickMaxVideoFile(files) {
  const valid = (files || []).filter((f) => f && f.link && f.width > 0 && f.height > 0);
  if (!valid.length) return (files || []).find((f) => f && f.link) || null;
  return valid.slice().sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

// Cap a Pexels PHOTO at ~1920 on the long edge. Pexels images are Imgix-backed, so
// adding fit=max&w=1920&h=1920 to the original URL serves a smaller render of the
// SAME photo: aspect kept, downscale-only (never upscales), no crop.
function pexelsPhotoCap(src) {
  const orig = src && src.original;
  if (!orig) return (src && (src.large2x || src.large)) || "";
  return orig + (orig.includes("?") ? "&" : "?") + "auto=compress&cs=tinysrgb&fit=max&w=1920&h=1920";
}

// The answers to searches already made in this tab, keyed by the search itself
// (words, page, orientation, count, site and type — never the API key, since
// every key gets the same answer). Flipping a scene to portrait and back used to
// search all over again, spending the free hourly quota on results we already
// had. Shuffle asks for the NEXT page, so it is a different search and always
// goes out. Only successful answers are kept; a refusal or an error never is.
const _searchCache = new Map();
function cachedResults(id) {
  const hit = _searchCache.get(id);
  return hit ? hit.slice() : null;
}
function rememberResults(id, list) {
  if (_searchCache.size >= 400) _searchCache.delete(_searchCache.keys().next().value); // drop the oldest
  _searchCache.set(id, list);
  return list.slice();
}

/* ---- Pexels ---- */
async function pexelsPhotos(q, key, page = 1, orientation = "landscape", perPage = 4) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}&orientation=${orientation}`;
  const cached = cachedResults(url);
  if (cached) return cached;
  const r = await fetch(url, { headers: { Authorization: key } });
  if (r.status === 401) throw new Error("PEXELS_AUTH");
  if (r.status === 429) throw new Error("PEXELS_RATE");
  if (!r.ok) return [];
  const d = await r.json();
  return rememberResults(url, (d.photos || []).map((p) => ({
    id: "px-p-" + p.id,
    type: "photo",
    source: "Pexels",
    // The tile is ~230px wide. For a wide photo Pexels' 350px-tall size is still
    // sharp at that width on a high-density screen, at a third of the weight
    // (measured 11 KB vs 34 KB). A tall tile is ~410px high, so portrait keeps
    // the bigger size.
    thumb: orientation === "landscape" ? p.src.medium || p.src.large : p.src.large,
    download: pexelsPhotoCap(p.src),
    downloadHi: (p.src && (p.src.original || p.src.large2x || p.src.large)) || "",
    url: p.url,
    label: `Pexels Photo #${p.id}`,
  })));
}
async function pexelsVideos(q, key, page = 1, orientation = "landscape", perPage = 4) {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}&orientation=${orientation}`;
  const cached = cachedResults(url);
  if (cached) return cached;
  const r = await fetch(url, { headers: { Authorization: key } });
  if (r.status === 401) throw new Error("PEXELS_AUTH");
  if (r.status === 429) throw new Error("PEXELS_RATE");
  if (!r.ok) return [];
  const d = await r.json();
  return rememberResults(url, (d.videos || []).map((v) => {
    const files = (v.video_files || []).filter((f) => f.file_type === "video/mp4");
    // Preview stays light; download aims at ~1080p, not 4K. Pexels usually lists
    // two "sd" files (640x360 and 960x540) in no fixed order, and taking the first
    // could land on the heavier one. Take the smallest that is still at least 360
    // on its short side, so the Expand player never gets a postage stamp.
    const sdOk = files
      .filter((f) => f.quality === "sd" && Math.min(f.width || 0, f.height || 0) >= 360)
      .sort((a, b) => a.width * a.height - b.width * b.height);
    const sd = sdOk[0] || files.find((f) => f.quality === "sd") || files[0];
    const pick = pickVideoFile(files) || sd;
    const max = pickMaxVideoFile(files) || pick;
    return {
      id: "px-v-" + v.id,
      type: "video",
      source: "Pexels",
      thumb: v.image,
      preview: (sd && sd.link) || "",
      download: (pick && pick.link) || (sd && sd.link) || "",
      downloadHi: (max && max.link) || (pick && pick.link) || "",
      url: v.url,
      label: `Pexels Video #${v.id}`,
    };
  }));
}

/* ---- Pixabay ---- */

// Pixabay allows about 100 requests per minute per key. Searching 6 scenes at once
// would blow straight through that, so every Pixabay call books a slot here first.
// It's a sliding 60-second window: we remember when recent calls happened, and if
// the last minute is already full we wait just long enough for the oldest one to
// age out. Capacity scales with the number of keys the user has connected (3 keys
// ≈ 285/min, which is more than a long script needs, so nobody ever waits).
let _pbCapacity = 95;
const _pbWindow = []; // timestamps of recent calls, oldest first
function setPixabayCapacity(keyCount) {
  _pbCapacity = 95 * Math.max(1, keyCount || 1);
}
// One shared promise chain, so two callers can't both look at a full window and
// both decide there's room.
let _pbChain = Promise.resolve();
function pacePixabay() {
  _pbChain = _pbChain.then(async () => {
    for (;;) {
      const cutoff = Date.now() - 60000;
      while (_pbWindow.length && _pbWindow[0] <= cutoff) _pbWindow.shift();
      if (_pbWindow.length < _pbCapacity) break;
      await new Promise((r) => setTimeout(r, _pbWindow[0] - cutoff + 50));
    }
    _pbWindow.push(Date.now());
  });
  return _pbChain;
}

async function pixabayPhotos(q, key, page = 1, orientation = "landscape", perPage = 4) {
  const pbOrient = orientation === "portrait" ? "vertical" : "horizontal";
  // Pixabay REQUIRES per_page >= 3 — asking for 2 makes it reject the whole
  // request and return nothing (this is why "2 clips" showed zero Pixabay
  // photos while "4 clips" worked). So we ask for at least 3, then trim back
  // to the count the user actually wanted. Same trick the video call uses.
  const ask = Math.max(3, perPage);
  // The cache id leaves the key out of the address, so it is never stored anywhere.
  const cacheId = `pixabay-photos|${q}|${ask}|${page}|${pbOrient}|${perPage}`;
  const cached = cachedResults(cacheId);
  if (cached) return cached;
  await pacePixabay();
  const r = await fetch(
    `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&per_page=${ask}&page=${page}&image_type=photo&orientation=${pbOrient}`
  );
  if (r.status === 429) throw new Error("PIXABAY_RATE");
  if (!r.ok) return [];
  const d = await r.json();
  return rememberResults(cacheId, (d.hits || []).slice(0, perPage).map((h) => ({
    id: "pb-p-" + h.id,
    type: "photo",
    source: "Pixabay",
    thumb: h.webformatURL,
    download: h.fullHDURL || h.largeImageURL,
    // imageURL is the untouched original (only served on keys with full access);
    // largeImageURL is always there, so "Highest" is never an empty link.
    downloadHi: h.imageURL || h.fullHDURL || h.largeImageURL,
    url: h.pageURL,
    label: `Pixabay Photo #${h.id}`,
  })));
}
async function pixabayVideos(q, key, page = 1, orientation = "landscape", perPage = 4) {
  // Pixabay's video endpoint has no orientation param, so we request a few
  // extra (double the wanted count) and filter by the clip's own width/height
  // on our side, then trim back to perPage.
  const cacheId = `pixabay-videos|${q}|${perPage}|${page}|${orientation}`;
  const cached = cachedResults(cacheId);
  if (cached) return cached;
  await pacePixabay();
  const r = await fetch(
    `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(q)}&per_page=${perPage * 2}&page=${page}`
  );
  if (r.status === 429) throw new Error("PIXABAY_RATE");
  if (!r.ok) return [];
  const d = await r.json();
  const wantPortrait = orientation === "portrait";
  return rememberResults(cacheId, (d.hits || [])
    .map((h) => {
      const vids = h.videos || {};
      const dim = vids.large || vids.medium || vids.small || vids.tiny || {};
      const portrait = (dim.height || 0) > (dim.width || 0);
      // Aim download at ~1080p by real dimensions (large is often 4K now).
      const files = [vids.large, vids.medium, vids.small, vids.tiny]
        .filter(Boolean)
        .map((f) => ({ link: f.url, width: f.width || 0, height: f.height || 0 }));
      const pick = pickVideoFile(files);
      const max = pickMaxVideoFile(files);
      // Each size of a Pixabay clip has its own still, as big as that size. The
      // tile is ~230px wide, so the "tiny" one (960x540) is already more than
      // sharp enough — measured 20 KB against 131 KB for "large" on the same clip,
      // and "large" is a full 4K frame on newer uploads.
      const thumb =
        vids.tiny?.thumbnail ||
        vids.small?.thumbnail ||
        vids.medium?.thumbnail ||
        vids.large?.thumbnail ||
        (h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg` : "");
      return {
        id: "pb-v-" + h.id,
        type: "video",
        source: "Pixabay",
        thumb,
        // Same idea for the hover preview and the Expand player: 960x540 fills
        // both, at well under half the download (measured 427 KB vs 1.03 MB).
        preview: vids.tiny?.url || vids.small?.url || vids.medium?.url || "",
        download: (pick && pick.link) || vids.medium?.url || vids.small?.url || vids.large?.url || "",
        downloadHi: (max && max.link) || vids.large?.url || (pick && pick.link) || "",
        url: h.pageURL,
        label: `Pixabay Video #${h.id}`,
        _portrait: portrait,
      };
    })
    .filter((r) => r._portrait === wantPortrait)
    .slice(0, perPage)
    .map(({ _portrait, ...r }) => r));
}

// Progressively broader versions of a rich query, so a very specific search
// ("child eye roll reluctant expression close-up") degrades gently
// (-> "child eye roll" -> "child eye") instead of collapsing to nothing.
// The prompt always puts the subject first, so leading words carry the meaning.
//
// A rung that drops only ONE word almost never turns "nothing found" into a
// hit — the 2-word core is what actually matches stock libraries. So a 4-word
// query (the common case) now skips straight to the core, halving the requests
// spent on an empty scene. 5 words or more keeps both rungs, since there the
// first one drops two words and is a real step wider.
function broadenQueries(q) {
  const words = q.trim().split(/\s+/);
  const out = [];
  if (words.length > 4) out.push(words.slice(0, 3).join(" "));
  if (words.length > 2) out.push(words.slice(0, 2).join(" "));
  return out;
}

// Try each API key in turn, rotating to the next ONLY when the current one is
// rate-limited (its hourly/per-minute quota is used up). Giving each source a
// 2nd and 3rd key from separate free accounts multiplies the usable quota, so
// long scripts and heavy reshuffling don't run dry. A non-rate error (e.g. a
// rejected key) is thrown straight away — rotating wouldn't help there.
//
// Each call STARTS on a different key (round-robin). Always starting at the
// first one meant key 1 absorbed every request and hit its ceiling alone while
// 2 and 3 sat untouched — and each fall-through wasted a whole refused request
// before moving on. Starting one step further along each time spreads the load,
// so three keys now drain together instead of one at a time.
let keyTurn = 0;
async function withKeyRotation(keys, rateSignal, fn) {
  const list = (keys || []).filter(Boolean);
  if (!list.length) return [];
  const start = keyTurn++ % list.length;
  for (let i = 0; i < list.length; i++) {
    try {
      return await fn(list[(start + i) % list.length]);
    } catch (e) {
      if (e && e.message === rateSignal && i < list.length - 1) continue;
      throw e;
    }
  }
  return [];
}

async function searchScene(q, opts) {
  const { pexelsKeys = [], pixabayKeys = [], sources, mediaTypes, page, orientation = "landscape", perPage = 4 } = opts;
  // Tell the Pixabay pacer how much room we have this run: more keys, more room.
  setPixabayCapacity(pixabayKeys.length);
  const runOne = async (query) => {
    const tasks = [];
    if (sources.pexels && pexelsKeys.length) {
      if (mediaTypes.videos) tasks.push(withKeyRotation(pexelsKeys, "PEXELS_RATE", (k) => pexelsVideos(query, k, page, orientation, perPage)));
      if (mediaTypes.photos) tasks.push(withKeyRotation(pexelsKeys, "PEXELS_RATE", (k) => pexelsPhotos(query, k, page, orientation, perPage)));
    }
    if (sources.pixabay && pixabayKeys.length) {
      if (mediaTypes.videos) tasks.push(withKeyRotation(pixabayKeys, "PIXABAY_RATE", (k) => pixabayVideos(query, k, page, orientation, perPage)));
      if (mediaTypes.photos) tasks.push(withKeyRotation(pixabayKeys, "PIXABAY_RATE", (k) => pixabayPhotos(query, k, page, orientation, perPage)));
    }
    const settled = await Promise.allSettled(tasks);
    let rateLimited = false;
    for (const s of settled) {
      if (s.status === "rejected" && s.reason?.message === "PEXELS_AUTH")
        throw new Error("PEXELS_AUTH");
      if (s.status === "rejected" && s.reason?.message === "PEXELS_RATE")
        rateLimited = true;
    }
    const flat = settled.filter((s) => s.status === "fulfilled").flatMap((s) => s.value);
    // Keep everything each source returned (no cross-source cap). Group by type:
    // all videos first, then all photos. This makes it easier to scan the motion
    // options together, then the stills, rather than jumping back and forth.
    const vids = flat.filter((r) => r.type === "video");
    const phts = flat.filter((r) => r.type === "photo");
    const out = [...vids, ...phts];
    // Pexels refused (hit its free hourly limit) AND nothing came back from
    // Pixabay either — tell the caller so it can show a real message instead of
    // silently leaving the old footage in place.
    if (rateLimited && out.length === 0) throw new Error("PEXELS_RATE");
    return out;
  };

  let results = await runOne(q);
  // Nothing found? Step through gradually broader queries before giving up.
  if (results.length === 0) {
    for (const broader of broadenQueries(q)) {
      results = await runOne(broader);
      if (results.length) break;
    }
  }
  return results;
}

// To save a clip with a proper numbered filename, the browser has to read the
// file's bytes itself, and a site only allows that if it sends a permission
// header. Pexels always has. Pixabay used not to, so every Pixabay file went
// through our own relay (/api/proxy), which fetches it on Vercel and passes it on.
//
// Re-checked 2026-10-10: Pixabay's file servers now DO send the header (to any
// page that says where it comes from, which a browser always does). Measured on
// the user's own connection, the same 3.5 MB clip took 9s direct and 27s through
// the relay. So Pixabay is now fetched direct too, and the relay is kept only as
// a backup in case direct is ever refused again.
function clipNeedsProxy(url) {
  const host = (url || "").replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
  return /(^|\.)pixabay\.com$/.test(host);
}
function clipProxyURL(url) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}
// The only sites a clip is ever downloaded from (the same list as api/proxy.js and
// download-sw.js). Anything else keeps the old download route.
function clipHostAllowed(url) {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return /^https:/i.test(url) && /(^|\.)(pexels|pixabay)\.com$/.test(host);
}

// Give up on a download only when it has STOPPED, never just because it is slow.
// The old rule was "25 seconds in total", and on a home connection a normal
// 1080p clip takes longer than that — so it was cut off, and the tool then
// opened the clip in a new tab instead, which is what made the page jump away
// and back. Now the clock restarts every time a piece of the file arrives.
const DOWNLOAD_STALL_MS = 30000;

async function fetchWithProgress(url, onProgress) {
  const ctrl = new AbortController();
  let timer;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), DOWNLOAD_STALL_MS); };
  arm();
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const type = res.headers.get("content-type") || "";
    const size = Number(res.headers.get("content-length")) || 0;
    if (!res.body || !res.body.getReader) return await res.blob();
    const reader = res.body.getReader();
    const parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      parts.push(value);
      got += value.length;
      if (onProgress) onProgress(size ? got / size : null);
    }
    return new Blob(parts, { type });
  } finally {
    clearTimeout(timer);
  }
}
// Which of the two links a result carries do we actually fetch? "max" takes the
// biggest file the site offers, anything else takes the ~1080p pick. Old saved
// workspaces have no downloadHi, so it falls back rather than breaking.
function mediaURL(item, quality) {
  if (!item) return "";
  return (quality === "max" ? item.downloadHi || item.download : item.download) || "";
}
async function fetchClipBlob(item, quality, onProgress) {
  const url = mediaURL(item, quality).trim();
  if (!url) throw new Error("no download url"); // count as a skip, not a silent hang
  try {
    return await fetchWithProgress(url, onProgress);
  } catch (e) {
    // Direct didn't work. For Pixabay there is a second road: our own relay.
    if (!clipNeedsProxy(url)) throw e;
    return await fetchWithProgress(clipProxyURL(url), onProgress);
  }
}

// Single-clip downloads go straight into the browser's own downloader.
//
// Measured 2026-10-10 (DOWNLOAD_REGRESSION_REPORT.md): every version of this tool
// read the WHOLE clip into the page first and only then asked the browser to save
// it, so the browser's download bar stayed empty until the very last byte had
// arrived. The percentage added on the Download button made that wait visible,
// but didn't shorten it: a 12 MB clip still showed nothing in the browser's
// downloads for ~30 seconds on a home connection.
//
// Now a small helper (download-sw.js) passes the clip on to the browser piece by
// piece, under the same numbered name, so the browser starts saving as soon as the
// stock website starts sending (measured: 0.3 s after the click instead of 30 s,
// same clip, same connection) and shows its own progress. The button keeps its
// percentage. The helper switches itself on in the background once per visit;
// until it is ready, or in a browser that can't run it, downloads use the old
// route above (fetchClipBlob), exactly as before. The ZIP still needs the old
// route: a ZIP can only be built once every file is in.
const DL_SCOPE = "./ff-download/";
let _dlReg = null; // the helper's registration, once the browser accepts it
let _dlOff = false; // set if the helper ever doesn't answer: old route for the rest of the visit
const _dlListeners = new Map(); // download id -> message handler
(function startDownloadHelper() {
  try {
    if (!window.isSecureContext || !("serviceWorker" in navigator) || typeof BroadcastChannel !== "function") return;
    new BroadcastChannel("ff-download").onmessage = (e) => {
      const m = e.data || {};
      const f = _dlListeners.get(m.id);
      if (f) f(m);
    };
    navigator.serviceWorker.register("./download-sw.js", { scope: DL_SCOPE }).then((reg) => { _dlReg = reg; }, () => {});
  } catch {}
})();
function nativeDownloadReady(url) {
  return !_dlOff && !!(_dlReg && _dlReg.active) && clipHostAllowed(url);
}
// Resolves "done" | "cancel" | { notAnswering } | { notStarted } | { broke }.
function nativeDownload(url, name, onProgress) {
  return new Promise((resolve) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    // A hidden frame, so the page itself never navigates anywhere: if anything
    // goes wrong, the frame just stays blank.
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    let quiet, ping;
    const settle = (r, browserHasIt) => {
      clearTimeout(quiet);
      clearInterval(ping);
      _dlListeners.delete(id);
      // Removing the frame before the browser has taken the download over cancels
      // it, which is exactly what we want when we're falling back.
      if (browserHasIt) setTimeout(() => frame.remove(), 5000); else frame.remove();
      resolve(r);
    };
    // How long each stage may stay silent before we stop waiting on it. Once the
    // file is flowing the helper reports at least every 5 seconds.
    const expect = (ms, r, browserHasIt) => { clearTimeout(quiet); quiet = setTimeout(() => settle(r, browserHasIt), ms); };
    _dlListeners.set(id, (m) => {
      if (m.stage === "ack") expect(DOWNLOAD_STALL_MS + 15000, { notStarted: true });
      else if (m.stage === "start" || m.stage === "progress") {
        onProgress(m.size ? Math.min(1, (m.got || 0) / m.size) : null);
        expect(DOWNLOAD_STALL_MS + 15000, { broke: true }, true);
      } else if (m.stage === "done") settle("done", true);
      else if (m.stage === "cancel") settle("cancel", true);
      else if (m.stage === "fail") settle({ notStarted: true });
      else if (m.stage === "error") settle({ broke: true }, true);
    });
    // Browsers put an idle helper to sleep; a ping now and then keeps it awake
    // until the file is done.
    ping = setInterval(() => { try { _dlReg.active && _dlReg.active.postMessage("ping"); } catch {} }, 10000);
    expect(4000, { notAnswering: true });
    frame.src = `${DL_SCOPE}${encodeURIComponent(name)}?id=${id}&src=${encodeURIComponent(url)}`;
    document.body.appendChild(frame);
  });
}

// What each Download button shows while its clip is on the way: a percentage,
// then a short "Saved", or a short "Didn't work". Kept outside React, with one
// listener per clip, so a progress tick redraws that one button and nothing else.
const _dl = new Map(); // clip id -> { pct } | { done: true } | { failed: true }
const _dlWatchers = new Map(); // clip id -> Set of redraw callbacks
function setDownloadState(id, v) {
  if (v == null) _dl.delete(id); else _dl.set(id, v);
  (_dlWatchers.get(id) || []).forEach((f) => f());
}
function useDownloadState(id) {
  const [, redraw] = useState(0);
  useEffect(() => {
    const f = () => redraw((n) => n + 1);
    if (!_dlWatchers.has(id)) _dlWatchers.set(id, new Set());
    _dlWatchers.get(id).add(f);
    return () => _dlWatchers.get(id).delete(f);
  }, [id]);
  return _dl.get(id);
}

// The page sets this to its floating notice, so a failed download can explain
// itself even when you are scrolled far from the status line at the top.
let _notify = () => {};

// The tiny in-browser zip library, loaded on demand from a CDN the first time
// someone hits "Download ZIP" (kept out of the initial page load).
let _jszipPromise;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!_jszipPromise) {
    _jszipPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
      s.onload = () => resolve(window.JSZip);
      s.onerror = () => reject(new Error("zip-load-failed"));
      document.head.appendChild(s);
    });
  }
  return _jszipPromise;
}

// Build the ordered, editor-friendly filename for a clip: zero-padded scene
// number (01_, 02_, ...) so it sorts in timeline order, then the scene's own
// search words so the file says what's in it without opening it, then the
// clip's own number so two clips from the SAME scene never collide.
// e.g. 03_rain_on_a_window_at_night_7123973.mp4
function clipFileName(item, seq, total, keyword) {
  const pad = Math.max(2, String(total || 0).length);
  const prefix = seq ? String(seq).padStart(pad, "0") + "_" : "";
  const words = String(keyword || item.label || "clip")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 44);
  const num = String(item.id || "").replace(/[^0-9]/g, "");
  return `${prefix}${words || "clip"}${num ? "_" + num : ""}.${item.type === "video" ? "mp4" : "jpg"}`;
}

async function downloadMedia(item, seq, total, keyword, quality) {
  // Already on its way? Then a second click does nothing. Before, the button gave
  // no sign it had been pressed, so people pressed it again — and got two, three
  // copies of the same file once they all finished.
  const now = _dl.get(item.id);
  if (now && now.pct !== undefined) return;
  setDownloadState(item.id, { pct: 0 });
  const name = clipFileName(item, seq, total, keyword);
  let shown = 0;
  const onProgress = (p) => {
    const pct = p == null ? null : Math.floor(p * 100);
    if (pct !== shown) { shown = pct; setDownloadState(item.id, { pct }); }
  };
  try {
    const src = mediaURL(item, quality).trim();
    let handedOver = false, blob = null;
    if (nativeDownloadReady(src)) {
      const r = await nativeDownload(src, name, onProgress);
      if (r === "cancel") { setDownloadState(item.id, null); return; } // cancelled in the browser: nothing to report
      if (r === "done") handedOver = true;
      else if (r.broke) throw r; // stopped part-way: the browser lists it as failed too. Download again retries.
      else if (r.notAnswering) _dlOff = true; // helper isn't working in this browser: old route, now and from now on
      else if (clipNeedsProxy(src)) blob = await fetchWithProgress(clipProxyURL(src), onProgress); // Pixabay's second road, as before
      else throw r;
    }
    if (!handedOver) {
      if (!blob) blob = await fetchClipBlob(item, quality, onProgress);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
    setDownloadState(item.id, { done: true });
    setTimeout(() => { if ((_dl.get(item.id) || {}).done) setDownloadState(item.id, null); }, 2500);
  } catch {
    // This used to open the clip in a new tab as a last resort, which pulled you
    // off the page. Stay put and say what happened instead.
    setDownloadState(item.id, { failed: true });
    setTimeout(() => { if ((_dl.get(item.id) || {}).failed) setDownloadState(item.id, null); }, 4000);
    _notify(
      "That clip didn't download. This usually means the internet connection dropped for a moment, " +
      "or the stock website was slow to answer. Press Download to try again. If it keeps failing, press " +
      "View: it opens the clip on the stock website, where you can save it yourself."
    );
  }
}

// The Download button on a clip and in the big player. Shows how far along the
// file is the moment you press it, so you can see it working without pressing again.
//   tile  — the small button in the clip's hover bar. While its clip is
//           downloading, that bar stays visible even after the mouse moves away,
//           so the percentage doesn't vanish with it.
//   modal — the larger button under the big player.
function DownloadButton({ item, seq, total, keyword, quality, variant }) {
  const st = useDownloadState(item.id);
  const ref = useRef(null);
  const busy = !!st && st.pct !== undefined;
  useEffect(() => {
    if (variant !== "tile" || !ref.current) return;
    const bar = ref.current.closest(".ff-actions");
    if (bar) bar.style.opacity = st ? "1" : "";
  }, [st, variant]);
  const label = busy
    ? st.pct == null ? "Downloading…" : `${st.pct}%`
    : st && st.done ? "Saved ✓"
    : st && st.failed ? "Didn't work"
    : "Download";
  const Icon = busy ? Loader2 : st && st.done ? Check : st && st.failed ? AlertTriangle : Download;
  const onClick = (e) => { e.stopPropagation(); downloadMedia(item, seq, total, keyword, quality); };
  if (variant === "modal") {
    return (
      <button ref={ref} onClick={onClick} title="Download this clip to your computer" style={{ ...sans, backgroundColor: "#f4ead7", color: C.brownDark }} className="text-[12px] px-3 py-1.5 rounded flex items-center gap-1.5 font-semibold">
        <Icon size={12} className={busy ? "animate-spin" : ""} /> {label}
      </button>
    );
  }
  return (
    <button ref={ref} onClick={onClick} title="Download this clip to your computer right now. (To collect it with others for one ZIP download, click the picture instead.)" style={{ ...sans }} className="pointer-events-auto flex items-center gap-1 text-[10px] font-medium text-white bg-white/15 hover:bg-white/25 px-1.5 py-1 rounded">
      <Icon size={9} className={busy ? "animate-spin" : ""} /> <span className="ff-lbl">{label}</span>
    </button>
  );
}

// When a scene's clips get replaced — Shuffle, Regenerate, an edited keyword, a
// switch to portrait — anything already ticked used to disappear from the grid
// while quietly staying in the download list. The bar would say "2 clips
// selected" with nothing ticked on screen, and those two files came out of the
// ZIP with no scene number on them. So instead of dropping picks, we carry them
// over: your ticked clips stay at the front of the new set, still ticked, still
// visible. Nothing is lost by looking around.
// A pick is remembered per SCENE, not just per clip. The same stock clip can be
// returned in two different scenes; ticking it in one must not tick it in the other.
// So the selection map is keyed by scene id + clip id together.
const selKey = (sceneId, clipId) => sceneId + "|" + clipId;
function mergeKeepingPicks(prevResults, nextResults, selected, sceneId) {
  const kept = (prevResults || []).filter((r) => selected[selKey(sceneId, r.id)]);
  if (!kept.length) return nextResults;
  const keptIds = new Set(kept.map((r) => r.id));
  return [...kept, ...(nextResults || []).filter((r) => !keptIds.has(r.id))];
}

/* ---- validation ---- */
async function validatePexels(key) {
  try {
    const r = await fetch("https://api.pexels.com/v1/search?query=city&per_page=1", {
      headers: { Authorization: key },
    });
    return r.ok;
  } catch {
    return false;
  }
}
async function validatePixabay(key) {
  try {
    const r = await fetch(`https://pixabay.com/api/?key=${key}&q=city&per_page=3`);
    return r.ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  STORAGE                                                            */
/* ------------------------------------------------------------------ */
const KEY = "ff_settings_v1";
async function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}
// Merge, never overwrite. A caller that only knows about some of the settings —
// the setup wizard, for instance — used to blank out every field it forgot to
// mention. Now whatever isn't passed simply stays as it was.
async function persist(s) {
  try {
    let prev = {};
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) prev = JSON.parse(raw) || {};
    } catch {}
    localStorage.setItem(KEY, JSON.stringify({ ...prev, ...s }));
  } catch {}
}

// The workspace — the script and the scenes it produced — lives under its own key
// so an accidental refresh, or a crash mid-run, never costs you a finished run.
//
// sessionStorage, NOT localStorage, and that distinction IS the feature. A refresh
// keeps your work; closing the tab throws it away. The first version used
// localStorage and kept everything forever, which the user hit in real use:
// opening the tool the next day to start a NEW video meant the old script and all
// its footage were still sitting there, so the first thing you had to do was
// select the whole box and delete it. Surviving a refresh is protection.
// Remembering last week's video is just something in the way.
// Bonus: sessionStorage is per-tab, so two tabs can hold two different videos.
//
// Deliberately kept apart from the settings above. Settings are tiny and SHOULD be
// permanent, so they stay in localStorage — nobody wants to re-enter their keys.
// A workspace can be a few hundred KB, so a storage failure on one must not take
// the other down either.
const WORK_KEY = "ff_work_v1";
function loadWork() {
  // Versions before this one saved the workspace in localStorage, where it
  // outlived the tab. Clear any leftover copy once, or an old script would sit
  // there unread forever, still using up its share of the quota.
  try { localStorage.removeItem(WORK_KEY); } catch {}
  try {
    const raw = sessionStorage.getItem(WORK_KEY);
    if (!raw) return null;
    const w = JSON.parse(raw);
    if (!w || !Array.isArray(w.scenes)) return null;
    // A workspace saved mid-run would come back with cards stuck on "Finding
    // footage..." forever, because the run that would have finished them is gone.
    // Land every scene as settled instead. `results` is forced to an array in the
    // same pass: everything downstream calls .map and .filter on it, so one
    // truncated or half-written save would otherwise blank the whole page.
    w.scenes = w.scenes.map((s) => ({ ...s, loading: false, results: Array.isArray(s.results) ? s.results : [] }));
    return w;
  } catch {}
  return null;
}
function persistWork(w) {
  try {
    sessionStorage.setItem(WORK_KEY, JSON.stringify(w));
  } catch {
    // Almost always the ~5 MB browser quota on a very long run. Drop the previous
    // copy to free its space and try once more; if it still won't fit, carry on
    // without saving rather than breaking the run in progress.
    try {
      sessionStorage.removeItem(WORK_KEY);
      sessionStorage.setItem(WORK_KEY, JSON.stringify(w));
    } catch {}
  }
}
function clearWork() {
  try {
    sessionStorage.removeItem(WORK_KEY);
  } catch {}
}

/* ------------------------------------------------------------------ */
/*  SMALL UI BITS                                                      */
/* ------------------------------------------------------------------ */
function Toggle({ active, onClick, children, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...sans,
        backgroundColor: active ? C.brown : C.cardAlt,
        color: active ? "#fff" : C.inkSoft,
        border: `1px solid ${active ? C.brown : C.line}`,
      }}
      className="px-3.5 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors"
    >
      {Icon && <Icon size={13} />}
      {children}
    </button>
  );
}

// A section heading — the quiet overline shared across the whole app.
function Label({ children }) {
  return (
    <div style={{ ...overline, color: C.muted }} className="text-[10px] mb-2">
      {children}
    </div>
  );
}

// A sub-label for an individual control inside a section: sentence case, calm,
// sits directly above its field. Used for the option groups and the wizard fields
// so those no longer shout in a second row of uppercase.
function FieldLabel({ children }) {
  return (
    <div style={{ ...sans, color: C.inkSoft }} className="text-[11px] font-medium mb-1.5">
      {children}
    </div>
  );
}

/* One shared shape for every inline advisory — the long-script heads-up and any
   caution the app needs to raise inline. It speaks in the same grammar as the toast
   that slides up from the corner: a tinted round icon, a quiet eyebrow, then the
   message in plain sans. Each notice used to draw its own coloured left border; this
   is the single place that look now lives. */
const NOTICE_TONES = {
  info: { accent: (c) => c.brown, icon: Info },
  warn: { accent: (c) => c.amber, icon: AlertTriangle },
  error: { accent: (c) => c.red, icon: AlertTriangle },
};
function Notice({ tone = "info", title, icon, children, action, className = "" }) {
  const t = NOTICE_TONES[tone] || NOTICE_TONES.info;
  const accent = t.accent(C);
  const Icon = icon || t.icon;
  const tintAlpha = C === DARK ? "2e" : "1a"; // ~18% on dark, ~10% on light
  return (
    <div
      style={{ backgroundColor: C.card, border: `1px solid ${C.line}` }}
      className={`rounded-xl px-4 py-3.5 flex items-start gap-3 ${className}`}
    >
      <div
        style={{ backgroundColor: accent + tintAlpha }}
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
      >
        <Icon size={14} style={{ color: accent }} />
      </div>
      <div className="min-w-0 flex-1">
        {title && <div style={{ ...overline, color: C.muted }} className="text-[9px]">{title}</div>}
        <div style={{ ...sans, color: C.inkSoft }} className="text-[12.5px] leading-[1.55] mt-0.5">
          {children}
        </div>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

/* The search box on a scene holds what you are typing to itself, and only hands
   it up to the page when you commit it — Enter, Escape, or clicking away.

   It used to write every single character straight into the main screen, which
   re-drew every scene and every thumbnail on the page. Measured on a 100-scene
   script: 215ms per keystroke, 852ms on the first one, so a word typed at normal
   speed landed about a second and a half late. Keeping the half-typed text down
   here costs nothing, and the page above it stays still. */
function KeywordInput({ value, onCommit }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => { if (e.key === "Enter") onCommit(draft); if (e.key === "Escape") onCommit(""); }}
      style={{ ...mono, backgroundColor: C.card, border: `1px solid ${C.brown}`, color: C.inkSoft }}
      className="text-[11px] px-2 py-0.5 rounded outline-none w-64 max-w-full"
    />
  );
}

// Sits between every pair of scenes and once at the end. Deliberately quiet — a
// dashed seam that lights up under the cursor — so a hundred of them down a long
// script read as hairlines rather than clutter. On touch there is no cursor to
// light it up, so the ff-seam rules bring it most of the way out and fatten it.
function PlusRow({ at, act }) {
  return (
    <button
      onClick={() => act.current.insertScene(at)}
      title="Add an extra scene here, with your own search words"
      className="ff-seam w-full flex items-center gap-2 opacity-30 hover:opacity-100 transition-opacity"
    >
      <span style={{ borderTop: `1px dashed ${C.line}` }} className="flex-1" />
      <span
        style={{ ...sans, border: `1px dashed ${C.line}`, backgroundColor: C.card, color: C.brown }}
        className="ff-chip inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
      >
        <Plus size={10} /> Add a search
      </span>
      <span style={{ borderTop: `1px dashed ${C.line}` }} className="flex-1" />
    </button>
  );
}

// What a scene with nothing ticked is handed, so every such card gets the same
// object and never redraws just because a new empty one was made.
const NO_PICKS = { set: new Set(), sig: "" };

/* One scene: its line, its search, its tools and its clips.

   Its own component so that it redraws ONLY when something about THIS scene
   changes. Before, every scene and every thumbnail on the page redrew on every
   change anywhere — one clip picked, one letter typed into the script, the
   countdown ticking once a second during a run. Measured on a 120-scene run:
   0.34–0.53s per pick and 0.22–0.29s per typed letter, and during a run the
   page was asked to redraw about six times a second, more than it could keep up
   with. Now a pick redraws one card.

   What it is told about the rest of the page:
     total       — the scene count, for zero-padding download file numbers
     picked      — which of this scene's clips are ticked (pickedSig is the
                   same list as text, so it can be compared cheaply)
     act         — a ref holding the page's handlers. The ref never changes, so
                   it never forces a redraw, and act.current always holds the
                   newest version of each handler.
   theme is passed even though colours are read from C, so that flipping light
   and dark still redraws every card. */
const SceneCard = React.memo(function SceneCard({ s, i, total, busy, isEditing, picked, orientation, quality, act }) {
  return (
    <React.Fragment>
      <PlusRow at={i} act={act} />
      <div style={{ backgroundColor: C.cardAlt, border: `1px solid ${C.line}`, contentVisibility: "auto", containIntrinsicSize: "1px 640px" }} className="ff-scene rounded-lg overflow-hidden">
        {/* scene head */}
        <div className="px-4 pt-3.5 pb-3">
          <div className="ff-head flex items-start gap-3">
            {/* the scene number is a display moment — serif, like the stat
                numerals — not working-UI text, so it reads as a heading for
                the row rather than another label. */}
            <span style={{ ...serif, color: C.brown }} className="text-[15px] font-semibold pt-0.5 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <div className="flex-1 min-w-0">
              <div style={{ color: s.inserted ? C.muted : C.ink, fontStyle: s.inserted ? "italic" : "normal" }} className="text-[14px] leading-snug">{s.line}</div>
              <div className="flex items-center gap-2 mt-1.5">
                <span style={{ color: C.muted }}>→</span>
                {isEditing ? (
                  <KeywordInput value={s.keyword} onCommit={(kw) => act.current.applyKeyword(s, kw)} />
                ) : (
                  <button
                    onClick={() => act.current.setEditing(s.id)}
                    style={{ ...mono, color: C.inkSoft }}
                    className="text-[11px] inline-flex items-center gap-1.5 group"
                    title="These are the words used to search the stock websites for this scene. Click to type your own."
                  >
                    {s.keyword ? `"${s.keyword}"` : "type your search here"}
                    <span
                      style={{ ...sans, color: C.brown, border: `1px solid ${C.line}`, backgroundColor: C.card }}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium group-hover:opacity-80"
                    >
                      <Pencil size={9} /> edit
                    </span>
                  </button>
                )}
              </div>
            </div>
            <div className="ff-tools flex items-center gap-1.5">
              {(() => { const ori = s.orientation || orientation; return (
                <div style={{ border: `1px solid ${C.line}`, backgroundColor: C.card }} className="flex rounded overflow-hidden mr-0.5">
                  <button onClick={() => act.current.setSceneOrientation(s, "landscape")} disabled={busy} title="Wide clips (for normal YouTube videos), for this scene only" style={{ backgroundColor: ori === "landscape" ? C.brown : "transparent", color: ori === "landscape" ? "#fff" : C.inkSoft }} className="p-1.5 hover:opacity-80 disabled:opacity-40"><Monitor size={13} /></button>
                  <button onClick={() => act.current.setSceneOrientation(s, "portrait")} disabled={busy} title="Tall clips (for Shorts and Reels), for this scene only" style={{ backgroundColor: ori === "portrait" ? C.brown : "transparent", color: ori === "portrait" ? "#fff" : C.inkSoft }} className="p-1.5 hover:opacity-80 disabled:opacity-40"><Smartphone size={13} /></button>
                </div>
              ); })()}
              <button onClick={() => act.current.shuffleScene(s)} disabled={busy} title="Shuffle: show different clips for the same search words" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="p-1.5 rounded hover:opacity-80 disabled:opacity-40"><Shuffle size={13} /></button>
              {s.inserted ? (
                // This one's yours, not the AI's. There's no script line behind it
                // to spin a fresh angle from, so the slot removes it instead.
                <button onClick={() => act.current.removeScene(s.id)} disabled={busy} title="Remove this extra scene" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="p-1.5 rounded hover:opacity-80 disabled:opacity-40"><Trash2 size={13} /></button>
              ) : (
                <button onClick={() => act.current.regenScene(s)} disabled={busy} title="Regenerate: ask the AI for new search words, then search again" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="p-1.5 rounded hover:opacity-80 disabled:opacity-40"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /></button>
              )}
            </div>
          </div>
        </div>

        {/* grid */}
        <div className="px-4 pb-3 relative">
          {busy && (
            <div style={{ backgroundColor: C.veil }} className="absolute inset-0 z-10 flex items-center justify-center rounded">
              <Loader2 className="animate-spin" style={{ color: C.brown }} size={20} />
            </div>
          )}
          {s.results.length === 0 ? (
            // A card that's still waiting its turn says so, instead of
            // wrongly telling you there's nothing to find.
            s.loading ? (
              <div style={{ ...sans, color: C.muted }} className="ff-pending text-[12px] py-6 text-center flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={13} /> Finding footage…
              </div>
            ) : !s.keyword || !s.keyword.trim() ? (
              // A row you added yourself, before you've typed anything into
              // it. Telling this one to "try Regenerate" would be useless —
              // it has no Regenerate button, and nothing to rewrite.
              <div style={{ ...sans, color: C.muted }} className="text-[12px] py-6 text-center">Type what you'd like to see in the box above (for example "child laughing in a park"), then press Enter.</div>
            ) : s.inserted ? (
              <div style={{ ...sans, color: C.muted }} className="text-[12px] py-6 text-center">No clips matched those words. Click the words above and try something simpler, or press Shuffle.</div>
            ) : (
              <div style={{ ...sans, color: C.muted }} className="text-[12px] py-6 text-center">No clips matched this scene's search words. Press Shuffle to look again, or Regenerate to get new search words from the AI.</div>
            )
          ) : (
            // Always the neat responsive grid — 2 columns on phones, 4 on
            // desktop — no matter the clips-per-scene setting. (It used to
            // narrow to 2 columns for "2 clips" back when that meant only 2
            // tiles; now "2 clips" can be 6-8 tiles per source, so it needs
            // the same tidy 4-wide layout that "4 clips" uses.)
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
              {s.results.map((r) => {
                const sel = picked.has(r.id);
                return (
                  <div
                    key={r.id}
                    onClick={() => act.current.toggleSel(r, s.id)}
                    title={sel ? "Chosen. Click again to un-choose it." : "Click to choose this clip. Chosen clips collect in the bar at the bottom, so you can download them all together."}
                    onMouseEnter={(e) => {
                      const v = e.currentTarget.querySelector("video");
                      if (!v) return;
                      v.style.opacity = "1";   // make visible BEFORE play()...
                      v.dataset.hover = "1";
                      // The clip is only attached now, on hover (see the <video> below).
                      if (!v.getAttribute("src")) v.src = v.dataset.src;
                      requestAnimationFrame(() => {   // ...and wait one frame so Chrome sees it as visible, else it pauses muted video as hidden "background media"
                        if (v.dataset.hover !== "1") return; // mouse already left
                        try { v.currentTime = 0; } catch {}
                        const p = v.play();
                        if (p && p.catch) p.catch(() => {});
                      });
                    }}
                    onMouseLeave={(e) => {
                      const v = e.currentTarget.querySelector("video");
                      if (!v) return;
                      v.dataset.hover = "";
                      v.style.opacity = "0";
                      v.pause();
                      try { v.currentTime = 0; } catch {}
                      // A paused clip kept downloading in the background and held
                      // on to its player, so sweeping the mouse across a page of
                      // tiles left dozens of them running. Let go of the clip once
                      // the 200ms fade-out has finished — unless the mouse came
                      // straight back, in which case it is playing again.
                      setTimeout(() => {
                        if (v.dataset.hover === "1" || !v.getAttribute("src")) return;
                        v.removeAttribute("src");
                        v.load();
                      }, 250);
                    }}
                    className="ff-tile group relative rounded-md overflow-hidden cursor-pointer"
                    style={{ aspectRatio: (s.orientation || orientation) === "portrait" ? "9/16" : "16/10", border: sel ? `2px solid ${C.brown}` : `1px solid ${C.line}`, backgroundColor: C.thumbBg }}
                  >
                    {r.thumb ? (
                      <img src={r.thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Film size={18} style={{ color: C.muted }} /></div>
                    )}
                    {/* hover-to-preview inline video (muted, loops). Opacity is driven
                        by the tile's mouseenter/leave handlers, not group-hover, so the
                        element is visible at the moment play() runs — otherwise Chrome
                        pauses it as hidden "background media".

                        No src and no poster until the mouse arrives. The poster
                        used to download every video's thumbnail the moment the
                        page drew — measured, all 960 on a 120-scene run, while the
                        lazy <img> above fetched only the 3 scenes on screen — and
                        on a phone, where there is no hover, all of it was wasted.
                        The poster was never seen anyway: until the first frame
                        arrives, an empty player is see-through, so the same
                        thumbnail shows from the <img> underneath it. */}
                    {r.type === "video" && r.preview && (
                      <video
                        data-src={r.preview}
                        muted
                        loop
                        playsInline
                        preload="none"
                        style={{ opacity: 0 }}
                        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200 pointer-events-none"
                      />
                    )}
                    {/* type tag */}
                    <span
                      style={{ backgroundColor: r.type === "video" ? "rgba(57,39,26,0.9)" : C.green, ...sans }}
                      className="absolute top-1.5 left-1.5 text-[9px] text-white px-1.5 py-0.5 rounded font-medium capitalize flex items-center gap-1"
                    >
                      {r.type === "video" ? <Play size={7} /> : <span className="w-1.5 h-1.5 bg-white inline-block rounded-[1px]" />}
                      {r.type}
                    </span>
                    {/* selected check */}
                    {sel && (
                      <span style={{ backgroundColor: C.brown }} className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center">
                        <Check size={10} color="#fff" />
                      </span>
                    )}
                    {/* Action bar. On a mouse it fades in on hover; on a touch screen
                        the ff-* classes above pin it open and shrink it to icons, since
                        there is no hover to reveal it and no room for three labels. */}
                    <div style={{ background: "linear-gradient(to top, rgba(57,39,26,0.92), rgba(57,39,26,0.15) 55%, transparent)" }} className="ff-actions absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end pointer-events-none">
                      <div className="ff-bar p-2">
                        <div style={{ ...sans }} className="ff-src text-[9px] text-white/85 mb-1 truncate">{r.label}</div>
                        <div className="flex items-center gap-1.5">
                          {r.type === "video" && r.preview && (
                            <button onClick={(e) => { e.stopPropagation(); act.current.setPlaying({ ...r, _seq: i + 1, _total: total, _kw: s.keyword }); }} title="Watch this clip bigger, with sound" style={{ ...sans }} className="pointer-events-auto flex items-center gap-1 text-[10px] font-medium text-white bg-white/15 hover:bg-white/25 px-1.5 py-1 rounded">
                              <Play size={9} /> <span className="ff-lbl">Expand</span>
                            </button>
                          )}
                          <DownloadButton item={r} seq={i + 1} total={total} keyword={s.keyword} quality={quality} variant="tile" />
                          <button onClick={(e) => { e.stopPropagation(); window.open(r.url, "_blank"); }} title="Open this clip's page on the stock website (Pexels or Pixabay)" style={{ ...sans }} className="pointer-events-auto flex items-center gap-1 text-[10px] font-medium text-white bg-white/15 hover:bg-white/25 px-1.5 py-1 rounded">
                            <ExternalLink size={9} /> <span className="ff-lbl">View</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* scene foot */}
        <div style={{ borderTop: `1px solid ${C.line}` }} className="px-4 py-2 flex items-center justify-between">
          <span style={{ ...sans, color: C.muted }} className="text-[11px]">{s.results.length} results</span>
          <div className="ff-foot flex items-center gap-1.5">
            <button onClick={() => act.current.selectAll(s)} style={{ ...sans, border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="text-[11px] font-medium px-2.5 py-1 rounded hover:opacity-80">Select all</button>
            <button onClick={() => act.current.clearScene(s)} style={{ ...sans, border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="text-[11px] font-medium px-2.5 py-1 rounded hover:opacity-80">Clear</button>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}, (a, b) =>
  a.s === b.s && a.i === b.i && a.total === b.total && a.busy === b.busy &&
  a.isEditing === b.isEditing && a.pickedSig === b.pickedSig &&
  a.orientation === b.orientation && a.quality === b.quality && a.theme === b.theme
);

/* ------------------------------------------------------------------ */
/*  MAIN                                                               */
/* ------------------------------------------------------------------ */
function FootageFinder() {
  const [booted, setBooted] = useState(false);
  const [stage, setStage] = useState("wizard"); // wizard | app
  const [returning, setReturning] = useState(false);

  // settings
  const [toolName, setToolName] = useState("Footage Finder");
  const [creator, setCreator] = useState("");
  const [pexelsKey, setPexelsKey] = useState("");
  const [pexelsKey2, setPexelsKey2] = useState("");
  const [pexelsKey3, setPexelsKey3] = useState("");
  const [pixabayKey, setPixabayKey] = useState("");
  const [pixabayKey2, setPixabayKey2] = useState("");
  const [pixabayKey3, setPixabayKey3] = useState("");
  const [mediaTypes, setMediaTypes] = useState({ videos: true, photos: true });
  const [sources, setSources] = useState({ pexels: true, pixabay: false });
  const [orientation, setOrientation] = useState("landscape"); // landscape | portrait
  const [perScene, setPerScene] = useState(4); // clips fetched & shown per scene: 2 or 4
  // Download quality: "1080" (default — lighter files that still fill a 1080p
  // timeline) or "max" (whatever the site's biggest file is, often 4K). This only
  // changes WHICH file of the same clip is saved; searches and results are identical.
  const [quality, setQuality] = useState("1080");

  // theme (light | dark) — persisted separately so it applies before settings load
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("ff_theme") === "dark" ? "dark" : "light"; } catch { return "light"; }
  });
  applyTheme(theme); // point C at the active palette before anything renders
  function toggleTheme() {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try { localStorage.setItem("ff_theme", next); } catch {}
      return next;
    });
  }

  // workspace
  const [script, setScript] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [status, setStatus] = useState("Paste your video script into the box above, then press Analyse. The tool splits it into scenes and finds stock clips for each one.");
  const [statusErr, setStatusErr] = useState(false);
  const [scenes, setScenes] = useState([]);
  const [selected, setSelected] = useState({});
  const [zipping, setZipping] = useState(null); // null when idle, else {done,total,packing}
  const [dismissWarn, setDismissWarn] = useState(false); // long-script heads-up dismissed?
  const [sceneBusy, setSceneBusy] = useState({});
  const [editing, setEditing] = useState(null);
  const [playing, setPlaying] = useState(null);

  // ── Floating notice ──────────────────────────────────────────────────────
  // Short heads-ups about a setting you just changed. These used to sit under
  // the Options row permanently: they pushed the layout down and kept talking
  // long after you'd read them. Now one slides in the moment you flip a switch
  // and fades out on its own after a few seconds.
  // `id` bumps on every call so React remounts the card and the animation
  // restarts even if the same message fires twice in a row.
  const [toast, setToast] = useState(null); // { id, text } | null
  const toastTimer = useRef(null);
  function showToast(text) {
    clearTimeout(toastTimer.current);
    // Long enough to actually read: about a third of a second per word, never
    // under 6 seconds. The notices now explain themselves properly, so some run
    // to 50+ words, and a fixed 6 seconds took them away mid-sentence.
    const ms = Math.max(6000, text.split(/\s+/).length * 330);
    setToast({ id: Date.now(), text, ms });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }
  _notify = showToast; // lets a failed download speak up (see downloadMedia)
  function hideToast() {
    clearTimeout(toastTimer.current);
    setToast(null);
  }
  useEffect(() => () => clearTimeout(toastTimer.current), []); // don't leave a timer running

  // Escape closes the full-screen player. Clicking the dark surround already
  // closed it, but Escape is what everyone's hands reach for first, and on a
  // big clip there may be barely any surround left to click.
  useEffect(() => {
    if (!playing) return;
    const onKey = (e) => { if (e.key === "Escape") setPlaying(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  // "is anything actually happening?" — a countdown plus a rotating fun fact, so a
  // long run never looks frozen. startedAt/now are timestamps (not a tick counter)
  // so elapsed time stays correct even if a render is skipped.
  const [factIdx, setFactIdx] = useState(0);
  const [etaSec, setEtaSec] = useState(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);

  /* boot */
  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      if (s && (s.pexelsKey || s.pixabayKey)) {
        setToolName(s.toolName || "Footage Finder");
        setCreator(s.creator || "");
        setPexelsKey(s.pexelsKey || "");
        setPexelsKey2(s.pexelsKey2 || "");
        setPexelsKey3(s.pexelsKey3 || "");
        setPixabayKey(s.pixabayKey || "");
        setPixabayKey2(s.pixabayKey2 || "");
        setPixabayKey3(s.pixabayKey3 || "");
        setMediaTypes(s.mediaTypes || { videos: true, photos: true });
        setSources(s.sources || { pexels: true, pixabay: false });
        setOrientation(s.orientation === "portrait" ? "portrait" : "landscape");
        setPerScene(s.perScene === 2 ? 2 : 4);
        setQuality(s.quality === "max" ? "max" : "1080");
        setStage("app");
        setReturning(true);

        // Bring the last workspace back. This is what makes a refresh survivable:
        // the script, the scenes and which clips were ticked all return exactly as
        // they were, so you never re-paste and re-run just because a tab reloaded.
        // Only a refresh, though — see the note on WORK_KEY. Close the tab and you
        // come back to an empty box, ready for the next video.
        const w = loadWork();
        const n = w ? w.scenes.length : 0;
        if (w && (w.script || n)) {
          setScript(w.script || "");
          setScenes(w.scenes);
          setSelected(w.selected || {});
        }
        // Worded for what actually just happened: a reload, not a return after
        // days away. "Welcome back" read as odd when it appeared right after F5.
        setStatus(
          n
            ? `Your last results are still here (${n} scene${n === 1 ? "" : "s"}), because the page was only refreshed. Press Analyse to run the script again, or Start new video to clear it.`
            : w && w.script
            ? "Your script is still here. Press Analyse when you're ready."
            : "Paste your video script into the box above, then press Analyse. The tool splits it into scenes and finds stock clips for each one."
        );
      }
      setBooted(true);
    })();
  }, []);

  // Save the workspace whenever it settles. The debounce does double duty: it keeps
  // typing from writing on every keystroke, and because phase 2 repaints the scene
  // list every 400 ms it also means a long run writes once at the end instead of a
  // hundred times mid-flight. `loading` is stripped on the way in and out.
  useEffect(() => {
    if (!booted) return;
    const t = setTimeout(() => {
      if (!script.trim() && scenes.length === 0) {
        clearWork();
        return;
      }
      persistWork({
        script,
        scenes: scenes.map((s) => ({ ...s, loading: false })),
        selected,
        savedAt: Date.now(),
      });
    }, 800);
    return () => clearTimeout(t);
  }, [booted, script, scenes, selected]);

  // While a run is in flight: tick the clock every second (that's what makes the
  // countdown move) and rotate the fun fact every 12 seconds. Both intervals only
  // exist while analysing, so an idle page does no work at all.
  //
  // 12s, not the 7s it used to be: 7 was long enough to READ a line but not long
  // enough to read it, look away at the progress bar, and look back. The user
  // reported the facts felt rushed, and a fact you half-read is worse than none.
  useEffect(() => {
    if (!analyzing) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    const f = setInterval(() => setFactIdx((n) => (n + 1) % FACTS.length), 12000);
    return () => {
      clearInterval(t);
      clearInterval(f);
    };
  }, [analyzing]);

  const saveAll = (extra = {}) =>
    persist({ toolName, creator, pexelsKey, pexelsKey2, pexelsKey3, pixabayKey, pixabayKey2, pixabayKey3, mediaTypes, sources, orientation, perScene, quality, ...extra });

  // The key lists handed to searchScene: primary first, then any backups, empty
  // ones filtered out. withKeyRotation() falls to the next only on a rate limit,
  // so 2-3 keys from separate free accounts multiply the usable quota.
  const pexelsKeys = [pexelsKey, pexelsKey2, pexelsKey3].map((k) => k.trim()).filter(Boolean);
  const pixabayKeys = [pixabayKey, pixabayKey2, pixabayKey3].map((k) => k.trim()).filter(Boolean);

  /* stats */
  const stats = useMemo(() => {
    let total = 0, v = 0, p = 0;
    scenes.forEach((s) =>
      s.results.forEach((r) => {
        total++;
        if (r.type === "video") v++;
        else p++;
      })
    );
    return { total, scenes: scenes.length, v, p };
  }, [scenes]);

  const selectedCount = Object.keys(selected).length;

  // The ticks grouped by scene, worked out once per change to the selection
  // rather than once per thumbnail. Each scene card is handed only its own
  // ticks, so picking a clip in scene 3 leaves every other card alone.
  const pickedByScene = useMemo(() => {
    const ids = new Map();
    for (const k of Object.keys(selected)) {
      const at = k.indexOf("|"); // selKey() is "sceneId|clipId"
      const sid = k.slice(0, at);
      if (!ids.has(sid)) ids.set(sid, []);
      ids.get(sid).push(k.slice(at + 1));
    }
    const out = new Map();
    ids.forEach((list, sid) => {
      list.sort();
      out.set(sid, { set: new Set(list), sig: list.join(",") });
    });
    return out;
  }, [selected]);

  // The rough scene count of the pasted script. Two notices below need it, and
  // it was being worked out twice on every redraw — including every second of
  // the countdown — instead of once whenever the script actually changes.
  const roughSceneCount = useMemo(() => (splitIntoScenes(script) || []).length, [script]);

  // The scene cards call the page's handlers through this. The ref itself never
  // changes (so it never makes a card redraw), and it is refreshed on every
  // render below, so a card always reaches the newest version of each handler.
  const act = useRef(null);

  // Countdown text under the progress bar. Falls back to a plain elapsed counter if
  // we never got an estimate, so it always says something truthful.
  const elapsedSec = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  const etaLabel = (() => {
    if (!etaSec) return `Working… ${fmtDuration(elapsedSec)} so far`;
    const left = etaSec - elapsedSec;
    if (left <= 0) return `Almost done… ${fmtDuration(elapsedSec)} so far`;
    return `About ${fmtDuration(left)} to go · ${fmtDuration(elapsedSec)} so far`;
  })();

  /* start over */
  // Closing the tab already clears everything (see WORK_KEY). This is the same
  // fresh start WITHOUT closing the tab — the user's real complaint was having to
  // select a whole script by hand before pasting the next one.
  //
  // Confirm first, because it throws away finished work: a run costs minutes and
  // some of the picked clips may not be downloaded yet. Only asks when there is
  // actually something to lose.
  function startNew() {
    if ((script.trim() || scenes.length) && !confirm("Clear this script and all its clips, and start a new video?")) return;
    setScript("");
    setScenes([]);
    setSelected({});
    setPlaying(null);
    // Reset the run-status trimmings too, or a stale "About 2m left" or an old
    // long-script warning would sit over a page that is now empty.
    setProgress(null);
    setStatusErr(false);
    setDismissWarn(false);
    setEtaSec(null);
    setStartedAt(0);
    clearWork();
    setStatus("Cleared. Paste your next script.");
  }

  /* analysis */
  async function runAnalysis() {
    if (!script.trim()) {
      setStatus("Paste your script into the box above first, then press Analyse.");
      setStatusErr(true);
      return;
    }
    if (!(sources.pexels && pexelsKeys.length) && !(sources.pixabay && pixabayKeys.length)) {
      setStatus("No stock website is switched on, so there is nowhere to search. Under Options, turn on Pexels or Pixabay. If one won't switch on, it has no key yet: open Settings (the gear button, top right) and add one.");
      setStatusErr(true);
      return;
    }
    setAnalyzing(true);
    setStatusErr(false);
    setScenes([]);
    setSelected({});
    // Start the clock and show a first estimate straight away, guessed from the
    // sentence count. It gets replaced with the real one the moment the AI has
    // split the script — but the user sees a number immediately either way.
    setStartedAt(Date.now());
    setNow(Date.now());
    setFactIdx(0);
    setEtaSec(estimateSeconds({ sceneCount: Math.max(1, (splitIntoScenes(script) || []).length) }));
    // Fresh notepad for AI trouble — this run's problems only, not last run's.
    resetAITrouble();
    try {
      // Break the script into filmable beats via the AI (one action per scene).
      // Fall back to the coarse sentence splitter if that step fails for any reason.
      setProgress({ pct: 4, label: "Splitting your script into scenes…" });
      let lines;
      try {
        lines = await segmentScript(script);
        if (!lines || lines.length === 0) lines = splitIntoScenes(script);
      } catch (e) {
        noteAITrouble(e);
        lines = splitIntoScenes(script);
      }
      // Now we know the real scene count, so re-estimate against it.
      setEtaSec(estimateSeconds({ sceneCount: lines.length }));
      // phase 1 — keywords in batches (full context)
      // KEYWORD_BATCH scenes per call: fewer round-trips = much faster on long
      // scripts. The FULL script still rides along in every call, so context and
      // drift are unchanged.
      const size = KEYWORD_BATCH;
      const batches = [];
      for (let i = 0; i < lines.length; i += size) batches.push(lines.slice(i, i + size));
      // All batches go out at once. That sounds reckless, but throttleGemini
      // still holds every call GEMINI_MIN_GAP_MS apart, so this uses exactly the
      // same number of requests at exactly the same rate as the old one-at-a-time
      // loop — it just stops waiting for each reply before sending the next.
      let doneBatches = 0;
      setProgress({ pct: 6, label: `Writing search words for each scene…` });
      const settledBatches = await Promise.allSettled(
        batches.map((b) =>
          generateKeywords(script, b).then((r) => {
            doneBatches++;
            setProgress({ pct: 6 + (doneBatches / batches.length) * 29, label: `Writing search words… ${Math.round((doneBatches / batches.length) * 100)}% done` });
            return r;
          })
        )
      );
      // allSettled keeps the original order, so keywords[i] still lines up with
      // lines[i]. If any batch genuinely failed, fail the run like before.
      const failed = settledBatches.find((s) => s.status === "rejected");
      if (failed) throw failed.reason;
      const keywords = settledBatches.flatMap((s) => s.value);
      // phase 2 — search each scene
      // Every card is put on screen straight away with its line and its keyword,
      // so you can read the whole shot list while the clips are still arriving.
      // SCENE_POOL scenes are searched at once instead of one at a time, which is
      // the single biggest speed win in the tool — same number of requests, just
      // not standing in a queue. The ids carry a per-run stamp so an inserted
      // scene can never collide with one from an earlier run.
      const runId = Date.now().toString(36);
      const acc = lines.map((line, i) => ({
        id: `sc-${runId}-${i}`,
        line,
        keyword: keywords[i],
        page: 1,
        results: [],
        orientation,
        perScene,
        loading: true,
      }));
      let shown = acc.map((s) => ({ ...s }));
      setScenes(shown);
      let rateHit = false, finished = 0;
      // Redraw at most a few times a second rather than once per finished scene:
      // with 100 scenes that's the difference between a smooth fill and a stutter.
      //
      // Only the scenes that finished since the last redraw get a fresh copy.
      // Every other card keeps the very same object it already had, which is
      // what lets it skip redrawing (see SceneCard). Copying all of them every
      // 400ms made every card on the page redraw, finished or not.
      const changed = new Set();
      const flush = () => {
        if (!changed.size) return;
        shown = shown.slice();
        changed.forEach((i) => { shown[i] = { ...acc[i] }; });
        changed.clear();
        setScenes(shown);
      };
      const flushTimer = setInterval(flush, 400);
      try {
        let cursor = 0;
        // Every clip already handed to an earlier scene in this run. See the
        // note in the worker below for why this exists.
        const usedIds = new Set();
        const worker = async () => {
          for (;;) {
            const i = cursor++;
            if (i >= acc.length) return;
            try {
              const found = await searchScene(keywords[i], { pexelsKeys, pixabayKeys, sources, mediaTypes, orientation, perPage: perScene, page: 1 });
              // Never hand the SAME clip to two different scenes.
              //
              // The cause is the stock library, not this code. Measured against
              // real Pexels on 2026-09-02, on a 33-scene script: the full rich
              // query found clips 33 times out of 33, so the broadening
              // fallback in searchScene never even fired. The repeats come from
              // DIFFERENT rich queries landing on the SAME clip, because the
              // free libraries are small — "eye close-up macro" and "child
              // looking at screen" both returned pexels' eye-close-up video.
              // 5 clips turned up in more than one scene that way, which is why
              // one stray clip seemed to follow the viewer through the video.
              //
              // Prefer clips no earlier scene took. If that would leave this
              // scene with nothing at all, keep what it found — a slightly
              // repeated clip beats an empty card. Measured after this fix on a
              // 21-scene run: 156 clips, 156 different clips, 12 trimmed here.
              const fresh = found.filter((r) => !usedIds.has(r.id));
              acc[i].results = fresh.length ? fresh : found;
              acc[i].results.forEach((r) => usedIds.add(r.id));
            } catch (err) {
              if (err.message === "PEXELS_RATE") rateHit = true; // keep going, just no results for this scene
              else throw err; // real errors (auth, Claude) still abort
            }
            acc[i].loading = false;
            changed.add(i);
            finished++;
            setProgress({ pct: 35 + (finished / acc.length) * 65, label: `Searching the stock websites… ${finished} of ${acc.length} scenes done` });
          }
        };
        const settled = await Promise.allSettled(
          Array.from({ length: Math.min(SCENE_POOL, acc.length) }, worker)
        );
        const bad = settled.find((s) => s.status === "rejected");
        if (bad) throw bad.reason;
      } finally {
        clearInterval(flushTimer);
        // Land EVERY card, whatever happened. Previously a scene whose search
        // threw (a rejected Pexels key is the one that escapes searchScene)
        // never reached `acc[i].loading = false`, so its card sat on "Finding
        // footage..." FOREVER — the run had already ended and the error message
        // was showing, but twelve cards were still breathing away as if they
        // were working. That is the "it never gives me the footage" symptom.
        // Measured 2026-09-02: run ended at ~21s, cards still pending at 110s.
        acc.forEach((s, i) => { if (s.loading) { s.loading = false; changed.add(i); } });
        flush();
      }
      const total = acc.reduce((n, s) => n + s.results.length, 0);
      // Order matters. A dead AI is the root cause and the only thing here the
      // user can actually act on, so it speaks first. We only speak up when the
      // OUTPUT suffered: if the AI wrote every keyword, a hiccup in the scene
      // split earlier is not worth a warning.
      if (aiTrouble.wrote === 0 && aiTrouble.fellBack > 0) {
        // Nothing came back from the AI all run. The clips on screen were found
        // using the script's own sentences, which is a much rougher search.
        setStatus(aiFailMessage(aiTrouble.reason) + ` Instead of AI search words, the tool searched using your script's own sentences, so these ${total} clips may not match your script well.`);
        setStatusErr(true);
      } else if (rateHit) {
        setStatus(`Done, but some scenes have few or no clips. Pexels, the stock website, allows 200 free searches an hour for each key, and this run used them up partway through. Wait a while (up to an hour), then press Shuffle on the empty scenes. A backup key in Settings gives you more searches. (${total} clips across ${acc.length} scenes.)`);
        setStatusErr(true);
      } else if (aiTrouble.fellBack > 0) {
        // The AI worked for most scenes but skipped some. Name how many, and
        // point at the button that fixes them one at a time.
        setStatus(`Done: ${total} clips across ${acc.length} scenes. For ${aiTrouble.fellBack} scene${aiTrouble.fellBack === 1 ? "" : "s"}, the AI didn't send back search words, so the tool searched using that line of your script instead. If a scene's clips look wrong, press its Regenerate button (the circle arrow) to get new AI search words.`);
        setStatusErr(true);
      } else {
        setStatus(`Done: ${total} clips across ${acc.length} scenes.`);
        setStatusErr(false);
      }
    } catch (e) {
      if (e.message === "PEXELS_AUTH") setStatus("Pexels didn't accept your key, so no clips could load. (The key is the code you copied from pexels.com during setup.) Open Settings with the gear button, top right, and check it or paste it again.");
      else if (e.message?.includes("Claude")) setStatus(aiFailMessage(e.message));
      else setStatus("Something went wrong while finding clips. Please press Analyse again. If it keeps happening, refresh the page and try once more.");
      setStatusErr(true);
    } finally {
      setAnalyzing(false);
      setProgress(null);
    }
  }

  const setBusy = (id, v) => setSceneBusy((m) => ({ ...m, [id]: v }));
  const updateScene = (id, patch) =>
    setScenes((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  // Shared message when a per-scene re-search can't get anything because Pexels
  // is rate-limited and Pixabay had nothing. Without this the scene silently
  // keeps its old footage and the button looks broken.
  const RATE_MSG = "No new clips this time. Pexels, the stock website, allows 200 free searches an hour for each key, and that has been used up for now. Wait a while (up to an hour) and try again, or add a backup key in Settings to get more searches.";
  function noteSceneError(e) {
    if (e && e.message === "PEXELS_RATE") { setStatus(RATE_MSG); setStatusErr(true); }
  }

  async function shuffleScene(s) {
    if (!s.keyword || !s.keyword.trim()) return; // nothing to search yet
    setBusy(s.id, true);
    try {
      const page = (s.page || 1) + 1;
      const results = await searchScene(s.keyword, { pexelsKeys, pixabayKeys, sources, mediaTypes, orientation: s.orientation || orientation, perPage: s.perScene || perScene, page });
      updateScene(s.id, { results: results.length ? mergeKeepingPicks(s.results, results, selected, s.id) : s.results, page });
    } catch (e) { noteSceneError(e); }
    setBusy(s.id, false);
  }
  async function regenScene(s) {
    setBusy(s.id, true);
    try {
      const idx = scenes.findIndex((x) => x.id === s.id);
      const before = idx > 0 ? scenes[idx - 1].line : "";
      const after = idx >= 0 && idx < scenes.length - 1 ? scenes[idx + 1].line : "";
      const kw = await regenKeyword(script, s.line, s.keyword, before, after);
      const results = await searchScene(kw, { pexelsKeys, pixabayKeys, sources, mediaTypes, orientation: s.orientation || orientation, perPage: s.perScene || perScene, page: 1 });
      updateScene(s.id, { keyword: kw, results: mergeKeepingPicks(s.results, results, selected, s.id), page: 1 });
    } catch (e) { noteSceneError(e); }
    setBusy(s.id, false);
  }
  async function applyKeyword(s, kw) {
    setEditing(null);
    // An inserted "+" scene that never got a search typed into it is just an empty
    // card — drop it rather than leave a dead row behind.
    if (!kw.trim()) {
      if (s.inserted && !s.keyword) removeScene(s.id);
      return;
    }
    if (kw === s.keyword) return;
    setBusy(s.id, true);
    try {
      const results = await searchScene(kw, { pexelsKeys, pixabayKeys, sources, mediaTypes, orientation: s.orientation || orientation, perPage: s.perScene || perScene, page: 1 });
      updateScene(s.id, { keyword: kw, results: mergeKeepingPicks(s.results, results, selected, s.id), page: 1 });
    } catch (e) { noteSceneError(e); }
    setBusy(s.id, false);
  }
  // Per-scene orientation override: re-run just this scene's search in the
  // chosen orientation, leaving every other scene untouched.
  async function setSceneOrientation(s, next) {
    if ((s.orientation || orientation) === next) return;
    updateScene(s.id, { orientation: next }); // reshape tiles immediately
    if (!s.keyword || !s.keyword.trim()) return; // nothing to re-search yet
    setBusy(s.id, true);
    try {
      const results = await searchScene(s.keyword, { pexelsKeys, pixabayKeys, sources, mediaTypes, orientation: next, perPage: s.perScene || perScene, page: 1 });
      updateScene(s.id, { results: results.length ? mergeKeepingPicks(s.results, results, selected, s.id) : s.results, page: 1 });
    } catch (e) { noteSceneError(e); }
    setBusy(s.id, false);
  }

  const toggleSel = (item, sceneId) =>
    setSelected((m) => {
      const n = { ...m };
      const k = selKey(sceneId, item.id);
      if (n[k]) delete n[k];
      else n[k] = item;
      return n;
    });
  const selectAll = (s) => setSelected((m) => ({ ...m, ...Object.fromEntries(s.results.map((r) => [selKey(s.id, r.id), r])) }));
  const clearScene = (s) =>
    setSelected((m) => {
      const n = { ...m };
      s.results.forEach((r) => delete n[selKey(s.id, r.id)]);
      return n;
    });

  // Drop a scene from the list. Any of its clips you had ticked go with it —
  // otherwise the download bar keeps counting footage you can no longer see.
  function removeScene(id) {
    const gone = scenes.find((s) => s.id === id);
    if (gone && gone.results.length) clearScene(gone);
    setScenes((list) => list.filter((s) => s.id !== id));
  }

  // The "+" seams. Inserting mints a scene of its own with a blank search and opens
  // the editor on it in the same motion, so one click and you're already typing.
  // Scene numbers are positional, so everything below it renumbers itself.
  function insertScene(at) {
    const id = `sc-add-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setScenes((list) => {
      const next = list.slice();
      next.splice(at, 0, {
        id,
        line: "Your own extra search",
        keyword: "",
        page: 1,
        results: [],
        orientation,
        perScene,
        loading: false,
        inserted: true, // marks it as yours, not the AI's — see the scene head
      });
      return next;
    });
    setEditing(id);
  }

  // Your picks, walked in script order rather than in the order you happened to
  // click them — so file numbers and the shot list read top-to-bottom like the
  // timeline. Each pick carries the scene it came from and that scene's search
  // words, which become part of the filename. Anything that has somehow lost its
  // scene goes last with a number of its own instead of coming out unnumbered.
  function orderedPicks() {
    const out = [];
    const seen = new Set();
    scenes.forEach((s, i) => {
      s.results.forEach((r) => {
        const k = selKey(s.id, r.id);
        if (selected[k] && !seen.has(k)) {
          seen.add(k);
          out.push({ item: selected[k], seq: i + 1, keyword: s.keyword });
        }
      });
    });
    Object.keys(selected).forEach((k) => {
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ item: selected[k], seq: scenes.length + 1, keyword: "" });
      }
    });
    return out;
  }

  async function downloadAll() {
    const picks = orderedPicks();
    const total = scenes.length;
    for (const p of picks) {
      await downloadMedia(p.item, p.seq, total, p.keyword, quality);
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  // Bundle every selected clip into ONE .zip (numbered so they import in order).
  // Fetches each file's bytes (Pexels direct, Pixabay via the proxy), skipping any
  // that fail rather than aborting the whole batch, and reports how many made it.
  async function downloadZip() {
    const picks = orderedPicks();
    if (!picks.length) return;
    setZipping({ done: 0, total: picks.length });
    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      // Fetch ZIP_POOL clips at a time instead of one after another, since most of
      // each fetch is just waiting on the network. The files still go into the zip
      // afterwards in script order, with the same names as before.
      const blobs = new Array(picks.length).fill(null);
      let cursor = 0, fetched = 0;
      const worker = async () => {
        for (;;) {
          const i = cursor++;
          if (i >= picks.length) return;
          try { blobs[i] = await fetchClipBlob(picks[i].item, quality); } catch { blobs[i] = null; }
          fetched++;
          setZipping({ done: fetched, total: picks.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(ZIP_POOL, picks.length) }, worker));
      const used = {};
      let ok = 0, failed = 0;
      for (let i = 0; i < picks.length; i++) {
        if (!blobs[i]) { failed++; continue; }
        const it = picks[i].item;
        let name = clipFileName(it, picks[i].seq, scenes.length, picks[i].keyword);
        // Guard against two clips resolving to the same filename inside the zip.
        if (used[name]) name = name.replace(/(\.[a-z0-9]+)$/i, `_${i + 1}$1`);
        used[name] = 1;
        zip.file(name, blobs[i]);
        ok++;
      }
      if (!ok) {
        setStatus("None of your chosen clips could be downloaded. Check your internet connection and try again. You can also press Files, which downloads the clips one at a time instead of in one ZIP.");
        setStatusErr(true);
        return;
      }
      const out = await zip.generateAsync({ type: "blob" }, (meta) => {
        setZipping({ done: picks.length, total: picks.length, packing: Math.round(meta.percent) });
      });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(toolName || "footage").replace(/[^a-z0-9]+/gi, "_")}_clips.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      setStatus(failed
        ? `ZIP ready with ${ok} clip${ok > 1 ? "s" : ""}. ${failed} couldn't be downloaded (usually a brief internet drop) and ${failed > 1 ? "were" : "was"} left out. Press Files to download your chosen clips one at a time instead.`
        : `ZIP ready: ${ok} clip${ok > 1 ? "s" : ""} in one file. ✓`);
      setStatusErr(false);
    } catch {
      setStatus("The ZIP tool couldn't load, probably because of a brief internet drop. Your chosen clips are still chosen. Press Download ZIP again, or press Files to download them one at a time.");
      setStatusErr(true);
    } finally {
      setZipping(null);
    }
  }
  function exportShotList() {
    const rows = [`${toolName} — Shot List`, "=".repeat(44), ""];
    scenes.forEach((s, i) => {
      const picks = s.results.filter((r) => selected[selKey(s.id, r.id)]);
      if (!picks.length) return;
      rows.push(`Scene ${i + 1}: ${s.line}`);
      rows.push(`Search: ${s.keyword}`);
      picks.forEach((p) => rows.push(`   • [${p.type}] ${p.label} — ${p.url}`));
      rows.push("");
    });
    if (rows.length <= 3) rows.push("(No clips selected yet.)");
    const blob = new Blob([rows.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(toolName || "footage").replace(/[^a-z0-9]+/gi, "_")}_shotlist.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  act.current = {
    applyKeyword, setEditing, setSceneOrientation, shuffleScene, removeScene,
    regenScene, toggleSel, selectAll, clearScene, setPlaying, insertScene,
  };

  /* ---------------------------------------------------------------- */
  if (!booted)
    return (
      <div style={{ backgroundColor: C.paper, minHeight: "100vh" }} className="w-full flex items-center justify-center">
        <Loader2 className="animate-spin" style={{ color: C.brown }} size={26} />
      </div>
    );

  if (stage === "wizard")
    return (
      <Wizard
        initial={{ toolName, creator, pexelsKey, pexelsKey2, pexelsKey3, pixabayKey, pixabayKey2, pixabayKey3 }}
        theme={theme}
        onToggleTheme={toggleTheme}
        onDone={(d) => {
          setToolName(d.toolName);
          setCreator(d.creator);
          setPexelsKey(d.pexelsKey);
          setPexelsKey2(d.pexelsKey2);
          setPexelsKey3(d.pexelsKey3);
          setPixabayKey(d.pixabayKey);
          setPixabayKey2(d.pixabayKey2);
          setPixabayKey3(d.pixabayKey3);
          const nextSources = { pexels: !!d.pexelsKey, pixabay: !!d.pixabayKey };
          setSources(nextSources);
          persist({
            toolName: d.toolName, creator: d.creator,
            pexelsKey: d.pexelsKey, pexelsKey2: d.pexelsKey2, pexelsKey3: d.pexelsKey3,
            pixabayKey: d.pixabayKey, pixabayKey2: d.pixabayKey2, pixabayKey3: d.pixabayKey3,
            mediaTypes,
            sources: nextSources,
            // Settings used to leave these two out, which silently reset your
            // orientation and clips-per-scene back to the defaults the next time
            // you refreshed — invisible until a run came back twice the size.
            orientation,
            perScene,
            quality,
          });
          setStage("app");
          setStatus("All set. Paste your video script into the box above, then press Analyse. The tool splits it into scenes and finds stock clips for each one.");
        }}
      />
    );

  /* ------------------------------- APP ---------------------------- */
  return (
    <div style={{ backgroundColor: C.paper, ...sans, minHeight: "100vh" }} className="w-full">
      <style>{`
        .ff-card{background:${C.card};border:1px solid ${C.line};}
        .ff-tile img{transition:transform .35s ease;}
        .ff-scroll::-webkit-scrollbar{height:8px;width:8px}
        .ff-scroll::-webkit-scrollbar-thumb{background:${C.line};border-radius:8px}

        /* The floating notice: rises in, sits still, then fades itself out.
           It rises from below and sinks back down because the card lives at the
           bottom of the screen. The 6s total matches the setTimeout in
           showToast(), so the card is fully faded at the moment React unmounts
           it. These rules need no theme colour and would normally live in
           index.html — they're here so this whole feature ships as one file. */
        @keyframes ffToastIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes ffToastOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(10px)}}
        .ff-toast{animation:ffToastIn .3s cubic-bezier(.22,1,.36,1) both, ffToastOut .5s ease 5.5s both;}
        @media (prefers-reduced-motion: reduce){
          .ff-toast{animation:none;opacity:1;}
        }

        /* Everything that doesn't need a theme colour — including every rule
           that makes the tool usable on a phone — lives in index.html's
           <style> instead, because this block is inside the main screen and
           so never reaches the first-run setup wizard. */
      `}</style>

      {/* Floating notice. It sits at the bottom, not the top: measured at the top
          it cleared the header but then covered the script box and the "Start new
          video" button, and your own script is the one thing on this page you must
          be able to read. Down here it lifts itself clear of the download bar when
          that bar is showing. z-index sits above the page but below the full-screen
          player, so a notice can never float over a playing clip. Soft-rounded card,
          hairline border, tinted icon badge and a small uppercase eyebrow — borrowed
          from the reference UI. */}
      {toast && (
        <div style={{ position: "fixed", bottom: selectedCount > 0 ? 78 : 22, left: 0, right: 0, zIndex: 35 }} className="flex justify-center px-4 pointer-events-none">
          <div
            key={toast.id}
            className="ff-toast pointer-events-auto flex items-start gap-3 rounded-2xl pl-3.5 pr-3 py-3"
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.line}`,
              boxShadow: theme === "dark"
                ? "0 18px 40px -12px rgba(0,0,0,0.65)"
                : "0 18px 40px -14px rgba(58,42,26,0.28)",
              maxWidth: 430,
              // The fade-out starts half a second before the notice is removed,
              // however long this particular notice stays up (see showToast).
              animationDelay: `0s, ${(toast.ms - 500) / 1000}s`,
            }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: theme === "dark" ? "rgba(192,138,90,0.18)" : "rgba(122,77,43,0.10)" }}
            >
              <Info size={14} style={{ color: C.brown }} />
            </div>
            <div className="flex-1 pt-[1px]">
              <div style={{ ...overline, color: C.muted }} className="text-[9px]">
                Heads up
              </div>
              <div style={{ ...sans, color: C.inkSoft }} className="text-[12.5px] leading-[1.55] mt-1">
                {toast.text}
              </div>
            </div>
            <button
              onClick={hideToast}
              title="Close"
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 hover:opacity-100 opacity-45 transition-opacity"
              style={{ color: C.ink }}
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-8 pb-32">
        {/* header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              style={{ backgroundColor: C.brownDark, color: "#e9ddc8", ...serif }}
              className="w-10 h-10 rounded-md flex items-center justify-center text-[13px] font-bold tracking-tight"
            >
              {(toolName.replace(/[^A-Za-z]/g, "").slice(0, 2) || "FF").toUpperCase()}
            </div>
            <div>
              <h1 style={{ ...serif, color: C.ink }} className="text-[26px] leading-none font-bold">
                {toolName.split(" ")[0]}{" "}
                <span style={{ color: C.brown, fontStyle: "italic", fontWeight: 600 }}>
                  {toolName.split(" ").slice(1).join(" ") || "Finder"}
                </span>
              </h1>
              <div style={{ ...sans, color: C.muted }} className="text-[12px] mt-1.5">
                AI-powered stock footage finder · Pexels{pixabayKey ? " & Pixabay" : ""}
              </div>
              {creator && (
                <div style={{ ...sans, color: C.muted }} className="text-[11px] mt-1">
                  Built by <span style={{ color: C.brown }} className="font-semibold">{creator}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              style={{ color: C.inkSoft, border: `1px solid ${C.line}`, backgroundColor: C.card }}
              className="p-2 rounded-md hover:opacity-80"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={() => setStage("wizard")}
              title="Settings"
              style={{ color: C.inkSoft, border: `1px solid ${C.line}`, backgroundColor: C.card }}
              className="p-2 rounded-md hover:opacity-80"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>

        {/* script */}
        <div className="mt-7">
          <div className="flex items-center gap-3 mb-2">
            <Label>Your Script</Label>
            <div style={{ borderTop: `1px solid ${C.line}` }} className="flex-1 -mt-2" />
            {/* Only shows up when there is something to clear, so an empty page stays
                clean. Sits at the end of the row, away from Analyse — this throws work
                away and should not be next to the button you press every run. */}
            {(script.trim() || scenes.length > 0) && (
              <button
                onClick={startNew}
                disabled={analyzing}
                title="Clear this script and its footage"
                style={{ color: C.inkSoft, border: `1px solid ${C.line}`, backgroundColor: C.card, ...sans }}
                className="-mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] hover:opacity-80 disabled:opacity-40"
              >
                <Trash2 size={13} />
                Start new video
              </button>
            )}
          </div>
          <textarea
            value={script}
            onChange={(e) => { setScript(e.target.value); if (!e.target.value.trim()) setDismissWarn(false); }}
            placeholder="Paste your video script here. The AI reads all of it, splits it into scenes, and finds stock clips that match what each line means, not just its words…"
            style={{ backgroundColor: C.card, border: `1px solid ${C.line}`, color: C.ink, ...sans }}
            className="w-full h-44 rounded-lg p-4 text-[14px] leading-relaxed resize-y outline-none focus:border-amber-700"
          />
        </div>

        {/* options */}
        <div className="mt-6">
          <div className="flex items-center gap-3 mb-3">
            <Label>Options</Label>
            <div style={{ borderTop: `1px solid ${C.line}` }} className="flex-1 -mt-2" />
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            <div>
              <FieldLabel>Media type</FieldLabel>
              <div className="flex gap-2">
                <Toggle icon={Play} active={mediaTypes.videos} onClick={() => { const n = { ...mediaTypes, videos: !mediaTypes.videos }; if (!n.videos && !n.photos) return; setMediaTypes(n); saveAll({ mediaTypes: n }); }}>Videos</Toggle>
                <Toggle icon={ImageIcon} active={mediaTypes.photos} onClick={() => { const n = { ...mediaTypes, photos: !mediaTypes.photos }; if (!n.videos && !n.photos) return; setMediaTypes(n); saveAll({ mediaTypes: n }); }}>Photos</Toggle>
              </div>
            </div>
            <div>
              <FieldLabel>Source</FieldLabel>
              <div className="flex gap-2">
                <Toggle active={sources.pexels} onClick={() => { if (!pexelsKey) return; const n = { ...sources, pexels: !sources.pexels }; setSources(n); saveAll({ sources: n }); }}>Pexels</Toggle>
                <Toggle active={sources.pixabay} onClick={() => { if (!pixabayKey) return; const n = { ...sources, pixabay: !sources.pixabay }; setSources(n); saveAll({ sources: n }); }}>Pixabay</Toggle>
              </div>
            </div>
            <div>
              <FieldLabel>Orientation</FieldLabel>
              <div className="flex gap-2">
                <Toggle icon={Monitor} active={orientation === "landscape"} onClick={() => { setOrientation("landscape"); saveAll({ orientation: "landscape" }); }}>Landscape</Toggle>
                <Toggle icon={Smartphone} active={orientation === "portrait"} onClick={() => { setOrientation("portrait"); saveAll({ orientation: "portrait" }); }}>Portrait</Toggle>
              </div>
            </div>
            <div>
              <FieldLabel>Clips per scene</FieldLabel>
              <div className="flex gap-2">
                <Toggle active={perScene === 2} onClick={() => { setPerScene(2); saveAll({ perScene: 2 }); }}>2</Toggle>
                <Toggle active={perScene === 4} onClick={() => {
                  setPerScene(4); saveAll({ perScene: 4 });
                  showToast("4 clips per scene means up to 4 videos and 4 photos from each stock website, so you have more to choose from. Each scene takes a little longer to load and ZIP files get bigger. It doesn't use up your hourly Pexels searches any faster: that limit counts searches, not clips.");
                }}>4</Toggle>
              </div>
            </div>
            <div>
              <FieldLabel>Download quality</FieldLabel>
              <div className="flex gap-2">
                <Toggle active={quality === "1080"} onClick={() => { setQuality("1080"); saveAll({ quality: "1080" }); }}>1080p</Toggle>
                <Toggle active={quality === "max"} onClick={() => {
                  setQuality("max"); saveAll({ quality: "max" });
                }}>Highest</Toggle>
              </div>
            </div>
          </div>

          {/* Only "4" clips per scene says anything, as the floating notice at the
              bottom of the screen. "Highest" used to as well; the user asked for
              no pop-up on it at all (2026-10-08), so it switches silently. */}
        </div>

        {/* Long-script heads-up: appears ONLY when the pasted script is big enough
            to risk the hourly limit (rough sentence count — the real quota driver
            is number of scenes, NOT the clips-per-scene setting). Dismissible. */}
        {(() => {
          const sentences = roughSceneCount;
          if (sentences < 60 || dismissWarn || analyzing) return null;
          return (
            <Notice
              tone="warn"
              title="Heads up"
              className="mt-6"
              action={
                <button onClick={() => setDismissWarn(true)} style={{ ...sans, color: C.muted }} className="text-[12px] font-medium px-2.5 py-1 rounded hover:bg-black/5">Got it</button>
              }
            >
              <span style={{ color: C.ink }} className="font-semibold">This is a long script (about {sentences} scenes).</span>{" "}
              Every scene needs its own searches on Pexels, the stock website, and Pexels allows
              200 free searches an hour for each key. A script this long may use them up before the
              end, so the last few scenes could come back empty. That's normal, not a fault. If it
              happens, wait up to an hour and press Shuffle on those scenes, or add a backup key in
              Settings to get more searches.
            </Notice>
          );
        })()}

        {/* What you're about to set off, before you set it off. The scene count and
            the clock used to appear only once the run was already under way, so
            there was no way to tell a 40-second job from a six-minute one until you
            were committed. Same two functions the run itself uses, so the number
            here is the number the countdown starts on. The AI may merge or split a
            beat or two, hence "about". */}
        {(() => {
          if (analyzing || !script.trim()) return null;
          const n = Math.max(1, roughSceneCount);
          return (
            <div style={{ ...sans, color: C.muted }} className="mt-5 flex items-center justify-center gap-2 text-[12px]">
              <Film size={12} className="flex-shrink-0" />
              <span>About {n} {n === 1 ? "scene" : "scenes"} · around {fmtDuration(estimateSeconds({ sceneCount: n }))} to find the footage</span>
            </div>
          );
        })()}

        {/* analyse */}
        <button
          onClick={runAnalysis}
          disabled={analyzing}
          style={{ backgroundColor: analyzing ? "#b3a890" : C.brownDark, color: "#f4ead7", ...sans }}
          className="w-full mt-7 py-4 rounded-lg text-[15px] font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          {analyzing && <Loader2 size={16} className="animate-spin" />}
          {analyzing ? "Finding footage…" : "Analyse script & find footage"}
        </button>

        {/* status — same grammar as the toast and the inline notices: a tinted
            round icon carrying the state (brown = working, green = done, red =
            error), then the message, the progress bar, and the rotating fact.
            The coloured left border this used to wear is gone; the icon is where
            the state lives now. */}
        {(() => {
          const tone = statusErr ? C.red : analyzing ? C.brown : C.green;
          const StatusIcon = statusErr ? AlertTriangle : analyzing ? Loader2 : CheckCircle2;
          const tintAlpha = C === DARK ? "2e" : "1a";
          return (
            <div
              style={{ backgroundColor: C.card, border: `1px solid ${C.line}` }}
              className="mt-3 rounded-xl px-4 py-3.5 flex items-start gap-3"
            >
              <div
                style={{ backgroundColor: tone + tintAlpha }}
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
              >
                <StatusIcon size={14} style={{ color: tone }} className={analyzing ? "animate-spin" : ""} />
              </div>
              <div className="min-w-0 flex-1">
                <div style={{ ...sans, color: statusErr ? C.red : C.inkSoft }} className="text-[12.5px] leading-[1.5]">
                  {progress ? progress.label : status}
                </div>
                {progress && (
                  <div style={{ backgroundColor: C.paperLine }} className="h-1 rounded mt-2 overflow-hidden">
                    <div style={{ width: `${progress.pct}%`, backgroundColor: C.brown }} className="h-full transition-all duration-300" />
                  </div>
                )}
                {/* countdown + a rotating fact, so a long run never looks frozen */}
                {analyzing && (
                  <div className="mt-2.5">
                    <div style={{ ...sans, color: C.muted }} className="text-[10.5px]">{etaLabel}</div>
                    {/* key={factIdx} on purpose: it makes React swap the element out for a
                        new one each time the fact changes, which restarts the ff-fact fade
                        so one line dissolves into the next instead of snapping over. The
                        fact is deliberately quiet — plain muted sans, not the serif — so it
                        sits behind the progress and status, never competing with them. */}
                    <div key={factIdx} style={{ ...sans, color: C.muted }} className="ff-fact text-[11.5px] mt-1.5 leading-snug">
                      {FACTS[factIdx % FACTS.length]}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* stats */}
        {scenes.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            {[
              ["Total results", stats.total],
              ["Scenes analysed", stats.scenes],
              ["Videos", stats.v],
              ["Photos", stats.p],
            ].map(([k, v]) => (
              <div key={k} className="ff-card rounded-lg px-4 py-3">
                <div style={{ ...serif, color: C.ink }} className="text-2xl font-bold">{v}</div>
                <div style={{ ...overline, color: C.muted }} className="text-[9px] mt-0.5">{k}</div>
              </div>
            ))}
          </div>
        )}

        {/* scenes */}
        <div className="mt-5 space-y-4">
          {scenes.map((s, i) => {
            const p = pickedByScene.get(s.id) || NO_PICKS;
            return (
              <SceneCard
                key={s.id}
                s={s}
                i={i}
                total={scenes.length}
                busy={!!sceneBusy[s.id]}
                isEditing={editing === s.id}
                picked={p.set}
                pickedSig={p.sig}
                orientation={orientation}
                quality={quality}
                theme={theme}
                act={act}
              />
            );
          })}
          {scenes.length > 0 && <PlusRow at={scenes.length} act={act} />}
        </div>
      </div>

      {/* selected bar */}
      {selectedCount > 0 && (
        <div style={{ backgroundColor: C.brownDark }} className="ff-dlbar fixed bottom-0 left-0 right-0 z-30 shadow-2xl">
          <div className="ff-dl max-w-5xl mx-auto px-5 sm:px-8 py-3 flex items-center justify-between gap-3">
            <div style={{ ...sans, color: "#f4ead7" }} className="text-[13px]">
              <span className="font-bold">{selectedCount}</span> clip{selectedCount > 1 ? "s" : ""} selected
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button onClick={exportShotList} disabled={!!zipping} style={{ ...sans, color: "#f4ead7", border: "1px solid rgba(244,234,215,0.3)" }} className="text-[12px] font-medium px-3 py-1.5 rounded flex items-center gap-1.5 hover:bg-white/10 disabled:opacity-40">
                <FileText size={12} /> Shot list
              </button>
              <button onClick={downloadAll} disabled={!!zipping} title="Download each chosen clip as its own file, one after another" style={{ ...sans, color: "#f4ead7", border: "1px solid rgba(244,234,215,0.3)" }} className="text-[12px] font-medium px-3 py-1.5 rounded flex items-center gap-1.5 hover:bg-white/10 disabled:opacity-40">
                <Download size={12} /> Files
              </button>
              <button onClick={downloadZip} disabled={!!zipping} title="Download all your chosen clips together, in one ZIP file" style={{ ...sans, backgroundColor: "#f4ead7", color: C.brownDark }} className="text-[12px] px-3 py-1.5 rounded flex items-center gap-1.5 font-semibold hover:opacity-90 disabled:opacity-70">
                {zipping ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    {zipping.packing != null ? `Packing ${zipping.packing}%` : `Zipping ${zipping.done}/${zipping.total}`}
                  </>
                ) : (
                  <><Package size={12} /> Download ZIP</>
                )}
              </button>
              <button onClick={() => setSelected({})} disabled={!!zipping} style={{ color: "#f4ead7" }} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-40" title="Un-choose all clips">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* video modal */}
      {playing && (
        <div onClick={() => setPlaying(null)} style={{ backgroundColor: "rgba(28,22,15,0.82)" }} className="ff-overlay fixed inset-0 z-40 flex items-center justify-center p-5">
          <div onClick={(e) => e.stopPropagation()} className="ff-modal ff-pop w-full max-w-2xl">
            <video src={playing.preview} controls autoPlay className="w-full rounded-lg bg-black" style={{ maxHeight: "70vh" }} />
            <div className="flex items-center justify-between mt-3">
              <span style={{ ...sans, color: "#f4ead7" }} className="text-[12px]">{playing.label}</span>
              <div className="flex gap-2">
                <DownloadButton item={playing} seq={playing._seq} total={playing._total} keyword={playing._kw} quality={quality} variant="modal" />
                <button onClick={() => window.open(playing.url, "_blank")} style={{ ...sans, color: "#f4ead7", border: "1px solid rgba(244,234,215,0.3)" }} className="text-[12px] px-3 py-1.5 rounded flex items-center gap-1.5"><ExternalLink size={12} /> View</button>
                <button onClick={() => setPlaying(null)} title="Close (or press Esc)" style={{ color: "#f4ead7" }} className="p-1.5"><X size={18} /></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  WIZARD                                                             */
/* ------------------------------------------------------------------ */
// The last Pexels / Pixabay key that passed its check in this tab. Lives outside
// the wizard so it survives Settings being closed and reopened; a page reload
// clears it, so a fresh visit still checks each key once.
const _keyPassed = { px: "", pb: "" };

function Wizard({ initial, onDone, theme, onToggleTheme }) {
  const [step, setStep] = useState(0);
  const [toolName, setToolName] = useState(initial.toolName || "");
  const [creator, setCreator] = useState(initial.creator || "");
  const [pexelsKey, setPexelsKey] = useState(initial.pexelsKey || "");
  const [pexelsKey2, setPexelsKey2] = useState(initial.pexelsKey2 || "");
  const [pexelsKey3, setPexelsKey3] = useState(initial.pexelsKey3 || "");
  const [pixabayKey, setPixabayKey] = useState(initial.pixabayKey || "");
  const [pixabayKey2, setPixabayKey2] = useState(initial.pixabayKey2 || "");
  const [pixabayKey3, setPixabayKey3] = useState(initial.pixabayKey3 || "");
  // A key that's already saved counts as unverified until proven otherwise, so
  // it starts as "checking" rather than "idle" — otherwise re-opening Settings
  // showed a perfectly good key with Continue greyed out, and the only way past
  // was to delete the key and paste the identical thing back in.
  const [pxState, setPxState] = useState(initial.pexelsKey ? "checking" : "idle"); // idle|checking|ok|bad
  const [pbState, setPbState] = useState(initial.pixabayKey ? "checking" : "idle");

  const steps = ["Brand", "Free sources", "Ready"];

  // A key that already passed in this tab is not tested again. Each test is a real
  // search out of the free hourly allowance, and they used to go out every time
  // Settings opened and every time you clicked out of a key box, even when the
  // key hadn't changed. A changed key, or one that failed, is always tested.
  async function checkPx() {
    const k = pexelsKey.trim();
    if (!k) { setPxState("idle"); return; }
    if (_keyPassed.px === k) { setPxState("ok"); return; }
    setPxState("checking");
    const ok = await validatePexels(k);
    if (ok) _keyPassed.px = k;
    setPxState(ok ? "ok" : "bad");
  }
  async function checkPb() {
    const k = pixabayKey.trim();
    if (!k) { setPbState("idle"); return; }
    if (_keyPassed.pb === k) { setPbState("ok"); return; }
    setPbState("checking");
    const ok = await validatePixabay(k);
    if (ok) _keyPassed.pb = k;
    setPbState(ok ? "ok" : "bad");
  }

  // Verify whatever was already saved, once, as the wizard opens. Costs one
  // request per stored key and means a returning user never has to re-type
  // anything. If a stored key has genuinely stopped working, it says so here
  // instead of failing later mid-run.
  useEffect(() => {
    if (initial.pexelsKey) checkPx();
    if (initial.pixabayKey) checkPb();
  }, []);

  const card = { backgroundColor: C.card, border: `1px solid ${C.line}` };
  const inputStyle = { backgroundColor: C.field, border: `1px solid ${C.line}`, color: C.ink, ...sans };

  const KeyState = ({ s }) =>
    s === "checking" ? <Loader2 size={14} className="animate-spin" style={{ color: C.muted }} /> :
    s === "ok" ? <CheckCircle2 size={15} style={{ color: C.green }} /> :
    s === "bad" ? <X size={15} style={{ color: C.red }} /> : null;

  return (
    <div style={{ backgroundColor: C.paper, ...sans, minHeight: "100vh" }} className="w-full">
      <div className="max-w-xl mx-auto px-6 py-10">
        {/* brand */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div style={{ backgroundColor: C.brownDark, color: "#e9ddc8" }} className="w-9 h-9 rounded-md flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <div style={{ ...serif, color: C.ink }} className="text-xl font-bold">Set up your tool</div>
          </div>
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              style={{ color: C.inkSoft, border: `1px solid ${C.line}`, backgroundColor: C.card }}
              className="p-2 rounded-md hover:opacity-80"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
        </div>
        <div style={{ ...sans, color: C.muted }} className="text-[12px] mb-6">This takes about two minutes and you only do it once. Everything you enter is saved in this browser, on this device.</div>

        {/* Stepper. The circles are buttons, not decoration — opening Settings to
            change one thing shouldn't march you through all three screens from
            the beginning. Step 3 stays locked until a source key checks out,
            which is the same gate the Continue button uses. */}
        <div className="flex items-center gap-2 mb-7">
          {steps.map((label, i) => {
            const reachable = i === 0 || (i === 1 && !!toolName.trim()) || (i === 2 && !!toolName.trim() && pxState === "ok");
            return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <button
                onClick={() => reachable && setStep(i)}
                disabled={!reachable}
                title={reachable ? `${i + 1}. ${label}` : `${label}: finish the step before this one first`}
                style={{
                  backgroundColor: i <= step ? C.brown : C.cardAlt,
                  color: i <= step ? "#fff" : C.muted,
                  border: `1px solid ${i <= step ? C.brown : C.line}`,
                  cursor: reachable ? "pointer" : "default",
                }}
                className="ff-step w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
              >
                {i < step ? <Check size={12} /> : i + 1}
              </button>
              {i < steps.length - 1 && <div style={{ backgroundColor: i < step ? C.brown : C.line }} className="h-px flex-1" />}
            </div>
            );
          })}
        </div>

        {/* STEP 0 */}
        {step === 0 && (
          <div>
            <h2 style={{ ...serif, color: C.ink }} className="text-2xl font-bold mb-2">Name your tool</h2>
            <p style={{ color: C.inkSoft }} className="text-sm mb-5">This name shows at the top of the tool. Call it whatever you like.</p>
            <FieldLabel>Tool name</FieldLabel>
            <input value={toolName} onChange={(e) => setToolName(e.target.value)} placeholder="e.g. Mike's Footage Finder" style={inputStyle} className="w-full rounded-md px-3 py-2.5 text-sm outline-none focus:border-amber-700 mb-4" />
            <FieldLabel>Your name / brand (optional)</FieldLabel>
            <input value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="Shows as “Built by …” under the name" style={inputStyle} className="w-full rounded-md px-3 py-2.5 text-sm outline-none focus:border-amber-700" />
            <button onClick={() => setStep(1)} disabled={!toolName.trim()} style={{ backgroundColor: toolName.trim() ? C.brownDark : "#c3b8a1", color: "#f4ead7" }} className="w-full mt-7 py-3 rounded-md text-sm font-semibold flex items-center justify-center gap-2">
              Continue <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <h2 style={{ ...serif, color: C.ink }} className="text-2xl font-bold mb-2">Connect free sources</h2>
            <p style={{ color: C.inkSoft }} className="text-sm mb-5">Pexels and Pixabay are free websites full of videos and photos you're allowed to use in your own videos. This tool searches them for you. To let it, each site gives you a free key: a long code you get by signing up on their website, then copy and paste here. Pexels is required. Pixabay is optional, but gives you more clips to choose from.</p>

            <div style={card} className="rounded-lg p-4 mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2"><KeyRound size={14} style={{ color: C.brown }} /><span style={{ color: C.ink }} className="text-sm font-semibold">Pexels API key</span><span style={{ color: C.red }} className="text-[10px]">required</span></div>
                <KeyState s={pxState} />
              </div>
              <a href="https://www.pexels.com/api/new/" target="_blank" rel="noreferrer" style={{ color: C.brown }} className="text-[11px] underline">Get a free key at pexels.com/api →</a>
              <input value={pexelsKey} onChange={(e) => { setPexelsKey(e.target.value); setPxState("idle"); }} onBlur={checkPx} placeholder="Paste your Pexels key" style={inputStyle} className="w-full rounded-md px-3 py-2.5 text-sm outline-none focus:border-amber-700 mt-2" />
              {pxState === "bad" && <div style={{ color: C.red, ...sans }} className="text-[11px] mt-1.5">That key didn't work. Make sure you copied the whole code from the Pexels website, with no spaces, then paste it again.</div>}
              <div style={{ color: C.muted, ...sans }} className="text-[11px] mt-3 mb-1.5 leading-relaxed">Backup keys (optional). Each Pexels key allows 200 searches an hour, and a long script can use that up. A key from <span style={{ color: C.inkSoft }}>a second free Pexels account</span> (signed up with a different email) gives you 200 more. The tool only switches to a backup when the main key runs out.</div>
              <input value={pexelsKey2} onChange={(e) => setPexelsKey2(e.target.value)} placeholder="Backup Pexels key #2 (optional)" style={inputStyle} className="w-full rounded-md px-3 py-2 text-[13px] outline-none focus:border-amber-700 mb-1.5" />
              <input value={pexelsKey3} onChange={(e) => setPexelsKey3(e.target.value)} placeholder="Backup Pexels key #3 (optional)" style={inputStyle} className="w-full rounded-md px-3 py-2 text-[13px] outline-none focus:border-amber-700" />
            </div>

            <div style={card} className="rounded-lg p-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2"><KeyRound size={14} style={{ color: C.brown }} /><span style={{ color: C.ink }} className="text-sm font-semibold">Pixabay API key</span><span style={{ color: C.muted }} className="text-[10px]">optional</span></div>
                <KeyState s={pbState} />
              </div>
              <a href="https://pixabay.com/api/docs/" target="_blank" rel="noreferrer" style={{ color: C.brown }} className="text-[11px] underline">Get a free key at pixabay.com/api →</a>
              <input value={pixabayKey} onChange={(e) => { setPixabayKey(e.target.value); setPbState("idle"); }} onBlur={checkPb} placeholder="Paste your Pixabay key (optional)" style={inputStyle} className="w-full rounded-md px-3 py-2.5 text-sm outline-none focus:border-amber-700 mt-2" />
              <div style={{ color: C.muted, ...sans }} className="text-[11px] mt-3 mb-1.5 leading-relaxed">Backup keys (optional). A key from <span style={{ color: C.inkSoft }}>a second free Pixabay account</span> (signed up with a different email) gives you more searches. The tool only switches to a backup when the main key runs out.</div>
              <input value={pixabayKey2} onChange={(e) => setPixabayKey2(e.target.value)} placeholder="Backup Pixabay key #2 (optional)" style={inputStyle} className="w-full rounded-md px-3 py-2 text-[13px] outline-none focus:border-amber-700 mb-1.5" />
              <input value={pixabayKey3} onChange={(e) => setPixabayKey3(e.target.value)} placeholder="Backup Pixabay key #3 (optional)" style={inputStyle} className="w-full rounded-md px-3 py-2 text-[13px] outline-none focus:border-amber-700" />
            </div>

            <div className="flex gap-2 mt-7">
              <button onClick={() => setStep(0)} style={{ border: `1px solid ${C.line}`, color: C.inkSoft, backgroundColor: C.card }} className="px-4 py-3 rounded-md text-sm">Back</button>
              <button onClick={() => setStep(2)} disabled={pxState !== "ok"} style={{ backgroundColor: pxState === "ok" ? C.brownDark : "#c3b8a1", color: "#f4ead7" }} className="flex-1 py-3 rounded-md text-sm font-semibold flex items-center justify-center gap-2">
                {pxState === "ok" ? <>Continue <ArrowRight size={15} /></>
                  : pxState === "checking" ? <><Loader2 size={15} className="animate-spin" /> Checking your Pexels key…</>
                  : pxState === "bad" ? "That Pexels key didn't work. Fix it to continue."
                  : "Paste your Pexels key to continue"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 — Ready */}
        {step === 2 && (
          <div className="text-center">
            <div style={{ backgroundColor: C.green }} className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={26} color="#fff" />
            </div>
            <h2 style={{ ...serif, color: C.ink }} className="text-2xl font-bold mb-2">You're all set</h2>
            <p style={{ color: C.inkSoft }} className="text-sm mb-1"><span className="font-semibold">{toolName || "Your tool"}</span> is ready to go.</p>
            <p style={{ color: C.muted, ...sans }} className="text-[12px] mb-7">Tip: bookmark this page. Next time, just open the bookmark: your keys and settings will already be here.</p>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} style={{ border: `1px solid ${C.line}`, color: C.inkSoft, backgroundColor: C.card }} className="px-4 py-3.5 rounded-md text-sm">Back</button>
              <button onClick={() => onDone({ toolName: toolName.trim() || "Footage Finder", creator: creator.trim(), pexelsKey: pexelsKey.trim(), pexelsKey2: pexelsKey2.trim(), pexelsKey3: pexelsKey3.trim(), pixabayKey: pixabayKey.trim(), pixabayKey2: pixabayKey2.trim(), pixabayKey3: pixabayKey3.trim() })} style={{ backgroundColor: C.brownDark, color: "#f4ead7", ...sans }} className="flex-1 py-3.5 rounded-md text-[13px] font-semibold">Open my tool</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Mount the app into the page.
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<FootageFinder />);
