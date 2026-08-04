# Footage Finder — how to put it online

You don't need to install anything or write code. Everything happens in your
web browser. Total time: about 15 minutes, once.

There are two free accounts involved:

- **GitHub** — a place to store the tool's files.
- **Vercel** — the free host that turns those files into a live website.

Vercel reads the files from GitHub, so we do GitHub first.

---

## What each file is (just so you know)

| File | What it does |
|------|--------------|
| `index.html` | The page that loads in the browser. |
| `app.jsx` | Your tool — the exact design you built, barely changed. |
| `api/keywords.js` | The hidden "relay" that safely holds your AgentRouter key. |
| `vercel.json` | A tiny settings file for the host. |

The whole folder to upload is: **`footage-finder`**.

---

## Step 1 — Put the files on GitHub

1. Go to **github.com** and sign up (free) if you don't have an account.
2. Click the **+** at the top right → **New repository**.
3. Name it `footage-finder`. Leave everything else default. Click
   **Create repository**.
4. On the next page, click the link **"uploading an existing file"**.
5. Open your `footage-finder` folder on your computer. Select the files and the
   `api` folder — but **do NOT select `.env.local`**. Drag the rest onto the
   GitHub page.
   - ⚠️ **`.env.local` holds your secret AgentRouter key. Never upload it.**
     GitHub's drag-and-drop does *not* respect the `.gitignore` file, so it's
     on you to leave `.env.local` out. Your key goes into Vercel separately in
     Step 2.4 — the live site never needs this file.
   - The files you DO want up there: `index.html`, `app.jsx`, `api/keywords.js`,
     `vercel.json`, `package.json`, `README.md`, `.gitignore`. (`dev-server.mjs`
     is harmless to include; it's only used on your own computer.)
   - Make sure `api/keywords.js` comes along — it should show up as
     `api/keywords.js` in the list.
6. Click **Commit changes**. Your files are now on GitHub.
   - Double-check the file list on GitHub does **not** show `.env.local`. If it
     does, click it → the trash icon → Commit to delete it, then rotate your key
     (make a new one in AgentRouter) to be safe.

---

## Step 2 — Connect Vercel and go live

1. Go to **vercel.com** → **Sign Up** → choose **Continue with GitHub**
   (this links the two accounts). It's free.
2. On your Vercel dashboard click **Add New… → Project**.
3. Find `footage-finder` in the list and click **Import**.
4. **Before clicking Deploy**, open the **Environment Variables** section and
   add your secret key:
   - **Name:** `AGENTROUTER_KEY`
   - **Value:** your AgentRouter key (the `sk-...` one). Paste it exactly.
   - Click **Add**.
5. Click **Deploy**. Wait about a minute.
6. You'll get a live link like `https://footage-finder-xxxx.vercel.app`.
   **That's your tool. Bookmark it.**

---

## Step 3 — First run

1. Open your live link. You'll see your setup wizard.
2. Enter your **Pexels** key (required) and **Pixabay** key (optional) —
   same as before. These are stored in your browser on your device.
3. Paste a script, hit **Analyse**. The AI keyword step now runs through your
   AgentRouter credit via the hidden relay.

---

## If something doesn't work

Tell me the exact message you see and I'll fix it. The likely spots:

- **"Server missing AGENTROUTER_KEY"** → the key wasn't saved in Step 2.4.
  In Vercel: **Settings → Environment Variables**, add it, then
  **Deployments → … → Redeploy**.
- **"Upstream error"** with a 401 → AgentRouter rejected the key. Double-check
  you pasted the full `sk-...` value, and that developer / third-party
  inference is turned on for that key (same setting you used for Claude Code).
- **Keyword step fails but footage works** → that's the relay only; footage
  (Pexels/Pixabay) runs straight from the browser and is unaffected.

## Changing the AI model later

`api/keywords.js` uses `claude-opus-4-8` (the only model your AgentRouter plan
serves right now). To try a different model, edit that one line on GitHub
(pencil icon → change the text → Commit). Vercel redeploys automatically within
a minute.

## A note on security

- Your **AgentRouter key** is hidden on the server — good.
- Your **Pexels/Pixabay keys** live in your browser. Fine for a personal tool.
  Don't hand the link to strangers as-is; anyone technical could read those two
  keys from their own browser. If you ever want to share it publicly, tell me
  and we'll hide those too.

