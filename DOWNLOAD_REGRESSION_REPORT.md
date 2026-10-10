# Download Regression Report — Footage Finder

_Investigated 10 Oct 2026, against `4385f3c` (the version on `main` after the previous repair)._

## In one paragraph

Clicking **Download** did not hand the file to the browser. The tool read the
*entire* clip into the page first, and only after the last byte arrived did it
ask the browser to save it. So the browser's own download bar stayed empty for
the whole transfer: about 30 s for a 12 MB clip on a ~3 Mbit/s connection. The
previous repair added a percentage to the button, which made the wait visible,
but the wait itself did not change. The percentage was the page reading bytes
into memory, not the browser saving. After this fix, the browser's download
starts at the first byte, **0.32 s** after the click in every test (it was
2.3–100.6 s), under the same numbered filename. The total time to a finished
file is unchanged, because that is the network.

---

## 1. Root cause

### The current pipeline (`4385f3c`)

| Step | Where | What happens |
|---|---|---|
| 1 | `app.jsx:967` `DownloadButton.onClick` → `downloadMedia()` (`app.jsx:909`) | Button shows `0%` within ~3 ms (acknowledgement is fine). |
| 2 | `fetchClipBlob()` `app.jsx:839` → `fetchWithProgress()` `app.jsx:805` | `fetch()` goes out within ~5 ms (no blocking awaits before it). |
| 3 | `fetchWithProgress()` read loop, `app.jsx:819–826` | Every chunk is pushed into an in-memory `parts` array. The `%` on the button counts **bytes read into JavaScript**. |
| 4 | `return new Blob(parts, …)` `app.jsx:827` | Runs only when the **last** byte has arrived. |
| 5 | `URL.createObjectURL(blob)` `app.jsx:923`, `a.click()` `app.jsx:928` | **This is the first moment the browser knows there is a download.** It saves from memory, almost instantly. |
| 6 | Pixabay only, on any direct failure: `fetchWithProgress(clipProxyURL(url))` `app.jsx:847` → `api/proxy.js` | The relay also buffers the whole file (`await upstream.arrayBuffer()`, `api/proxy.js:52`) before sending one byte (`res.send(buf)`, `:57`). So the transfer is buffered twice, in series. |

So **click → browser download initiation = provider time-to-first-byte + the
whole transfer.** The measurements (section 2) match this to within ~0.3 s for
every file size.

### What changed over time (Git history)

There was never a version that started a native download at the first byte.
Every revision since the first commit (`17e3014`) used `fetch → blob → <a download>`.
The "fast" behaviour came from fallbacks that **handed the URL straight to the
browser in a new tab**:

| Commit | Date | Behaviour change | Effect on "how soon does something happen" |
|---|---|---|---|
| `17e3014` / `d89ab62` (`app.jsx:449–472`) | 4–5 Aug | Blob path for everything. When a fetch failed, `window.open(item.download)` (`:470`). Pixabay sent no CORS header then, so **every Pixabay click failed at the headers and opened the clip in a new tab** | Pixabay: a new tab **0.64 s** after the click (measured). That is fast, but it's a tab, not a saved file. Pexels: full-file wait, same as today. |
| `82a1acd` | 5 Aug | Pixabay routed through the new `/api/proxy` relay (whole file buffered on Vercel, then whole file buffered in the page) | Removed Pixabay's instant tab; Pixabay now waited for two full transfers in series plus the function start-up. This matches the earlier 27 s (relay) vs 9 s (direct) observation. |
| `77a4795` | 9 Sep | ~1080p file picker (`pickVideoFile`, `:445`). Previously Pexels took the first-listed `hd` file (`5d7462e:467`), which may have been 720p. Also a **25 s total timeout**, then `window.open` (`:722`) | Possibly bigger Pexels files (depends on API data I couldn't fetch; unverified). Any clip taking > 25 s was cut off and **re-downloaded in a new tab**. |
| `54c6923` (previous repair) | 10 Oct | Live `%`, duplicate-click guard, 30 s *stall* timeout instead of 25 s total, no new-tab fallback, Pixabay direct-first | Fixed duplicates and tab-jumping (confirmed). **Did not change the full-file wait.** For clips over 25 s the browser now shows the download *later* than before (at full transfer instead of a tab at 25 s), just without the tab. |

**The user-visible regression:** the only instant paths, the `window.open`
fallbacks, were removed (rightly, since they navigated away and duplicated
transfers). Nothing replaced them, so every download now visibly starts only
after the full transfer. The progress readout made the wait visible but did not
shorten it.

### Things checked and ruled out
- No await or metadata call blocks the click handler before the request: click → request is 4–12 ms in every run.
- No `HEAD`, signed-URL, auth or provider-API call happens on download.
- Rendering progress is cheap: it redraws only that one button (`setDownloadState`/`useDownloadState`).
- The console `404` seen in every run is `/favicon.ico` (no favicon is declared). It's harmless and unrelated.

---

## 2. Evidence

### Test set-up (read this before the numbers)

- **Browser:** Chromium 141.0.7390.37, headless, Linux. The real app (`index.html` + `app.js`), real buttons, a restored workspace with one clip per scene.
- **Providers:** **simulated.** This environment's network policy blocks
  `api.pexels.com`, `images.pexels.com`, `videos.pexels.com`, `pixabay.com` and
  `cdn.pixabay.com`, and the app's CDNs as well. I mapped those real hostnames
  to a local HTTPS server, so the app's own URLs, host checks and CORS rules ran
  unchanged. The CDN files were served as the same pinned versions from npm
  (react 18.3.1, react-dom 18.3.1, jszip 3.10.1). Icons were stubbed; they don't
  touch downloading.
- **Network:** one shared ~400 KB/s link (~3.2 Mbit/s) with 300 ms time-to-first-byte.
  This is calibrated to the earlier on-your-connection observation (3.5 MB in about 9 s); here the same 3.5 MB clip took 9.1 s.
- **Cache:** every response is `Cache-Control: no-store`, so **every row is cold / uncached.** Warm-cache runs were not done.
- **Integrity:** the bytes are deterministic, so every saved file was SHA-256-checked against the expected content.
- **Clocks:**
  - *Click → native download* = Playwright's `download` event (the browser's own download has begun).
  - *Click → completed* = the file is finished on disk.
  - *Click → request* and *TTFB* come from the server log.

### Single-item downloads (cold)

| Version | Provider | Type | Size | Path | Click→request | Request→first byte | **Click→native download** | Click→completed file | Result |
|---|---|---|---|---|---|---|---|---|---|
| Before `4385f3c` | Pexels | photo | 0.9 MB | fetch → Blob → save | 0.01 s | 0.30 s | **2.53 s** | 2.53 s | OK, numbered name, bytes verified |
| Before | Pixabay | photo | 0.8 MB | fetch → Blob → save | 0.00 s | 0.30 s | **2.28 s** | 2.28 s | OK |
| Before | Pixabay | video | 3.5 MB | fetch → Blob → save | 0.01 s | 0.30 s | **9.12 s** | 9.13 s | OK |
| Before | Pexels | photo (large) | 6 MB | fetch → Blob → save | 0.01 s | 0.30 s | **15.34 s** | 15.36 s | OK |
| Before | Pexels | video 1080p | 12 MB | fetch → Blob → save | 0.00 s | 0.30 s | **30.45 s** | 30.50 s | OK |
| Before (big player) | Pexels | video 1080p | 12 MB | fetch → Blob → save | 0.01 s | 0.30 s | **30.41 s** | 30.45 s | OK |
| Before | Pexels | video (large) | 40 MB | fetch → Blob → save | 0.01 s | 0.30 s | **100.56 s** | 100.77 s | OK |
| **After (fix)** | Pexels | photo | 0.9 MB | helper stream → native | 0.01 s | 0.30 s | **0.32 s** | 2.53 s | OK, same name, bytes verified |
| After | Pixabay | photo | 0.8 MB | helper stream → native | 0.01 s | 0.30 s | **0.32 s** | 2.28 s | OK |
| After | Pixabay | video | 3.5 MB | helper stream → native | 0.01 s | 0.30 s | **0.32 s** | 9.11 s | OK |
| After | Pexels | photo (large) | 6 MB | helper stream → native | 0.01 s | 0.30 s | **0.31 s** | 15.31 s | OK |
| After | Pexels | video 1080p | 12 MB | helper stream → native | 0.01 s | 0.30 s | **0.32 s** | 30.39 s | OK |
| After (big player) | Pexels | video 1080p | 12 MB | helper stream → native | 0.01 s | 0.30 s | **0.32 s** | 30.36 s | OK |
| After | Pexels | video (large) | 40 MB | helper stream → native | 0.01 s | 0.30 s | **0.32 s** | 100.44 s | OK |
| `7eb7e16` (8 Oct) | Pexels | photo | 0.9 MB | fetch → Blob → save | 0.01 s | 0.30 s | 2.52 s | 2.53 s | OK, but **no click feedback at all** |
| `7eb7e16` | Pexels | video 1080p | 12 MB | fetch → **25 s timeout** → `window.open` | 0.01 s | 0.30 s | — | — | **No file.** New tab at ≈25 s, which downloads the clip again (3 provider requests) |
| `7eb7e16` | Pixabay | video | 3.5 MB | relay → Blob → save | 0.02 s | 0.30 s | 9.14 s | 9.16 s | OK (local relay; doesn't include Vercel's start-up or distance) |
| `d89ab62` (5 Aug) | Pexels | photo | 0.9 MB | fetch → Blob → save | 0.01 s | 0.30 s | 2.52 s | 2.53 s | OK, same wait as today |
| `d89ab62` | Pexels | video 1080p | 12 MB | fetch → Blob → save | 0.00 s | 0.30 s | 30.29 s | 30.36 s | OK, same wait as today |
| `d89ab62`, Pixabay without CORS (as it was then) | Pixabay | video | 3.5 MB | CORS error → `window.open` | 0.01 s | 0.30 s | — (**tab at 0.64 s**) | — | **No file**, clip opened in a new tab |

**Click → visible acknowledgement:** 2–6 ms in every run, before and after
(`7eb7e16` had none). It was never the problem.

### Multi-file, cancel and repeat-click (cold)

| Case | Before | After |
|---|---|---|
| **ZIP**, 4 mixed clips (17.2 MB: Pexels photo + video, Pixabay photo + video) | Native download at 43.76 s. Archive holds `01_…jpg`, `03_…mp4`, `04_…jpg`, `05_…mp4`, all bytes verified. 3 parallel fetches. | Native download at 43.56 s. Same 4 names, same order, all verified. **Unchanged by design** (see 3). |
| **Files** button, 3 clips | (not run) | 3 files, one after another as before. Each starts natively 0.31 s after its turn begins (+0.31 s, +3.43 s, +6.31 s); all bytes verified. |
| **3 rapid clicks**, then an intentional retry later | 1 request, 1 file; retry gives the 2nd file | 1 request, 1 file; retry gives the 2nd file, verified |
| **Cancel** in the browser's download list | n/a (nothing to cancel until the file was complete) | Provider connection aborted after 0.59 MB (no wasted bandwidth). Button back to "Download", no error notice. |

### Failure handling (cold)

| Case | Before | After |
|---|---|---|
| 404 / 403 / 429 from the provider | "Didn't work" at ~0.3 s; no file, tab or navigation | Same. The helper reports `fail(404/403/429)` at 0.31 s; 1 request. |
| No `Content-Length` (chunked) | "Downloading…" (no fake %), saved at 7.90 s | Native at **0.32 s**, "Downloading…", saved at 7.89 s, verified |
| Connection cut at 2.5 MB of 6 MB | "Didn't work" at ~6.6 s; nothing saved | Native at 0.31 s. At 6.6 s the browser marks the download **failed** (no truncated file passed off as finished) and the button shows "Didn't work". |
| Stall (no bytes after 2 MB) | "Didn't work" 30 s after the last byte (~35 s) | Same rule: browser download failed and "Didn't work" at 35.4 s |
| Pixabay without CORS (relay fallback) | Relay, saved at 9.41 s (2 provider requests) | Helper `fail(network)` at 0.31 s, then relay, saved at **9.38 s** (2 provider requests). One run read 14.1 s: I had a probe running on the same simulated link at the time; the isolated re-run is 9.38 s. |
| Same, but the clip is over 4.5 MB, with Vercel's 4.5 MB response cap emulated | **"Didn't work"** (relay returns 500) | **"Didn't work"**, identical. Pre-existing; see Known limitations. |
| Helper registered but never answers | n/a | After the 4 s watchdog: old route, saved at 13.0 s, 1 provider request, no duplicate, no tab. The helper is switched off for the rest of the visit. |
| `download-sw.js` not uploaded | n/a | Old route straight away: saved at 9.12 s (same as before), plus one console 404 for the missing script |

### Will the browser keep the helper alive through a long download?

Chromium is known to stop idle service workers and to cap long events. I
checked this **without any automation attached** (DevTools would keep the worker
alive and hide the problem), using plain headless Chromium. Results were
recorded server-side.

- **5.9-minute download (39 MB):** finished complete and correctly named, in all
  three keep-alive variants I tried. That includes the one shipped: no
  `waitUntil`, plus page pings every 10 s.
- **Cold worker (idle 50 s first):** acknowledged in 11 ms, stream started at 318 ms. Fresh install: 7 ms / 314 ms.

---

## 3. Patch summary

| File | Change | Why |
|---|---|---|
| `download-sw.js` (new, 142 lines) | A service worker, **scoped only to `/ff-download/`**. It never sees the page's own loading, scripts or API calls. For `/ff-download/<name>?src=<clip URL>` it `fetch`es the clip from Pexels/Pixabay (**https + the same host allow-list as `api/proxy.js`**; name must end in `.mp4`/`.jpg`) and returns it as a streamed `Response` with `Content-Disposition: attachment; filename="<numbered name>"`, plus the upstream `Content-Type` and (when trustworthy) `Content-Length`. It reports `ack/start/progress/done/fail/error/cancel` on a `BroadcastChannel`. It keeps the 30 s *stall* rule, counted only while waiting on the provider, and aborts upstream if the person cancels. | Lets the browser's own downloader receive the bytes **as they arrive**, with our filename. No server hop, no Vercel bandwidth or time limit, nothing held in memory. |
| `app.jsx` `clipHostAllowed()` (`:799`), helper start-up + `nativeDownload()` (`:875–948`) | Registers the helper in the background. `nativeDownload()` points a hidden `<iframe>` (so the page itself never navigates) at the helper URL, then follows the helper's messages: a 4 s "is it answering?" watchdog, a 45 s silence watchdog, and keep-alive pings. | Page side of the above. |
| `app.jsx` `downloadMedia()` (`:993`) | If the helper is ready and the host is allowed: native path. Otherwise, or if the helper doesn't answer: **the old `fetchClipBlob` route, unchanged**. If the provider refuses before sending (CORS/network/HTTP error), Pixabay still gets its relay second chance, as before. The duplicate-click guard, filename, progress %, "Saved ✓ / Didn't work" states and error notice are the same code. | The smallest change that routes single-clip bytes to the browser instead of into memory. |
| `app.js` | Rebuilt from `app.jsx`. My reproduction of `footage-finder-build` (Babel `preset-react`, classic runtime, same header) was **byte-identical** to the committed `app.js` before any edits. The rebuilt file differs only in the download section and the header hash. | The page runs `app.js`. |
| `README.md` | Two lines: `download-sw.js` added to the "long way" upload list and to the files table. | Without the file deployed, the tool silently uses the old (slow) route. |

**Not changed:** the ZIP builder (`downloadZip`, `app.jsx:2171`), the Files button logic, `api/proxy.js`, all UI wording and styling, and all search and keyword code.

**Rollback:** revert this commit. Or, for a quick kill-switch without a code
change, delete `download-sw.js` from the deployment: registration then fails and
every download takes the old route, as tested. A helper already installed in a
browser stays registered but goes unused once the page can't register it.

---

## 4. Verification

**Run (all in Chromium 141, real UI, simulated providers, cold):**
- Tile button and big-player button.
- Photos and videos from both providers, 0.8 MB to 40 MB.
- Filename and SHA-256 of every saved file checked.
- 3 rapid clicks plus a retry; cancel in the browser.
- The Files button; a ZIP of mixed providers.
- 404/403/429, missing `Content-Length`, a mid-stream cut, a stall.
- Pixabay without CORS → relay; the relay over Vercel's cap.
- Helper not answering; helper file missing; first click right after load.
- A 5.9-minute transfer and a cold idle worker **without automation**.
- Old revisions `7eb7e16` and `d89ab62` under identical conditions.

In every run: no new tabs, no page navigation, and no page errors (the only
console error is `/favicon.ico`).

**Build:** `app.js` rebuilt with the reproduced build and `node --check`ed.
`npm run dev` serves `download-sw.js` as `text/javascript`. The repo has no
automated test suite to run.

**Not verified (no access from this environment):**
- Real Pexels/Pixabay responses: headers, CORS, redirects, real time-to-first-byte.
  The fix relies on the same CORS permission the current code already relies on
  for direct downloads. When it's missing, the fallback was tested.
- Production Vercel.
- Firefox, Safari, mobile browsers.
- A real "Save as…" dialog.
- Warm-cache behaviour.

**Browser support (from documentation, not tested here):**
- *Chrome/Edge:* tested engine.
- *Firefox:* service-worker downloads are a long-standing technique; the 10 s pings are meant to cover its shorter idle timeout (untested).
- *Safari:* streams service-worker downloads to disk from 15.4/16. iOS 18.2–18.3 had a bug that interrupted them, fixed in 18.4. Older Safari doesn't intercept, so the 4 s watchdog falls back to the old route (cost: ~4 s once per visit).
- *Private windows that disable service workers:* the old route.

**Known limitations**
- **ZIP still waits for every file.** It must have all bytes to build the archive. It already fetches 3 at a time; the archive appears when the last file is in.
- **Pixabay relay fallback (pre-existing, not changed):** `api/proxy.js` buffers the whole file and sends it in one go. Vercel caps such a response at 4.5 MB (`FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE`), so if Pixabay ever stops sending CORS again, clips over 4.5 MB fail through the relay. That's true before and after this change. Streaming the relay would fix it, but I couldn't test it on Vercel here.
- If someone has a helper download running when a new version of `download-sw.js` is deployed and activates, that one download may be interrupted. Pressing Download again works.
- **Files** button: Chrome may ask once to "allow multiple downloads", as it already did.

---

## 5. What this means for you

- **What was causing the lag:** the tool insisted on holding the whole clip in
  the page before telling the browser to save it. The button's percentage was
  that loading-into-the-page, not the browser saving. Your browser had nothing
  to show until the very end.
- **What now begins immediately:** the browser's own download, under the same
  numbered file name, as soon as Pexels or Pixabay start sending. That was
  0.3 s in testing (it can be a little more on a slow link or a slow provider).
  The button still shows its percentage.
- **What still takes time:** the transfer itself. A 12 MB clip on a ~3 Mbit/s
  connection still takes ~30 s to *finish*, but you see it in the browser's
  downloads from the start, and you can carry on picking clips meanwhile.
- **ZIP:** works as before. It still has to fetch everything and pack it before
  the one file appears.
- **To deploy:** upload **`download-sw.js`** (new) together with `app.js`,
  `app.jsx` and `README.md`, then let Vercel redeploy. No settings, keys or
  cache-clearing needed. The helper installs itself on the first page load
  after the deploy. If you click Download within the first moment of that very
  first load, that one download uses the old route.
