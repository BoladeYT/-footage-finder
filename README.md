# Footage Finder — set up your private copy

Follow these steps once. Takes about 5 minutes. No coding.

---

### Step 1 — Get your free Gemini key

1. Go to **aistudio.google.com/apikey**
2. Sign in with any Google account
3. Click **Create API key** → **Copy** it

Free, no card. Keep it copied — you'll paste it in Step 3.

---

### Step 2 — Click the Deploy button

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FBoladeYT%2F-footage-finder&env=GEMINI_KEY&envDescription=Your%20free%20Google%20Gemini%20key%20(get%20one%20at%20the%20link)&envLink=https%3A%2F%2Faistudio.google.com%2Fapikey&project-name=footage-finder&repository-name=footage-finder)

- Sign up for a **free Vercel account** (use "Continue with GitHub" or your email)
- If it asks to connect GitHub, click **Authorize** — this just copies the tool to you

---

### Step 3 — Paste your key and deploy

1. A box appears asking for **GEMINI_KEY**
2. Paste the key you copied in Step 1 into the **Value** box
3. Click **Deploy** and wait about a minute

---

### Step 4 — Open your tool

1. When you see **"Congratulations!"**, your tool is ready
2. Click **Continue to Dashboard**, then click **Visit** (or **Domains**) to open your link
3. **Bookmark that link — it's your tool, forever**

On first open, it asks for your Pexels (required) and Pixabay (optional) keys.
Get those free at **pexels.com/api** and **pixabay.com/api/docs**.

> **You can ignore everything else** Vercel shows you — "Install Coding Agent
> Plugin", "Add Domain", "Enable Analytics", the checklist. None of it is needed.
> Your tool already works.

---

## Questions people ask

**Is this really mine to keep?**
Yes. When you set it up, you get your own private copy. It's yours forever — no
monthly fee, nobody else uses it, and it won't disappear.

**Do I need to pay for anything?**
No. Everything runs on free accounts (Google, Pexels, Pixabay). You only make
free keys — no card needed.

**Is one Google (Gemini) key enough?**
Yes. One key is plenty for normal use. If you run a very long script or use it a
lot in one hour, it might slow down for a bit — that's the free limit, not a
fault. Wait about an hour and it's back. (Power users can add extra keys later,
but most people never need to.)

**Will it stop showing me raw sentences instead of good search words?**
No, that's fixed. The tool now waits its turn and retries by itself, so it always
gives you proper footage search words, not just your script text.

**Does it work for my type of videos?**
It reads any script — money, history, motivation, health, tech, faith, anything —
and finds matching footage. It works best for broad, everyday topics (lifestyle,
motivation, business, nature, faceless value videos) because free footage sites
have lots of that. Very specific things (a named person, one exact product) may
only get close matches, because the free footage sites simply don't have those.

**If the tool gets updated later, does my copy update too?**
No. Your copy is yours and stays exactly as it is — it won't change on its own or
break. If a new version comes out, you'd set it up fresh to get it.

**Footage stopped loading. Is it broken?**
Probably not. The free footage sites allow a certain number of searches per hour.
A long script or lots of use can reach that. Wait about an hour, or add backup
keys in Settings. Everything you already found stays.

---

## The long way (only if the button doesn't work)

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
