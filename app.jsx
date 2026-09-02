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
  veil: "rgba(18,14,10,0.62)",
  thumbBg: "#2a2219",
  field: "#15100c",
};
let C = LIGHT;
function applyTheme(mode) { C = mode === "dark" ? DARK : LIGHT; }
try { if (localStorage.getItem("ff_theme") === "dark") applyTheme("dark"); } catch {}
const serif = { fontFamily: 'Georgia, "Times New Roman", Times, serif' };
const mono = { fontFamily: '"SFMono-Regular","SF Mono",Menlo,Consolas,"Roboto Mono",monospace' };
const sans = { fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif' };

/* ------------------------------------------------------------------ */
/*  WAITING ROOM — facts + time estimate                               */
/* ------------------------------------------------------------------ */
// A long script takes a couple of minutes, and a silent progress bar makes that
// feel like a hang. These rotate in the status panel while the tool works, so
// there is always visible proof something is happening — and half of them teach
// you something about the tool or about cutting B-roll.
const FACTS = [
  "Every line is read in the context of your whole script — that's why the keywords fit the moment, not just the words.",
  "In a hurry? 2 clips per scene loads about twice as fast as 4. It's in Settings.",
  "B-roll holds attention best when it changes every 3–5 seconds. Slower than that and the eye wanders off.",
  "Photos count. A slow push-in on a still often cuts better than a shaky clip.",
  "Your Pexels and Pixabay keys never leave your browser. The AI key is hidden on the server. Nothing is sent anywhere else.",
  "The ZIP numbers every file in script order, so your timeline half-builds itself.",
  "Click a clip's picture to pick it. A tick appears, and it joins the download list at the bottom.",
  "Hover a clip to preview it silently. Click Expand to watch it big, with sound.",
  "Don't like a scene's clips? Shuffle gets the next page. Regenerate rewrites the keyword.",
  "Any keyword can be edited by hand — click it, type, press Enter. That scene re-searches on its own.",
  "Free footage sites are strongest on broad human moments: hands, faces, walking, weather, city streets.",
  "The phone and monitor icons switch one scene to portrait or landscape without redoing the rest.",
  "Pexels allows 200 searches an hour per key. Three keys is 600 — which is why backup keys are worth the two minutes.",
  "The slowest part of a run is the AI reading your script. It only has to do that once.",
  "A cut lands better on a hard consonant than on a vowel. Read the line aloud and you'll hear where it wants to go.",
  "Wide shot, then detail, then reaction. Three clips and a scene feels directed instead of decorated.",
  "Nothing here expires. This copy is yours and it'll work the same next year.",
  "If a scene comes back empty, the keyword was too specific — the tool already retried it broader for you.",
  "Shot list gives you a text file of every clip and its scene number. Useful if someone else edits.",
  "Motion carrying on in the same direction keeps the eye calm. Reversing it wakes the viewer up.",
  "Still going. Long scripts mean more scenes, and every scene gets its own search.",
];

// Rough wall-clock estimate for a run, in seconds. Deliberately a little
// generous — a countdown that finishes early feels good, one that stalls at
// "1s left" does not. Parameterised so it stays honest if the pacing changes.
function estimateSeconds({ sceneCount, gapMs = GEMINI_MIN_GAP_MS, pool = SCENE_POOL }) {
  const batches = Math.max(1, Math.ceil(sceneCount / KEYWORD_BATCH));
  const segment = 20; // one AI pass over the whole script
  const phase1 = ((batches - 1) * gapMs) / 1000 + 24; // starts are staggered, then the last call runs
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
  const MAX_RETRIES = 5;
  for (let attempt = 0; ; attempt++) {
    await throttleGemini();
    const res = await fetch("/api/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (res.ok) {
      const data = await res.json();
      setGeminiGap(data.keyCount); // older relays don't send this; ignored if absent
      return (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
    }
    // 429 = rate limited, 500/503 = model briefly overloaded. These are
    // temporary — wait (2s, 4s, 8s, ... capped at 30s) and try again rather
    // than failing the scene. Any other status is a real error, so throw.
    const temporary = res.status === 429 || res.status === 503 || res.status === 500;
    if (temporary && attempt < MAX_RETRIES) {
      const backoff = Math.min(30000, 2000 * Math.pow(2, attempt));
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    throw new Error("Claude request failed (" + res.status + ")");
  }
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
  } catch {
    arr = [];
  }
  // First pass from the batch response.
  const out = batch.map((s, i) => (arr[i] || "").toString().trim());
  // Any line Claude skipped or returned blank gets its OWN focused retry,
  // so we never fall back to a chopped-off sentence like "Everything far away starts".
  for (let i = 0; i < out.length; i++) {
    if (out[i]) continue;
    try {
      out[i] = await oneKeyword(fullScript, batch[i]);
    } catch {
      out[i] = "";
    }
    // Last resort only if the retry also failed: use the FULL line (cleaned),
    // never a truncated slice — a whole sentence still searches sensibly.
    if (!out[i]) out[i] = batch[i].replace(/[".]+$/g, "").trim();
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

async function regenKeyword(fullScript, line, prev) {
  const prompt =
    `You are a senior YouTube video editor sourcing B-roll on Pexels/Pixabay.\n` +
    `Full script for context only:\n"""${fullScript}"""\n\n` +
    `One line from that script is: "${line}". ` +
    `The previous stock-footage search was "${prev}". ` +
    `Suggest ONE DIFFERENT, fresh Pexels/Pixabay search query that captures a different visual ` +
    `angle on the same moment. Use the surrounding script context to keep the subject and mood right. ` +
    `Match this style: SUBJECT + visible action/expression + setting, ` +
    `plus a framing word when it fits (close-up, macro, wide, aerial, silhouette, timelapse). ` +
    `Usually 4 to 6 words, cinematic but always a real filmable shot (e.g. ` +
    `"child eye roll reluctant expression close-up"). No abstract phrases. ` +
    `Return ONLY the query text, nothing else.`;
  const t = (await callClaude(prompt)).trim().replace(/^["']|["']$/g, "");
  return t || prev;
}

/* ---- Pexels ---- */
async function pexelsPhotos(q, key, page = 1, orientation = "landscape", perPage = 4) {
  const r = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}&orientation=${orientation}`,
    { headers: { Authorization: key } }
  );
  if (r.status === 401) throw new Error("PEXELS_AUTH");
  if (r.status === 429) throw new Error("PEXELS_RATE");
  if (!r.ok) return [];
  const d = await r.json();
  return (d.photos || []).map((p) => ({
    id: "px-p-" + p.id,
    type: "photo",
    source: "Pexels",
    thumb: p.src.large,
    download: p.src.original,
    url: p.url,
    label: `Pexels Photo #${p.id}`,
  }));
}
async function pexelsVideos(q, key, page = 1, orientation = "landscape", perPage = 4) {
  const r = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}&orientation=${orientation}`,
    { headers: { Authorization: key } }
  );
  if (r.status === 401) throw new Error("PEXELS_AUTH");
  if (r.status === 429) throw new Error("PEXELS_RATE");
  if (!r.ok) return [];
  const d = await r.json();
  return (d.videos || []).map((v) => {
    const files = (v.video_files || []).filter((f) => f.file_type === "video/mp4");
    const sd = files.find((f) => f.quality === "sd") || files[0];
    const hd = files.find((f) => f.quality === "hd") || sd;
    return {
      id: "px-v-" + v.id,
      type: "video",
      source: "Pexels",
      thumb: v.image,
      preview: (sd && sd.link) || "",
      download: (hd && hd.link) || (sd && sd.link) || "",
      url: v.url,
      label: `Pexels Video #${v.id}`,
    };
  });
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
  await pacePixabay();
  const r = await fetch(
    `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&per_page=${ask}&page=${page}&image_type=photo&orientation=${pbOrient}`
  );
  if (r.status === 429) throw new Error("PIXABAY_RATE");
  if (!r.ok) return [];
  const d = await r.json();
  return (d.hits || []).slice(0, perPage).map((h) => ({
    id: "pb-p-" + h.id,
    type: "photo",
    source: "Pixabay",
    thumb: h.webformatURL,
    download: h.largeImageURL,
    url: h.pageURL,
    label: `Pixabay Photo #${h.id}`,
  }));
}
async function pixabayVideos(q, key, page = 1, orientation = "landscape", perPage = 4) {
  // Pixabay's video endpoint has no orientation param, so we request a few
  // extra (double the wanted count) and filter by the clip's own width/height
  // on our side, then trim back to perPage.
  await pacePixabay();
  const r = await fetch(
    `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(q)}&per_page=${perPage * 2}&page=${page}`
  );
  if (r.status === 429) throw new Error("PIXABAY_RATE");
  if (!r.ok) return [];
  const d = await r.json();
  const wantPortrait = orientation === "portrait";
  return (d.hits || [])
    .map((h) => {
      const vids = h.videos || {};
      const dim = vids.large || vids.medium || vids.small || vids.tiny || {};
      const portrait = (dim.height || 0) > (dim.width || 0);
      const thumb =
        vids.large?.thumbnail ||
        vids.medium?.thumbnail ||
        (h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg` : "");
      return {
        id: "pb-v-" + h.id,
        type: "video",
        source: "Pixabay",
        thumb,
        preview: vids.small?.url || vids.tiny?.url || vids.medium?.url || "",
        download: vids.large?.url || vids.medium?.url || vids.small?.url || "",
        url: h.pageURL,
        label: `Pixabay Video #${h.id}`,
        _portrait: portrait,
      };
    })
    .filter((r) => r._portrait === wantPortrait)
    .slice(0, perPage)
    .map(({ _portrait, ...r }) => r);
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

// Pixabay's CDN doesn't send the CORS header a browser needs to READ a file's
// bytes (only to display it), so a direct fetch of a Pixabay clip is blocked —
// which breaks zipping. We route those through our own /api/proxy, which refetches
// the file server-side and adds the header. Pexels sends the header, so it's read
// directly (faster, no server hop).
function clipNeedsProxy(url) {
  const host = (url || "").replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
  return /(^|\.)pixabay\.com$/.test(host);
}
function clipFetchURL(url) {
  return clipNeedsProxy(url) ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
}
async function fetchClipBlob(item) {
  const res = await fetch(clipFetchURL(item.download));
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.blob();
}

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

async function downloadMedia(item, seq, total, keyword) {
  const name = clipFileName(item, seq, total, keyword);
  try {
    const blob = await fetchClipBlob(item);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch {
    // Last resort — open the file in a new tab so the user can still save it by hand.
    window.open(item.download, "_blank");
  }
}

// When a scene's clips get replaced — Shuffle, Regenerate, an edited keyword, a
// switch to portrait — anything already ticked used to disappear from the grid
// while quietly staying in the download list. The bar would say "2 clips
// selected" with nothing ticked on screen, and those two files came out of the
// ZIP with no scene number on them. So instead of dropping picks, we carry them
// over: your ticked clips stay at the front of the new set, still ticked, still
// visible. Nothing is lost by looking around.
function mergeKeepingPicks(prevResults, nextResults, selected) {
  const kept = (prevResults || []).filter((r) => selected[r.id]);
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
// so a refresh, a closed tab or a crash never costs you a run. Deliberately kept
// apart from the settings above: settings are tiny and always fit, a workspace can
// be a few hundred KB, so a storage failure on one must not take the other down.
const WORK_KEY = "ff_work_v1";
function loadWork() {
  try {
    const raw = localStorage.getItem(WORK_KEY);
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
    localStorage.setItem(WORK_KEY, JSON.stringify(w));
  } catch {
    // Almost always the ~5 MB browser quota on a very long run. Drop the previous
    // copy to free its space and try once more; if it still won't fit, carry on
    // without saving rather than breaking the run in progress.
    try {
      localStorage.removeItem(WORK_KEY);
      localStorage.setItem(WORK_KEY, JSON.stringify(w));
    } catch {}
  }
}
function clearWork() {
  try {
    localStorage.removeItem(WORK_KEY);
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

function Label({ children }) {
  return (
    <div style={{ ...mono, color: C.muted, letterSpacing: "0.12em" }} className="text-[10px] uppercase mb-2">
      {children}
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
  const [status, setStatus] = useState("Paste your script and hit Analyse. Keys are saved.");
  const [statusErr, setStatusErr] = useState(false);
  const [scenes, setScenes] = useState([]);
  const [selected, setSelected] = useState({});
  const [zipping, setZipping] = useState(null); // null when idle, else {done,total,packing}
  const [dismissWarn, setDismissWarn] = useState(false); // long-script heads-up dismissed?
  const [sceneBusy, setSceneBusy] = useState({});
  const [editing, setEditing] = useState(null);
  const [playing, setPlaying] = useState(null);

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
        setStage("app");
        setReturning(true);

        // Bring the last workspace back. This is what makes a refresh survivable:
        // the script, the scenes and which clips were ticked all return exactly as
        // they were, so you never re-paste and re-run just because a tab reloaded.
        const w = loadWork();
        const n = w ? w.scenes.length : 0;
        if (w && (w.script || n)) {
          setScript(w.script || "");
          setScenes(w.scenes);
          setSelected(w.selected || {});
        }
        setStatus(
          n
            ? `Welcome back — your last run is still here (${n} scene${n === 1 ? "" : "s"}). Analyse again to start over.`
            : w && w.script
            ? "Welcome back — your script is still here. Hit Analyse when you're ready."
            : "Welcome back. Paste a new script and hit Analyse."
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
  // countdown move) and rotate the fun fact every 7 seconds. Both intervals only
  // exist while analysing, so an idle page does no work at all.
  useEffect(() => {
    if (!analyzing) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    const f = setInterval(() => setFactIdx((n) => (n + 1) % FACTS.length), 7000);
    return () => {
      clearInterval(t);
      clearInterval(f);
    };
  }, [analyzing]);

  const saveAll = (extra = {}) =>
    persist({ toolName, creator, pexelsKey, pexelsKey2, pexelsKey3, pixabayKey, pixabayKey2, pixabayKey3, mediaTypes, sources, orientation, perScene, ...extra });

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

  // Countdown text under the progress bar. Falls back to a plain elapsed counter if
  // we never got an estimate, so it always says something truthful.
  const elapsedSec = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  const etaLabel = (() => {
    if (!etaSec) return `Working... ${fmtDuration(elapsedSec)} elapsed`;
    const left = etaSec - elapsedSec;
    if (left <= 0) return `Almost there — ${fmtDuration(elapsedSec)} elapsed`;
    return `About ${fmtDuration(left)} left · ${fmtDuration(elapsedSec)} elapsed`;
  })();

  /* analysis */
  async function runAnalysis() {
    if (!script.trim()) {
      setStatus("Paste a script first.");
      setStatusErr(true);
      return;
    }
    if (!(sources.pexels && pexelsKeys.length) && !(sources.pixabay && pixabayKeys.length)) {
      setStatus("Connect an active source (Pexels or Pixabay) in Settings first.");
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
    try {
      // Break the script into filmable beats via the AI (one action per scene).
      // Fall back to the coarse sentence splitter if that step fails for any reason.
      setProgress({ pct: 4, label: "Breaking your script into scenes..." });
      let lines;
      try {
        lines = await segmentScript(script);
        if (!lines || lines.length === 0) lines = splitIntoScenes(script);
      } catch {
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
      setProgress({ pct: 6, label: `Analysing ${batches.length} batch${batches.length === 1 ? "" : "es"} with full context...` });
      const settledBatches = await Promise.allSettled(
        batches.map((b) =>
          generateKeywords(script, b).then((r) => {
            doneBatches++;
            setProgress({ pct: 6 + (doneBatches / batches.length) * 29, label: `Keywords: batch ${doneBatches}/${batches.length} done...` });
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
      setScenes(acc.map((s) => ({ ...s })));
      let rateHit = false, finished = 0, dirty = false;
      // Redraw at most a few times a second rather than once per finished scene:
      // with 100 scenes that's the difference between a smooth fill and a stutter.
      const flush = () => {
        if (dirty) {
          dirty = false;
          setScenes(acc.map((s) => ({ ...s })));
        }
      };
      const flushTimer = setInterval(flush, 400);
      try {
        let cursor = 0;
        const worker = async () => {
          for (;;) {
            const i = cursor++;
            if (i >= acc.length) return;
            try {
              acc[i].results = await searchScene(keywords[i], { pexelsKeys, pixabayKeys, sources, mediaTypes, orientation, perPage: perScene, page: 1 });
            } catch (err) {
              if (err.message === "PEXELS_RATE") rateHit = true; // keep going, just no results for this scene
              else throw err; // real errors (auth, Claude) still abort
            }
            acc[i].loading = false;
            dirty = true;
            finished++;
            setProgress({ pct: 35 + (finished / acc.length) * 65, label: `Finding footage — ${finished}/${acc.length} scenes done` });
          }
        };
        const settled = await Promise.allSettled(
          Array.from({ length: Math.min(SCENE_POOL, acc.length) }, worker)
        );
        const bad = settled.find((s) => s.status === "rejected");
        if (bad) throw bad.reason;
      } finally {
        clearInterval(flushTimer);
        dirty = true;
        flush();
      }
      const total = acc.reduce((n, s) => n + s.results.length, 0);
      if (rateHit) {
        setStatus(`Done, but Pexels hit its free hourly request limit partway through, so some scenes have few or no results. Wait a few minutes, then use each scene's Shuffle to fill them in. (${total} results across ${acc.length} scenes.)`);
        setStatusErr(true);
      } else {
        setStatus(`Done — ${total} results across ${acc.length} scenes.`);
        setStatusErr(false);
      }
    } catch (e) {
      if (e.message === "PEXELS_AUTH") setStatus("Your Pexels API key was rejected. Open Settings and check it.");
      else if (e.message?.includes("Claude")) setStatus("The AI keyword step is being rate-limited by Google. Wait a minute and try again.");
      else setStatus("Something went wrong while analysing. Try again.");
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
  const RATE_MSG = "Pexels hit its free hourly request limit, so new footage couldn't load. Wait a few minutes and try again (a big script uses up the hourly quota fast).";
  function noteSceneError(e) {
    if (e && e.message === "PEXELS_RATE") { setStatus(RATE_MSG); setStatusErr(true); }
  }

  async function shuffleScene(s) {
    if (!s.keyword || !s.keyword.trim()) return; // nothing to search yet
    setBusy(s.id, true);
    try {
      const page = (s.page || 1) + 1;
      const results = await searchScene(s.keyword, { pexelsKeys, pixabayKeys, sources, mediaTypes, orientation: s.orientation || orientation, perPage: s.perScene || perScene, page });
      updateScene(s.id, { results: results.length ? mergeKeepingPicks(s.results, results, selected) : s.results, page });
    } catch (e) { noteSceneError(e); }
    setBusy(s.id, false);
  }
  async function regenScene(s) {
    setBusy(s.id, true);
    try {
      const kw = await regenKeyword(script, s.line, s.keyword);
      const results = await searchScene(kw, { pexelsKeys, pixabayKeys, sources, mediaTypes, orientation: s.orientation || orientation, perPage: s.perScene || perScene, page: 1 });
      updateScene(s.id, { keyword: kw, results: mergeKeepingPicks(s.results, results, selected), page: 1 });
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
      updateScene(s.id, { keyword: kw, results: mergeKeepingPicks(s.results, results, selected), page: 1 });
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
      updateScene(s.id, { results: results.length ? mergeKeepingPicks(s.results, results, selected) : s.results, page: 1 });
    } catch (e) { noteSceneError(e); }
    setBusy(s.id, false);
  }

  const toggleSel = (item) =>
    setSelected((m) => {
      const n = { ...m };
      if (n[item.id]) delete n[item.id];
      else n[item.id] = item;
      return n;
    });
  const selectAll = (s) => setSelected((m) => ({ ...m, ...Object.fromEntries(s.results.map((r) => [r.id, r])) }));
  const clearScene = (s) =>
    setSelected((m) => {
      const n = { ...m };
      s.results.forEach((r) => delete n[r.id]);
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
        line: "Extra search — added by you",
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

  // Sits between every pair of scenes and once at the end. Deliberately quiet — a
  // dashed seam that lights up under the cursor — so a hundred of them down a long
  // script read as hairlines rather than clutter. On touch there is no cursor to
  // light it up, so the ff-seam rules bring it most of the way out and fatten it.
  const plusRow = (at) => (
    <button
      onClick={() => insertScene(at)}
      title="Insert an extra search here"
      style={{ ...mono }}
      className="ff-seam w-full flex items-center gap-2 opacity-30 hover:opacity-100 transition-opacity"
    >
      <span style={{ borderTop: `1px dashed ${C.line}` }} className="flex-1" />
      <span
        style={{ border: `1px dashed ${C.line}`, backgroundColor: C.card, color: C.brown }}
        className="ff-chip inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] uppercase tracking-wide"
      >
        <Plus size={10} /> Add a search
      </span>
      <span style={{ borderTop: `1px dashed ${C.line}` }} className="flex-1" />
    </button>
  );

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
        if (selected[r.id] && !seen.has(r.id)) {
          seen.add(r.id);
          out.push({ item: selected[r.id], seq: i + 1, keyword: s.keyword });
        }
      });
    });
    Object.values(selected).forEach((it) => {
      if (!seen.has(it.id)) {
        seen.add(it.id);
        out.push({ item: it, seq: scenes.length + 1, keyword: "" });
      }
    });
    return out;
  }

  async function downloadAll() {
    const picks = orderedPicks();
    const total = scenes.length;
    for (const p of picks) {
      await downloadMedia(p.item, p.seq, total, p.keyword);
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
      const used = {};
      let ok = 0, failed = 0;
      for (let i = 0; i < picks.length; i++) {
        const it = picks[i].item;
        try {
          const blob = await fetchClipBlob(it);
          let name = clipFileName(it, picks[i].seq, scenes.length, picks[i].keyword);
          // Guard against two clips resolving to the same filename inside the zip.
          if (used[name]) name = name.replace(/(\.[a-z0-9]+)$/i, `_${i + 1}$1`);
          used[name] = 1;
          zip.file(name, blob);
          ok++;
        } catch { failed++; }
        setZipping({ done: i + 1, total: picks.length });
      }
      if (!ok) {
        setStatus("Couldn't fetch any of the selected clips to zip — check your connection, or use Files to save them one by one.");
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
        ? `Zipped ${ok} clip${ok > 1 ? "s" : ""}. ${failed} couldn't be fetched and were skipped — grab those with Files.`
        : `Zipped ${ok} clip${ok > 1 ? "s" : ""} into one file. ✓`);
      setStatusErr(false);
    } catch {
      setStatus("The zip helper couldn't load. Your clips are safe — use Files to save them individually.");
      setStatusErr(true);
    } finally {
      setZipping(null);
    }
  }
  function exportShotList() {
    const rows = [`${toolName} — Shot List`, "=".repeat(44), ""];
    scenes.forEach((s, i) => {
      const picks = s.results.filter((r) => selected[r.id]);
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
          });
          setStage("app");
          setStatus("All set. Paste your script and hit Analyse.");
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

        /* Everything that doesn't need a theme colour — including every rule
           that makes the tool usable on a phone — lives in index.html's
           <style> instead, because this block is inside the main screen and
           so never reaches the first-run setup wizard. */
      `}</style>

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
              <div style={{ ...mono, color: C.muted, letterSpacing: "0.06em" }} className="text-[10px] uppercase mt-1.5">
                AI-Powered Stock Footage Finder — Pexels{pixabayKey ? " & Pixabay" : ""}
              </div>
              {creator && (
                <div style={{ ...mono, color: C.muted }} className="text-[10px] mt-1">
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
          </div>
          <textarea
            value={script}
            onChange={(e) => { setScript(e.target.value); if (!e.target.value.trim()) setDismissWarn(false); }}
            placeholder="Paste your YouTube script here. Each sentence is read in context — the AI sees the line before and after to find footage that fits the exact moment, not just the words..."
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
          <div className="flex flex-wrap gap-x-12 gap-y-4">
            <div>
              <Label>Media Type</Label>
              <div className="flex gap-2">
                <Toggle icon={Play} active={mediaTypes.videos} onClick={() => { const n = { ...mediaTypes, videos: !mediaTypes.videos }; if (!n.videos && !n.photos) return; setMediaTypes(n); saveAll({ mediaTypes: n }); }}>Videos</Toggle>
                <Toggle icon={ImageIcon} active={mediaTypes.photos} onClick={() => { const n = { ...mediaTypes, photos: !mediaTypes.photos }; if (!n.videos && !n.photos) return; setMediaTypes(n); saveAll({ mediaTypes: n }); }}>Photos</Toggle>
              </div>
            </div>
            <div>
              <Label>Source</Label>
              <div className="flex gap-2">
                <Toggle active={sources.pexels} onClick={() => { if (!pexelsKey) return; const n = { ...sources, pexels: !sources.pexels }; setSources(n); saveAll({ sources: n }); }}>Pexels</Toggle>
                <Toggle active={sources.pixabay} onClick={() => { if (!pixabayKey) return; const n = { ...sources, pixabay: !sources.pixabay }; setSources(n); saveAll({ sources: n }); }}>Pixabay</Toggle>
              </div>
            </div>
            <div>
              <Label>Orientation</Label>
              <div className="flex gap-2">
                <Toggle icon={Monitor} active={orientation === "landscape"} onClick={() => { setOrientation("landscape"); saveAll({ orientation: "landscape" }); }}>Landscape</Toggle>
                <Toggle icon={Smartphone} active={orientation === "portrait"} onClick={() => { setOrientation("portrait"); saveAll({ orientation: "portrait" }); }}>Portrait</Toggle>
              </div>
            </div>
            <div>
              <Label>Clips / scene</Label>
              <div className="flex gap-2">
                <Toggle active={perScene === 2} onClick={() => { setPerScene(2); saveAll({ perScene: 2 }); }}>2</Toggle>
                <Toggle active={perScene === 4} onClick={() => { setPerScene(4); saveAll({ perScene: 4 }); }}>4</Toggle>
              </div>
            </div>
          </div>

          {/* What "2" and "4" really mean. The number is per media type per site,
              so with videos + photos both on you get double it, and with both
              sites on you get double again — which is why a scene set to "2" can
              come back with eight thumbnails. Rather than quietly dividing the
              number (Pixabay refuses a page size under 3), the setting says out
              loud what it's about to fetch. Clip count does NOT affect the hourly
              limit — that counts searches, i.e. scenes. */}
          {(() => {
            const typeCount = (mediaTypes.videos ? 1 : 0) + (mediaTypes.photos ? 1 : 0);
            const srcCount = (sources.pexels ? 1 : 0) + (sources.pixabay ? 1 : 0);
            const per = perScene * Math.max(1, typeCount) * Math.max(1, srcCount);
            const bits = [];
            if (mediaTypes.videos && mediaTypes.photos) bits.push("videos and photos");
            else if (mediaTypes.videos) bits.push("videos");
            else if (mediaTypes.photos) bits.push("photos");
            const sites = [sources.pexels && "Pexels", sources.pixabay && "Pixabay"].filter(Boolean).join(" and ");
            return (
              <div style={{ ...mono, color: C.muted }} className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-relaxed">
                <Info size={12} className="mt-[1px] flex-shrink-0" />
                <span>
                  {per} clips per scene as things stand — it's {perScene} of each kind from each site,
                  and you have {bits.join("")}{sites ? " from " + sites : ""} switched on. More to choose
                  from, but each scene loads slower and ZIPs get bigger. This doesn't touch your hourly
                  limit; that counts scenes, not clips.
                </span>
              </div>
            );
          })()}
        </div>

        {/* Long-script heads-up: appears ONLY when the pasted script is big enough
            to risk the hourly limit (rough sentence count — the real quota driver
            is number of scenes, NOT the clips-per-scene setting). Dismissible. */}
        {(() => {
          const sentences = (splitIntoScenes(script) || []).length;
          if (sentences < 60 || dismissWarn || analyzing) return null;
          return (
            <div style={{ backgroundColor: C.card, border: `1px solid ${C.line}`, borderLeft: "3px solid #b8862b" }} className="mt-6 rounded-md px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={15} style={{ color: "#b8862b" }} className="mt-[1px] flex-shrink-0" />
              <div className="flex-1">
                <div style={{ ...mono, color: C.ink }} className="text-[11.5px] font-semibold">
                  Heads-up: this is a long script (~{sentences} scenes)
                </div>
                <div style={{ ...mono, color: C.muted }} className="text-[10.5px] leading-relaxed mt-1">
                  Longer scripts make more searches and can hit the free hourly limit near the end —
                  that's expected, not a bug. If footage stops partway, wait about an hour, or add backup
                  keys in Settings. Splitting a very long script into parts also helps.
                </div>
              </div>
              <button onClick={() => setDismissWarn(true)} style={{ ...mono, color: C.muted }} className="text-[10px] px-2 py-1 rounded hover:bg-black/5 flex-shrink-0">Got it</button>
            </div>
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
          const n = Math.max(1, (splitIntoScenes(script) || []).length);
          return (
            <div style={{ ...mono, color: C.muted }} className="mt-5 flex items-center justify-center gap-2 text-[11px]">
              <Film size={12} className="flex-shrink-0" />
              <span>About {n} {n === 1 ? "scene" : "scenes"} · roughly {fmtDuration(estimateSeconds({ sceneCount: n }))} to find footage for all of them</span>
            </div>
          );
        })()}

        {/* analyse */}
        <button
          onClick={runAnalysis}
          disabled={analyzing}
          style={{ backgroundColor: analyzing ? "#b3a890" : C.brownDark, color: "#f4ead7", ...mono, letterSpacing: "0.14em" }}
          className="w-full mt-7 py-4 rounded-lg text-[13px] font-semibold uppercase flex items-center justify-center gap-2 transition-colors"
        >
          {analyzing && <Loader2 size={15} className="animate-spin" />}
          Analyse Script &amp; Find Footage
        </button>

        {/* status */}
        <div
          style={{
            backgroundColor: C.card,
            border: `1px solid ${C.line}`,
            borderLeft: `3px solid ${statusErr ? "#a14b3a" : analyzing ? C.brown : C.green}`,
          }}
          className="mt-3 rounded-md px-4 py-3"
        >
          <div style={{ ...mono, color: statusErr ? "#a14b3a" : C.inkSoft }} className="text-[12px]">
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
              <div style={{ ...mono, color: C.muted }} className="text-[10px]">{etaLabel}</div>
              {/* key={factIdx} on purpose: it makes React swap the element out for a
                  new one each time the fact changes, which restarts the ff-fact fade
                  so one line dissolves into the next instead of snapping over. */}
              <div key={factIdx} style={{ ...serif, color: C.inkSoft }} className="ff-fact text-[11.5px] italic mt-1.5 leading-snug">
                {FACTS[factIdx % FACTS.length]}
              </div>
            </div>
          )}
        </div>

        {/* stats */}
        {scenes.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            {[
              ["Total Results", stats.total],
              ["Scenes Analysed", stats.scenes],
              ["Videos", stats.v],
              ["Photos", stats.p],
            ].map(([k, v]) => (
              <div key={k} className="ff-card rounded-lg px-4 py-3">
                <div style={{ ...serif, color: C.ink }} className="text-2xl font-bold">{v}</div>
                <div style={{ ...mono, color: C.muted, letterSpacing: "0.08em" }} className="text-[9px] uppercase mt-0.5">{k}</div>
              </div>
            ))}
          </div>
        )}

        {/* scenes */}
        <div className="mt-5 space-y-4">
          {scenes.map((s, i) => {
            const busy = sceneBusy[s.id];
            return (
              <React.Fragment key={s.id}>
              {plusRow(i)}
              <div style={{ backgroundColor: C.cardAlt, border: `1px solid ${C.line}` }} className="ff-scene rounded-lg overflow-hidden">
                {/* scene head */}
                <div className="px-4 pt-3.5 pb-3">
                  <div className="ff-head flex items-start gap-3">
                    <span style={{ ...mono, color: C.brown }} className="text-[12px] font-bold pt-0.5">{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex-1 min-w-0">
                      <div style={{ color: s.inserted ? C.muted : C.ink, fontStyle: s.inserted ? "italic" : "normal" }} className="text-[14px] leading-snug">{s.line}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span style={{ color: C.muted }}>→</span>
                        {editing === s.id ? (
                          <KeywordInput value={s.keyword} onCommit={(kw) => applyKeyword(s, kw)} />
                        ) : (
                          <button
                            onClick={() => setEditing(s.id)}
                            style={{ ...mono, color: C.inkSoft }}
                            className="text-[11px] inline-flex items-center gap-1.5 group"
                            title="Click to edit this search"
                          >
                            {s.keyword ? `"${s.keyword}"` : "type your search here"}
                            <span
                              style={{ color: C.brown, border: `1px solid ${C.line}`, backgroundColor: C.card }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide group-hover:opacity-80"
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
                          <button onClick={() => setSceneOrientation(s, "landscape")} disabled={busy} title="Landscape footage for this scene" style={{ backgroundColor: ori === "landscape" ? C.brown : "transparent", color: ori === "landscape" ? "#fff" : C.inkSoft }} className="p-1.5 hover:opacity-80 disabled:opacity-40"><Monitor size={13} /></button>
                          <button onClick={() => setSceneOrientation(s, "portrait")} disabled={busy} title="Portrait footage for this scene" style={{ backgroundColor: ori === "portrait" ? C.brown : "transparent", color: ori === "portrait" ? "#fff" : C.inkSoft }} className="p-1.5 hover:opacity-80 disabled:opacity-40"><Smartphone size={13} /></button>
                        </div>
                      ); })()}
                      <button onClick={() => shuffleScene(s)} disabled={busy} title="Shuffle — new results, same search" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="p-1.5 rounded hover:opacity-80 disabled:opacity-40"><Shuffle size={13} /></button>
                      {s.inserted ? (
                        // This one's yours, not the AI's. There's no script line behind it
                        // to spin a fresh angle from, so the slot removes it instead.
                        <button onClick={() => removeScene(s.id)} disabled={busy} title="Remove this extra search" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="p-1.5 rounded hover:opacity-80 disabled:opacity-40"><Trash2 size={13} /></button>
                      ) : (
                        <button onClick={() => regenScene(s)} disabled={busy} title="Regenerate — new AI search angle" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="p-1.5 rounded hover:opacity-80 disabled:opacity-40"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /></button>
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
                      <div style={{ ...mono, color: C.muted }} className="ff-pending text-[11px] py-6 text-center flex items-center justify-center gap-2">
                        <Loader2 className="animate-spin" size={13} /> Finding footage...
                      </div>
                    ) : !s.keyword || !s.keyword.trim() ? (
                      // A row you added yourself, before you've typed anything into
                      // it. Telling this one to "try Regenerate" would be useless —
                      // it has no Regenerate button, and nothing to rewrite.
                      <div style={{ ...mono, color: C.muted }} className="text-[11px] py-6 text-center">Type what you want to see above, then press Enter.</div>
                    ) : s.inserted ? (
                      <div style={{ ...mono, color: C.muted }} className="text-[11px] py-6 text-center">Nothing found for that. Click the words above to edit them, or try Shuffle.</div>
                    ) : (
                      <div style={{ ...mono, color: C.muted }} className="text-[11px] py-6 text-center">No results — try Shuffle or Regenerate.</div>
                    )
                  ) : (
                    // Always the neat responsive grid — 2 columns on phones, 4 on
                    // desktop — no matter the clips-per-scene setting. (It used to
                    // narrow to 2 columns for "2 clips" back when that meant only 2
                    // tiles; now "2 clips" can be 6-8 tiles per source, so it needs
                    // the same tidy 4-wide layout that "4 clips" uses.)
                    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                      {s.results.map((r) => {
                        const sel = !!selected[r.id];
                        return (
                          <div
                            key={r.id}
                            onClick={() => toggleSel(r)}
                            title={sel ? "Picked for your download list — click to un-pick" : "Click the picture to pick this clip for your download list"}
                            onMouseEnter={(e) => {
                              const v = e.currentTarget.querySelector("video");
                              if (!v) return;
                              v.style.opacity = "1";   // make visible BEFORE play()...
                              v.dataset.hover = "1";
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
                                pauses it as hidden "background media". */}
                            {r.type === "video" && r.preview && (
                              <video
                                src={r.preview}
                                poster={r.thumb || undefined}
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
                              style={{ backgroundColor: r.type === "video" ? "rgba(57,39,26,0.9)" : C.green, ...mono }}
                              className="absolute top-1.5 left-1.5 text-[8px] text-white px-1.5 py-0.5 rounded uppercase tracking-wide flex items-center gap-1"
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
                                <div style={{ ...mono }} className="ff-src text-[8px] text-white/85 mb-1 truncate">{r.label}</div>
                                <div className="flex items-center gap-1.5">
                                  {r.type === "video" && r.preview && (
                                    <button onClick={(e) => { e.stopPropagation(); setPlaying({ ...r, _seq: i + 1, _total: scenes.length, _kw: s.keyword }); }} title="Expand — watch the full clip, big, with sound" style={{ ...mono }} className="pointer-events-auto flex items-center gap-1 text-[9px] text-white bg-white/15 hover:bg-white/25 px-1.5 py-1 rounded">
                                      <Play size={9} /> <span className="ff-lbl">Expand</span>
                                    </button>
                                  )}
                                  <button onClick={(e) => { e.stopPropagation(); downloadMedia(r, i + 1, scenes.length, s.keyword); }} title="Download — save this one clip to your computer now (this is not how you pick it — click the picture for that)" style={{ ...mono }} className="pointer-events-auto flex items-center gap-1 text-[9px] text-white bg-white/15 hover:bg-white/25 px-1.5 py-1 rounded">
                                    <Download size={9} /> <span className="ff-lbl">Download</span>
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); window.open(r.url, "_blank"); }} title="View — open the original page in a new tab" style={{ ...mono }} className="pointer-events-auto flex items-center gap-1 text-[9px] text-white bg-white/15 hover:bg-white/25 px-1.5 py-1 rounded">
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
                  <span style={{ ...mono, color: C.muted }} className="text-[10px]">{s.results.length} results</span>
                  <div className="ff-foot flex items-center gap-1.5">
                    <button onClick={() => selectAll(s)} style={{ ...mono, border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="text-[10px] px-2.5 py-1 rounded hover:opacity-80">Select all</button>
                    <button onClick={() => clearScene(s)} style={{ ...mono, border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="text-[10px] px-2.5 py-1 rounded hover:opacity-80">Clear</button>
                  </div>
                </div>
              </div>
              </React.Fragment>
            );
          })}
          {scenes.length > 0 && plusRow(scenes.length)}
        </div>
      </div>

      {/* selected bar */}
      {selectedCount > 0 && (
        <div style={{ backgroundColor: C.brownDark }} className="ff-dlbar fixed bottom-0 left-0 right-0 z-30 shadow-2xl">
          <div className="ff-dl max-w-5xl mx-auto px-5 sm:px-8 py-3 flex items-center justify-between gap-3">
            <div style={{ ...mono, color: "#f4ead7" }} className="text-[12px]">
              <span className="font-bold">{selectedCount}</span> clip{selectedCount > 1 ? "s" : ""} selected
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button onClick={exportShotList} disabled={!!zipping} style={{ ...mono, color: "#f4ead7", border: "1px solid rgba(244,234,215,0.3)" }} className="text-[11px] px-3 py-1.5 rounded flex items-center gap-1.5 hover:bg-white/10 disabled:opacity-40">
                <FileText size={12} /> Shot list
              </button>
              <button onClick={downloadAll} disabled={!!zipping} title="Save each clip as its own separate file" style={{ ...mono, color: "#f4ead7", border: "1px solid rgba(244,234,215,0.3)" }} className="text-[11px] px-3 py-1.5 rounded flex items-center gap-1.5 hover:bg-white/10 disabled:opacity-40">
                <Download size={12} /> Files
              </button>
              <button onClick={downloadZip} disabled={!!zipping} title="Bundle all selected clips into one .zip" style={{ ...mono, backgroundColor: "#f4ead7", color: C.brownDark }} className="text-[11px] px-3 py-1.5 rounded flex items-center gap-1.5 font-semibold hover:opacity-90 disabled:opacity-70">
                {zipping ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    {zipping.packing != null ? `Packing ${zipping.packing}%` : `Zipping ${zipping.done}/${zipping.total}`}
                  </>
                ) : (
                  <><Package size={12} /> Download ZIP</>
                )}
              </button>
              <button onClick={() => setSelected({})} disabled={!!zipping} style={{ color: "#f4ead7" }} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-40" title="Clear selection">
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
              <span style={{ ...mono, color: "#f4ead7" }} className="text-[11px]">{playing.label}</span>
              <div className="flex gap-2">
                <button onClick={() => downloadMedia(playing, playing._seq, playing._total, playing._kw)} title="Download — save this clip to your computer" style={{ ...mono, backgroundColor: "#f4ead7", color: C.brownDark }} className="text-[11px] px-3 py-1.5 rounded flex items-center gap-1.5 font-semibold"><Download size={12} /> Download</button>
                <button onClick={() => window.open(playing.url, "_blank")} style={{ ...mono, color: "#f4ead7", border: "1px solid rgba(244,234,215,0.3)" }} className="text-[11px] px-3 py-1.5 rounded flex items-center gap-1.5"><ExternalLink size={12} /> View</button>
                <button onClick={() => setPlaying(null)} title="Close (or press Escape)" style={{ color: "#f4ead7" }} className="p-1.5"><X size={18} /></button>
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

  async function checkPx() {
    if (!pexelsKey.trim()) { setPxState("idle"); return; }
    setPxState("checking");
    setPxState((await validatePexels(pexelsKey.trim())) ? "ok" : "bad");
  }
  async function checkPb() {
    if (!pixabayKey.trim()) { setPbState("idle"); return; }
    setPbState("checking");
    setPbState((await validatePixabay(pixabayKey.trim())) ? "ok" : "bad");
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
    s === "bad" ? <X size={15} style={{ color: "#a14b3a" }} /> : null;

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
        <div style={{ ...mono, color: C.muted }} className="text-[11px] mb-6">A one-time setup. Your details are saved on this device.</div>

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
                title={reachable ? `${i + 1}. ${label}` : `${label} — finish the step before it first`}
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
            <p style={{ color: C.inkSoft }} className="text-sm mb-5">This appears at the top of your finder. Make it yours.</p>
            <Label>Tool name</Label>
            <input value={toolName} onChange={(e) => setToolName(e.target.value)} placeholder="e.g. Mike's Footage Finder" style={inputStyle} className="w-full rounded-md px-3 py-2.5 text-sm outline-none focus:border-amber-700 mb-4" />
            <Label>Your name / brand (optional)</Label>
            <input value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="Shown as 'Built by ...'" style={inputStyle} className="w-full rounded-md px-3 py-2.5 text-sm outline-none focus:border-amber-700" />
            <button onClick={() => setStep(1)} disabled={!toolName.trim()} style={{ backgroundColor: toolName.trim() ? C.brownDark : "#c3b8a1", color: "#f4ead7" }} className="w-full mt-7 py-3 rounded-md text-sm font-semibold flex items-center justify-center gap-2">
              Continue <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <h2 style={{ ...serif, color: C.ink }} className="text-2xl font-bold mb-2">Connect free sources</h2>
            <p style={{ color: C.inkSoft }} className="text-sm mb-5">These power your searches. Pexels is required; Pixabay is optional. Both are free.</p>

            <div style={card} className="rounded-lg p-4 mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2"><KeyRound size={14} style={{ color: C.brown }} /><span style={{ color: C.ink }} className="text-sm font-semibold">Pexels API key</span><span style={{ color: "#a14b3a" }} className="text-[10px]">required</span></div>
                <KeyState s={pxState} />
              </div>
              <a href="https://www.pexels.com/api/new/" target="_blank" rel="noreferrer" style={{ color: C.brown }} className="text-[11px] underline">Get a free key at pexels.com/api →</a>
              <input value={pexelsKey} onChange={(e) => { setPexelsKey(e.target.value); setPxState("idle"); }} onBlur={checkPx} placeholder="Paste your Pexels key" style={inputStyle} className="w-full rounded-md px-3 py-2.5 text-sm outline-none focus:border-amber-700 mt-2" />
              {pxState === "bad" && <div style={{ color: "#a14b3a", ...mono }} className="text-[10px] mt-1.5">That key didn't work. Check it and try again.</div>}
              <div style={{ color: C.muted, ...mono }} className="text-[10px] mt-3 mb-1.5 leading-relaxed">Backup keys (optional) — add a 2nd/3rd key from <span style={{ color: C.inkSoft }}>separate free Pexels accounts</span> to triple your hourly limit. Used automatically only when the main key is maxed out.</div>
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
              <div style={{ color: C.muted, ...mono }} className="text-[10px] mt-3 mb-1.5 leading-relaxed">Backup keys (optional) — 2nd/3rd key from <span style={{ color: C.inkSoft }}>separate free Pixabay accounts</span>, used automatically when the main one is maxed out.</div>
              <input value={pixabayKey2} onChange={(e) => setPixabayKey2(e.target.value)} placeholder="Backup Pixabay key #2 (optional)" style={inputStyle} className="w-full rounded-md px-3 py-2 text-[13px] outline-none focus:border-amber-700 mb-1.5" />
              <input value={pixabayKey3} onChange={(e) => setPixabayKey3(e.target.value)} placeholder="Backup Pixabay key #3 (optional)" style={inputStyle} className="w-full rounded-md px-3 py-2 text-[13px] outline-none focus:border-amber-700" />
            </div>

            <div className="flex gap-2 mt-7">
              <button onClick={() => setStep(0)} style={{ border: `1px solid ${C.line}`, color: C.inkSoft, backgroundColor: C.card }} className="px-4 py-3 rounded-md text-sm">Back</button>
              <button onClick={() => setStep(2)} disabled={pxState !== "ok"} style={{ backgroundColor: pxState === "ok" ? C.brownDark : "#c3b8a1", color: "#f4ead7" }} className="flex-1 py-3 rounded-md text-sm font-semibold flex items-center justify-center gap-2">
                {pxState === "ok" ? <>Continue <ArrowRight size={15} /></>
                  : pxState === "checking" ? <><Loader2 size={15} className="animate-spin" /> Checking your Pexels key…</>
                  : pxState === "bad" ? "That Pexels key didn't work — fix it to continue"
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
            <p style={{ color: C.muted, ...mono }} className="text-[11px] mb-7">Tip: bookmark your tool's link so you can reopen it anytime without re-pasting anything.</p>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} style={{ border: `1px solid ${C.line}`, color: C.inkSoft, backgroundColor: C.card }} className="px-4 py-3.5 rounded-md text-sm">Back</button>
              <button onClick={() => onDone({ toolName: toolName.trim() || "Footage Finder", creator: creator.trim(), pexelsKey: pexelsKey.trim(), pexelsKey2: pexelsKey2.trim(), pexelsKey3: pexelsKey3.trim(), pixabayKey: pixabayKey.trim(), pixabayKey2: pixabayKey2.trim(), pixabayKey3: pixabayKey3.trim() })} style={{ backgroundColor: C.brownDark, color: "#f4ead7", ...mono, letterSpacing: "0.1em" }} className="flex-1 py-3.5 rounded-md text-[13px] font-semibold uppercase">Open my tool</button>
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
