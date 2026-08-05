# Footage Finder — how to put it online

No coding. No installing. It all happens in your web browser.
Takes about 15 minutes, once.

You'll use two free accounts:

- **GitHub** — stores the tool's files.
- **Vercel** — turns those files into a live website (it reads them from GitHub).

Do the steps in order: **Gemini key → GitHub → Vercel**.

---

## Step 1 — Get your free Gemini key

This is the key that powers the AI keyword step.

1. Go to **aistudio.google.com** and sign in with any Google account.
2. Click **Get API key** → **Create API key**.
3. Copy the key. Keep it somewhere safe for a minute — you'll need it in Step 3.

Free, no credit card.

---

## Step 2 — Put the files on GitHub

1. Go to **github.com** and sign up (free) if you don't have an account.
2. Click the **+** (top right) → **New repository**.
3. Name it `footage-finder`. Leave everything else as-is → **Create repository**.
4. Click the link **"uploading an existing file"**.
5. Open your `footage-finder` folder. Drag these onto the page:
   - `index.html`
   - `app.jsx`
   - `vercel.json`
   - `package.json`
   - `README.md`
   - `.gitignore`
   - the whole `api` folder (it holds `keywords.js` **and** `proxy.js`)
6. Click **Commit changes**. Done — the files are on GitHub.

⚠️ **Never upload `.env.local`.** It holds your secret Gemini key. GitHub's
drag-and-drop ignores the `.gitignore` file, so it's on you to leave it out.
Your key goes into Vercel in Step 3 instead.

> After uploading, check the file list. If `.env.local` shows up: click it →
> trash icon → Commit to delete it, then make a new key at aistudio.google.com
> to be safe.

(`dev-server.mjs` is only for testing on your own computer. It's harmless to
upload but not needed.)

---

## Step 3 — Connect Vercel and go live

1. Go to **vercel.com** → **Sign Up** → **Continue with GitHub** (links the two).
2. On your dashboard: **Add New… → Project**.
3. Find `footage-finder` → **Import**.
4. **Before clicking Deploy**, open **Environment Variables** and add your key:
   - **Name:** `GEMINI_KEY`
   - **Value:** paste your Gemini key from Step 1.
   - Click **Add**.
5. Click **Deploy**. Wait about a minute.
6. You get a live link like `https://footage-finder-xxxx.vercel.app`.
   **That's your tool. Bookmark it.**

---

## Step 4 — First run

1. Open your live link. The setup wizard appears.
2. Enter your **Pexels** key (required) and **Pixabay** key (optional).
   These stay in your browser, on your device.
3. Paste a script → hit **Analyse**.

---

## The files (just so you know)

| File | What it does |
|------|--------------|
| `index.html` | The page that loads in the browser. |
| `app.jsx` | Your tool — the design you built. |
| `api/keywords.js` | Hidden relay that safely holds your Gemini key. |
| `api/proxy.js` | Lets the "Download ZIP" button bundle Pixabay clips. |
| `vercel.json` | A tiny settings file for the host. |

---

## If something doesn't work

Tell me the exact message you see. Common ones:

- **"Server missing GEMINI_KEY"** → key wasn't saved in Step 3.4.
  In Vercel: **Settings → Environment Variables**, add it, then
  **Deployments → … → Redeploy**.
- **"Upstream error" (400 / 403)** → Google rejected the key. Check you pasted
  the whole thing and it's active at aistudio.google.com.
- **Keywords fail but footage loads** → that's only the relay. Footage runs
  straight from your browser and isn't affected.
- **Footage stops loading on a long script** → normal. The free Pexels/Pixabay
  accounts have an hourly search limit. Wait about an hour, or add backup keys
  in Settings.

---

## Good to know

- **2 vs 4 clips per scene:** 4 gives more choices but loads slower and makes
  bigger ZIP downloads. It does *not* change the hourly limit — that's set by how
  long your script is, not the clip count.
- **Changing the AI model:** `api/keywords.js` uses `gemini-flash-latest` (free,
  auto-updates so it won't go stale). To try another, edit the `MODEL` line on
  GitHub (pencil → change → Commit). Vercel redeploys automatically.

---

## Security

- Your **Gemini key** is hidden on the server — good.
- Your **Pexels/Pixabay keys** live in your own browser. Fine for personal use.
  Don't hand the link to strangers as-is — anyone technical could read those two
  keys from their own browser. Want to share it publicly? Tell me and we'll hide
  those too.
