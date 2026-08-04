// React hooks + icons are provided as globals by index.html (loaded from a CDN).
// No build step, no npm install — the browser reads this file directly.
const { useState, useEffect, useMemo, useRef } = React;
const {
  Play, Download, ExternalLink, Shuffle, RefreshCw, Check, X,
  Film, Image: ImageIcon, Sparkles, KeyRound, ArrowRight,
  Loader2, FileText, Settings, Pencil, CheckCircle2, Circle, Trash2,
  Sun, Moon, Monitor, Smartphone,
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
/*  API HELPERS                                                        */
/* ------------------------------------------------------------------ */
// Google Gemini's free tier allows only ~15 requests per minute. A long script
// fires many keyword calls in a few seconds, which blows past that and comes
// back as 429 "rate limited" — the cause of scenes showing the raw script line
// instead of a real search. Two defences below keep every AI call reliable:
//
//   1) throttleGemini() — a shared gate that spaces our calls ~4.2s apart, so
//      we stay just under the 15/minute ceiling instead of flooding it.
//   2) callClaude()'s retry loop — if a call is rate-limited anyway (429) or the
//      model is briefly overloaded (500/503), it waits and tries again a few
//      times with growing pauses, instead of giving up and falling back to a
//      raw script line.
//
// (The function is still named callClaude for historical reasons; the relay it
// calls now talks to Google Gemini, not Claude. The browser never sees the key.)
// Pacing between AI calls. The free Gemini tier allows ~15 calls/min PER KEY,
// and the relay rotates across 3 keys, so the safe combined ceiling is ~45/min.
// 1600ms ≈ 37 calls/min leaves comfortable margin, and if any single key does
// hit its cap the relay just rotates to the next one. (Was 4200ms — tuned for a
// single key. With 3 keys we can go much faster without risking rate limits.)
const GEMINI_MIN_GAP_MS = 1600; // 60000 / 1600 ≈ 37 calls per minute across 3 keys
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
    `WHEN TO SPLIT - only when one sentence lists several DIFFERENT things a camera would film ` +
    `separately (different actions, or distinct states). Keep each piece's real words; you may ` +
    `carry the subject forward so a piece stands alone, but change nothing else:\n` +
    `  "kids climbed trees, built forts, and disappeared outside for hours"\n` +
    `    -> ["kids climbed trees", "kids built forts", "kids disappeared outside for hours"]\n` +
    `  "the room they're in is warm, safe, well-lit"\n` +
    `    -> ["a warm room", "a safe room", "a well-lit room"]\n` +
    `  "whether it was sunny or cloudy, summer or winter"\n` +
    `    -> ["a sunny day", "a cloudy day", "a summer scene", "a winter scene"]\n\n` +
    `WHEN TO KEEP AS ONE - an abstract claim or single idea with no distinct sub-actions, and ` +
    `commas that just describe the SAME thing, stay ONE beat in the script's own words:\n` +
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
    `Return ONLY a JSON array of strings, in order. No commentary.\n\nScript:\n"""${script}"""`;
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
async function pixabayPhotos(q, key, page = 1, orientation = "landscape", perPage = 4) {
  const pbOrient = orientation === "portrait" ? "vertical" : "horizontal";
  const r = await fetch(
    `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}&image_type=photo&orientation=${pbOrient}`
  );
  if (r.status === 429) throw new Error("PIXABAY_RATE");
  if (!r.ok) return [];
  const d = await r.json();
  return (d.hits || []).map((h) => ({
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
function broadenQueries(q) {
  const words = q.trim().split(/\s+/);
  const out = [];
  if (words.length > 3) out.push(words.slice(0, 3).join(" "));
  if (words.length > 2) out.push(words.slice(0, 2).join(" "));
  return out;
}

// Try each API key in turn, rotating to the next ONLY when the current one is
// rate-limited (its hourly/per-minute quota is used up). Giving each source a
// 2nd and 3rd key from separate free accounts multiplies the usable quota, so
// long scripts and heavy reshuffling don't run dry. A non-rate error (e.g. a
// rejected key) is thrown straight away — rotating wouldn't help there.
async function withKeyRotation(keys, rateSignal, fn) {
  const list = (keys || []).filter(Boolean);
  for (let i = 0; i < list.length; i++) {
    try {
      return await fn(list[i]);
    } catch (e) {
      if (e && e.message === rateSignal && i < list.length - 1) continue;
      throw e;
    }
  }
  return [];
}

async function searchScene(q, opts) {
  const { pexelsKeys = [], pixabayKeys = [], sources, mediaTypes, page, orientation = "landscape", perPage = 4 } = opts;
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
    // "Clips / scene" (perPage) means N videos AND N photos — BALANCED. With both
    // Pexels and Pixabay on, each source returns its own perPage, so a type can
    // arrive as up to 2×perPage; we cap EACH type to perPage independently. This
    // is what stops the "4 videos but only 2 images" lopsidedness: videos and
    // photos are trimmed to the same target, so a mixed pick is always even.
    const vids = flat.filter((r) => r.type === "video").slice(0, perPage);
    const phts = flat.filter((r) => r.type === "photo").slice(0, perPage);
    // Interleave so the grid alternates video/photo instead of all-videos-first.
    const out = [];
    for (let i = 0; i < Math.max(vids.length, phts.length); i++) {
      if (i < vids.length) out.push(vids[i]);
      if (i < phts.length) out.push(phts[i]);
    }
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

async function downloadMedia(item, seq, total) {
  // Prefix the file with the zero-padded scene number (01_, 02_, ...) so that
  // when the creator imports everything into an editor, the files sort in
  // script/timeline order. Pad width follows the scene count (min 2 digits) so
  // 100+ scene scripts still sort correctly. The stock id stays in the name so
  // two clips from the SAME scene don't overwrite each other.
  const pad = Math.max(2, String(total || 0).length);
  const prefix = seq ? String(seq).padStart(pad, "0") + "_" : "";
  try {
    const res = await fetch(item.download);
    if (!res.ok) throw new Error("bad");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prefix}${item.label.replace(/[^a-z0-9]+/gi, "_")}.${item.type === "video" ? "mp4" : "jpg"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch {
    window.open(item.download, "_blank");
  }
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
async function persist(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
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
  const [sceneBusy, setSceneBusy] = useState({});
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [playing, setPlaying] = useState(null);

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
        setStatus("Welcome back. Paste a new script and hit Analyse.");
      }
      setBooted(true);
    })();
  }, []);

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
      // phase 1 — keywords in batches (full context)
      // 10 scenes per call: fewer round-trips = much faster on long scripts. The
      // FULL script still rides along in every call, so context/drift is unchanged.
      const size = 10;
      const batches = [];
      for (let i = 0; i < lines.length; i += size) batches.push(lines.slice(i, i + size));
      let keywords = [];
      for (let b = 0; b < batches.length; b++) {
        setProgress({ pct: ((b) / batches.length) * 35, label: `Analysing batch ${b + 1}/${batches.length} with full context...` });
        keywords = keywords.concat(await generateKeywords(script, batches[b]));
      }
      // phase 2 — search each scene
      const acc = [];
      let rateHit = false;
      for (let i = 0; i < lines.length; i++) {
        const kw = keywords[i];
        setProgress({ pct: 35 + ((i + 1) / lines.length) * 65, label: `Scene ${i + 1}/${lines.length} → "${kw}"` });
        let results = [];
        try {
          results = await searchScene(kw, { pexelsKeys, pixabayKeys, sources, mediaTypes, orientation, perPage: perScene, page: 1 });
        } catch (err) {
          if (err.message === "PEXELS_RATE") rateHit = true; // keep going, just no results for this scene
          else throw err; // real errors (auth, Claude) still abort
        }
        acc.push({ id: "sc-" + i, line: lines[i], keyword: kw, page: 1, results, orientation, perScene });
        setScenes([...acc]);
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
    setBusy(s.id, true);
    try {
      const page = (s.page || 1) + 1;
      const results = await searchScene(s.keyword, { pexelsKeys, pixabayKeys, sources, mediaTypes, orientation: s.orientation || orientation, perPage: s.perScene || perScene, page });
      updateScene(s.id, { results: results.length ? results : s.results, page });
    } catch (e) { noteSceneError(e); }
    setBusy(s.id, false);
  }
  async function regenScene(s) {
    setBusy(s.id, true);
    try {
      const kw = await regenKeyword(script, s.line, s.keyword);
      const results = await searchScene(kw, { pexelsKeys, pixabayKeys, sources, mediaTypes, orientation: s.orientation || orientation, perPage: s.perScene || perScene, page: 1 });
      updateScene(s.id, { keyword: kw, results, page: 1 });
    } catch (e) { noteSceneError(e); }
    setBusy(s.id, false);
  }
  async function applyKeyword(s, kw) {
    setEditing(null);
    if (!kw.trim() || kw === s.keyword) return;
    setBusy(s.id, true);
    try {
      const results = await searchScene(kw, { pexelsKeys, pixabayKeys, sources, mediaTypes, orientation: s.orientation || orientation, perPage: s.perScene || perScene, page: 1 });
      updateScene(s.id, { keyword: kw, results, page: 1 });
    } catch (e) { noteSceneError(e); }
    setBusy(s.id, false);
  }
  // Per-scene orientation override: re-run just this scene's search in the
  // chosen orientation, leaving every other scene untouched.
  async function setSceneOrientation(s, next) {
    if ((s.orientation || orientation) === next) return;
    updateScene(s.id, { orientation: next }); // reshape tiles immediately
    setBusy(s.id, true);
    try {
      const results = await searchScene(s.keyword, { pexelsKeys, pixabayKeys, sources, mediaTypes, orientation: next, perPage: s.perScene || perScene, page: 1 });
      updateScene(s.id, { results: results.length ? results : s.results, page: 1 });
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

  async function downloadAll() {
    const items = Object.values(selected);
    // Map every result id to its scene number (1-based) so each downloaded file
    // is prefixed with the scene it belongs to and imports in timeline order.
    const sceneOf = {};
    scenes.forEach((s, i) => s.results.forEach((r) => { sceneOf[r.id] = i + 1; }));
    for (const it of items) {
      await downloadMedia(it, sceneOf[it.id], scenes.length);
      await new Promise((r) => setTimeout(r, 600));
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
    a.download = `${toolName.replace(/[^a-z0-9]+/gi, "_")}_shotlist.txt`;
    a.click();
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
        .ff-tile:hover img{transform:scale(1.05);}
        .ff-scroll::-webkit-scrollbar{height:8px;width:8px}
        .ff-scroll::-webkit-scrollbar-thumb{background:${C.line};border-radius:8px}
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
            onChange={(e) => setScript(e.target.value)}
            placeholder="Paste your YouTube script here. Each sentence is read in context — Claude understands the scene before and after each line to find footage that fits the exact moment, not just the words..."
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
        </div>

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
              <div key={s.id} style={{ backgroundColor: C.cardAlt, border: `1px solid ${C.line}` }} className="rounded-lg overflow-hidden">
                {/* scene head */}
                <div className="px-4 pt-3.5 pb-3">
                  <div className="flex items-start gap-3">
                    <span style={{ ...mono, color: C.brown }} className="text-[12px] font-bold pt-0.5">{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex-1 min-w-0">
                      <div style={{ color: C.ink }} className="text-[14px] leading-snug">{s.line}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span style={{ color: C.muted }}>→</span>
                        {editing === s.id ? (
                          <input
                            autoFocus
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onBlur={() => applyKeyword(s, editVal)}
                            onKeyDown={(e) => { if (e.key === "Enter") applyKeyword(s, editVal); if (e.key === "Escape") setEditing(null); }}
                            style={{ ...mono, backgroundColor: C.card, border: `1px solid ${C.brown}`, color: C.inkSoft }}
                            className="text-[11px] px-2 py-0.5 rounded outline-none w-64 max-w-full"
                          />
                        ) : (
                          <button
                            onClick={() => { setEditing(s.id); setEditVal(s.keyword); }}
                            style={{ ...mono, color: C.inkSoft }}
                            className="text-[11px] inline-flex items-center gap-1.5 group"
                            title="Click to edit this search"
                          >
                            "{s.keyword}"
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
                    <div className="flex items-center gap-1.5">
                      {(() => { const ori = s.orientation || orientation; return (
                        <div style={{ border: `1px solid ${C.line}`, backgroundColor: C.card }} className="flex rounded overflow-hidden mr-0.5">
                          <button onClick={() => setSceneOrientation(s, "landscape")} disabled={busy} title="Landscape footage for this scene" style={{ backgroundColor: ori === "landscape" ? C.brown : "transparent", color: ori === "landscape" ? "#fff" : C.inkSoft }} className="p-1.5 hover:opacity-80 disabled:opacity-40"><Monitor size={13} /></button>
                          <button onClick={() => setSceneOrientation(s, "portrait")} disabled={busy} title="Portrait footage for this scene" style={{ backgroundColor: ori === "portrait" ? C.brown : "transparent", color: ori === "portrait" ? "#fff" : C.inkSoft }} className="p-1.5 hover:opacity-80 disabled:opacity-40"><Smartphone size={13} /></button>
                        </div>
                      ); })()}
                      <button onClick={() => shuffleScene(s)} disabled={busy} title="Shuffle — new results, same search" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="p-1.5 rounded hover:opacity-80 disabled:opacity-40"><Shuffle size={13} /></button>
                      <button onClick={() => regenScene(s)} disabled={busy} title="Regenerate — new AI search angle" style={{ border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="p-1.5 rounded hover:opacity-80 disabled:opacity-40"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /></button>
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
                    <div style={{ ...mono, color: C.muted }} className="text-[11px] py-6 text-center">No results — try Shuffle or Regenerate.</div>
                  ) : (
                    <div className={`grid gap-2 ${(s.perScene || perScene) === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
                      {s.results.map((r) => {
                        const sel = !!selected[r.id];
                        return (
                          <div
                            key={r.id}
                            onClick={() => toggleSel(r)}
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
                            {/* hover overlay — buttons only; the tile itself previews on hover */}
                            <div style={{ background: "linear-gradient(to top, rgba(57,39,26,0.92), rgba(57,39,26,0.15) 55%, transparent)" }} className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end pointer-events-none">
                              <div className="p-2 pointer-events-auto">
                                <div style={{ ...mono }} className="text-[8px] text-white/85 mb-1 truncate">{r.label}</div>
                                <div className="flex items-center gap-1.5">
                                  {r.type === "video" && r.preview && (
                                    <button onClick={(e) => { e.stopPropagation(); setPlaying({ ...r, _seq: i + 1, _total: scenes.length }); }} title="Play full preview with sound" style={{ ...mono }} className="flex items-center gap-1 text-[9px] text-white bg-white/15 hover:bg-white/25 px-1.5 py-1 rounded">
                                      <Play size={9} /> Sound
                                    </button>
                                  )}
                                  <button onClick={(e) => { e.stopPropagation(); downloadMedia(r, i + 1, scenes.length); }} style={{ ...mono }} className="flex items-center gap-1 text-[9px] text-white bg-white/15 hover:bg-white/25 px-1.5 py-1 rounded">
                                    <Download size={9} /> Save
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); window.open(r.url, "_blank"); }} style={{ ...mono }} className="flex items-center gap-1 text-[9px] text-white bg-white/15 hover:bg-white/25 px-1.5 py-1 rounded">
                                    <ExternalLink size={9} /> View
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
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => selectAll(s)} style={{ ...mono, border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="text-[10px] px-2.5 py-1 rounded hover:opacity-80">Select all</button>
                    <button onClick={() => clearScene(s)} style={{ ...mono, border: `1px solid ${C.line}`, backgroundColor: C.card, color: C.inkSoft }} className="text-[10px] px-2.5 py-1 rounded hover:opacity-80">Clear</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* selected bar */}
      {selectedCount > 0 && (
        <div style={{ backgroundColor: C.brownDark }} className="fixed bottom-0 left-0 right-0 z-30 shadow-2xl">
          <div className="max-w-5xl mx-auto px-5 sm:px-8 py-3 flex items-center justify-between gap-3">
            <div style={{ ...mono, color: "#f4ead7" }} className="text-[12px]">
              <span className="font-bold">{selectedCount}</span> clip{selectedCount > 1 ? "s" : ""} selected
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportShotList} style={{ ...mono, color: "#f4ead7", border: "1px solid rgba(244,234,215,0.3)" }} className="text-[11px] px-3 py-1.5 rounded flex items-center gap-1.5 hover:bg-white/10">
                <FileText size={12} /> Shot list
              </button>
              <button onClick={downloadAll} style={{ ...mono, backgroundColor: "#f4ead7", color: C.brownDark }} className="text-[11px] px-3 py-1.5 rounded flex items-center gap-1.5 font-semibold hover:opacity-90">
                <Download size={12} /> Download all
              </button>
              <button onClick={() => setSelected({})} style={{ color: "#f4ead7" }} className="p-1.5 rounded hover:bg-white/10" title="Clear selection">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* video modal */}
      {playing && (
        <div onClick={() => setPlaying(null)} style={{ backgroundColor: "rgba(28,22,15,0.82)" }} className="fixed inset-0 z-40 flex items-center justify-center p-5">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl">
            <video src={playing.preview} controls autoPlay className="w-full rounded-lg bg-black" style={{ maxHeight: "70vh" }} />
            <div className="flex items-center justify-between mt-3">
              <span style={{ ...mono, color: "#f4ead7" }} className="text-[11px]">{playing.label}</span>
              <div className="flex gap-2">
                <button onClick={() => downloadMedia(playing, playing._seq, playing._total)} style={{ ...mono, backgroundColor: "#f4ead7", color: C.brownDark }} className="text-[11px] px-3 py-1.5 rounded flex items-center gap-1.5 font-semibold"><Download size={12} /> Save</button>
                <button onClick={() => window.open(playing.url, "_blank")} style={{ ...mono, color: "#f4ead7", border: "1px solid rgba(244,234,215,0.3)" }} className="text-[11px] px-3 py-1.5 rounded flex items-center gap-1.5"><ExternalLink size={12} /> View</button>
                <button onClick={() => setPlaying(null)} style={{ color: "#f4ead7" }} className="p-1.5"><X size={18} /></button>
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
  const [pxState, setPxState] = useState("idle"); // idle|checking|ok|bad
  const [pbState, setPbState] = useState("idle");

  const steps = ["Brand", "Free sources", "Ready"];

  async function checkPx() {
    if (!pexelsKey.trim()) return;
    setPxState("checking");
    setPxState((await validatePexels(pexelsKey.trim())) ? "ok" : "bad");
  }
  async function checkPb() {
    if (!pixabayKey.trim()) { setPbState("idle"); return; }
    setPbState("checking");
    setPbState((await validatePixabay(pixabayKey.trim())) ? "ok" : "bad");
  }

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

        {/* stepper */}
        <div className="flex items-center gap-2 mb-7">
          {steps.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div
                style={{
                  backgroundColor: i <= step ? C.brown : C.cardAlt,
                  color: i <= step ? "#fff" : C.muted,
                  border: `1px solid ${i <= step ? C.brown : C.line}`,
                }}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
              >
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              {i < steps.length - 1 && <div style={{ backgroundColor: i < step ? C.brown : C.line }} className="h-px flex-1" />}
            </div>
          ))}
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
                {pxState === "ok" ? <>Continue <ArrowRight size={15} /></> : "Verify your Pexels key to continue"}
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
            <button onClick={() => onDone({ toolName: toolName.trim() || "Footage Finder", creator: creator.trim(), pexelsKey: pexelsKey.trim(), pexelsKey2: pexelsKey2.trim(), pexelsKey3: pexelsKey3.trim(), pixabayKey: pixabayKey.trim(), pixabayKey2: pixabayKey2.trim(), pixabayKey3: pixabayKey3.trim() })} style={{ backgroundColor: C.brownDark, color: "#f4ead7", ...mono, letterSpacing: "0.1em" }} className="w-full py-3.5 rounded-md text-[13px] font-semibold uppercase">Open my tool</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Mount the app into the page.
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<FootageFinder />);
