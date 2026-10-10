// download-sw.js — lets the browser's own downloader start saving a clip the
// moment the stock website starts sending it, under the clip's numbered name.
//
// Why this exists: to give a clip its numbered filename, the tool used to read
// the WHOLE file into the page first and only then hand it to the browser to
// save. So on every click, nothing appeared in the browser's downloads until the
// last byte had arrived — a 12 MB clip on a home connection meant ~30 seconds of
// apparently nothing. (Measured: see DOWNLOAD_REGRESSION_REPORT.md.)
//
// This small helper runs in the background of the page (a "service worker").
// When the Download button asks for /ff-download/<file name>?src=<clip address>,
// it fetches the clip straight from Pexels/Pixabay and passes each piece on to
// the browser as it arrives, marked "save this as <file name>". The browser's
// download bar starts at the first piece, exactly like an ordinary download.
// Nothing goes through Vercel, and nothing is held in memory.
//
// It ONLY answers /ff-download/ addresses (its scope), so it can't affect how
// the page itself loads, and it only fetches from Pexels/Pixabay (same list as
// api/proxy.js). The page talks to it over the "ff-download" channel and falls
// back to the old way (read whole file, then save) whenever this isn't working.

const ALLOWED = ["pixabay.com", "pexels.com"];
// Give up only when the clip has STOPPED arriving for this long — the same rule
// as DOWNLOAD_STALL_MS in app.jsx. Slow is fine; silent is not.
const STALL_MS = 30000;
const channel = new BroadcastChannel("ff-download");

function hostAllowed(host) {
  host = (host || "").toLowerCase();
  return ALLOWED.some((d) => host === d || host.endsWith("." + d));
}
// The page already builds a safe name (01_rain_on_a_window_7123973.mp4); this
// only makes sure nothing odd can get into the response header.
function safeName(raw) {
  let n = "";
  try { n = decodeURIComponent(raw || ""); } catch {}
  n = n.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 150);
  return n || "download";
}

// A new version takes over straight away instead of waiting for every tab to close.
self.addEventListener("install", () => self.skipWaiting());
// The page pings while a download runs; receiving the message is what keeps
// this worker from being put to sleep mid-file. Nothing to do with it.
self.addEventListener("message", () => {});

self.addEventListener("fetch", (event) => {
  const u = new URL(event.request.url);
  if (!u.searchParams.has("src")) return; // not ours: let the network handle it
  event.respondWith(serve(u));
});

async function serve(u) {
  const id = u.searchParams.get("id") || "";
  const tell = (stage, extra) => channel.postMessage({ id, stage, ...extra });
  // Tells the page this worker is answering (so it doesn't fall back).
  tell("ack");
  const nothing = () => new Response(null, { status: 204 }); // the hidden frame stays blank

  let target;
  try { target = new URL(u.searchParams.get("src")); } catch {}
  if (!target || target.protocol !== "https:" || !hostAllowed(target.hostname)) {
    tell("fail", { why: "host" });
    return nothing();
  }
  const name = safeName(u.pathname.split("/").pop());
  // The tool only ever saves clips and photos (clipFileName in app.jsx).
  if (!/\.(mp4|jpe?g)$/i.test(name)) {
    tell("fail", { why: "name" });
    return nothing();
  }

  const ctrl = new AbortController();
  let timer;
  // The clock only runs while we are WAITING on the stock site — not while the
  // browser is busy (say, showing a "Save as" box), which is not a stall.
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), STALL_MS); };
  const disarm = () => clearTimeout(timer);

  let upstream;
  arm();
  try {
    upstream = await fetch(target.href, { mode: "cors", credentials: "omit", signal: ctrl.signal });
  } catch {
    disarm();
    tell("fail", { why: "network" }); // includes a site that stopped allowing this
    return nothing();
  }
  disarm();
  if (!upstream.ok || !upstream.body) {
    tell("fail", { status: upstream.status });
    return nothing();
  }

  // Only a size we can trust: a compressed reply's length isn't the file's length.
  const size = upstream.headers.get("content-encoding") ? 0 : Number(upstream.headers.get("content-length")) || 0;
  const reader = upstream.body.getReader();
  let got = 0, last = 0, ended = false;
  // A heartbeat, so the page can tell "slow" apart from "this worker was stopped".
  const beat = setInterval(() => tell("progress", { got, size }), 5000);
  const end = (stage) => { if (ended) return; ended = true; disarm(); clearInterval(beat); tell(stage, { got, size }); };

  const body = new ReadableStream({
    async pull(c) {
      let r;
      arm();
      try {
        r = await reader.read();
      } catch {
        c.error(new Error("stopped")); // the browser marks the download as failed
        end("error");
        return;
      }
      disarm();
      if (ended) return; // cancelled while that piece was on its way
      if (r.done) {
        c.close();
        end("done");
        return;
      }
      got += r.value.byteLength;
      c.enqueue(r.value);
      const now = Date.now();
      if (now - last > 200) { last = now; tell("progress", { got, size }); }
    },
    // The person cancelled it in the browser's download list (or the browser did).
    cancel() {
      ctrl.abort();
      end("cancel");
    },
  });

  tell("start", { size });
  const headers = {
    "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  };
  if (size) headers["Content-Length"] = String(size);
  return new Response(body, { status: 200, headers });
}
