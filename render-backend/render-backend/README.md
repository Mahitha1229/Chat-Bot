# Deployment Guide — CC_LLM-Powered-Chatbot-on-Cloud (100% free)

This replaces your 6 Firebase Cloud Functions (`chat`, `getUsage`, `transcribeAudio`,
`analyzeVideoFrames`, `analyzeImage`, `searchYoutube`) with a single Express server
that runs on Render's free tier — no credit card required.

Architecture after this guide:
- **Frontend** (React/Vite) → Firebase Hosting (free, Spark plan)
- **Backend** (this folder) → Render free Web Service
- **Auth + Firestore** → Firebase (free, Spark plan) — unchanged

---

## Step 1 — Push this backend to GitHub

Render deploys from a GitHub repo. Easiest option: create a **new, separate repo**
just for this backend folder (keeps it decoupled from your frontend repo).

```bash
cd render-backend
git init
git add .
git commit -m "Backend for Render deployment"
git branch -M main
git remote add origin https://github.com/<your-username>/cc-chatbot-backend.git
git push -u origin main
```

(Create the empty repo on GitHub first via github.com/new — don't add a README there,
to avoid a merge conflict.)

**Important:** never commit your real `.env` file or service account JSON. This
folder's `.gitignore` already excludes them — verify `.env` is NOT in your commit.

---

## Step 2 — Get your Firebase service account key (for Firestore chat logging)

1. Go to [Firebase Console](https://console.firebase.google.com) → your project
   (`mahitha-cc-chatbot`) → ⚙️ **Project settings** → **Service accounts** tab
2. Click **Generate new private key** → downloads a `.json` file
   (this is the same as the `mahitha-cc-chatbot-firebase-adminsdk-fbsvc...json`
   file you already have — you can reuse it instead of generating a new one)
3. Convert it to a single-line base64 string:

   **Windows (PowerShell):**
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\your-key.json")) | Set-Clipboard
   ```
   (this copies the result directly to your clipboard)

   **Mac/Linux:**
   ```bash
   base64 -i path/to/your-key.json | tr -d '\n' | pbcopy   # Mac
   base64 -w 0 path/to/your-key.json                        # Linux (prints to terminal)
   ```

4. Keep this value — you'll paste it into Render as `FIREBASE_SERVICE_ACCOUNT_BASE64`
   in Step 4. **Never commit the raw .json file or this string to GitHub.**

---

## Step 3 — Get your Groq and YouTube API keys

- **Groq**: [console.groq.com/keys](https://console.groq.com/keys) (you should
  already have this from local dev)
- **YouTube Data API v3**: [console.cloud.google.com](https://console.cloud.google.com)
  → APIs & Services → Credentials (only needed if you want YouTube search to work)

---

## Step 4 — Deploy on Render

1. Go to [render.com](https://render.com) → sign up (free, no card needed for
   free-tier Web Services) → **New +** → **Web Service**
2. Connect your GitHub account and select the backend repo from Step 1
3. Configure:
   - **Name:** `cc-chatbot-backend` (or anything)
   - **Region:** closest to you
   - **Branch:** `main`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Under **Environment Variables**, add:
   | Key | Value |
   |---|---|
   | `GROQ_API_KEY` | your Groq key |
   | `YOUTUBE_API_KEY` | your YouTube key |
   | `FIREBASE_SERVICE_ACCOUNT_BASE64` | the base64 string from Step 2 |
   | `ALLOWED_ORIGINS` | `*` for now (tighten later — see Step 6) |
5. Click **Create Web Service**. Render will build and deploy — first deploy
   takes a few minutes. You'll get a URL like:
   `https://cc-chatbot-backend.onrender.com`

⚠️ **Free tier note:** Render spins down your service after 15 minutes of no
traffic. The next request wakes it up but takes ~30–50 seconds. This is normal
and only affects the *first* message after idle time — fine for a portfolio
project, just flag it in a demo ("give it a moment to wake up").

---

## Step 5 — Point your frontend at the new backend

In your frontend repo's `.env` (or `.env.production` for the build), replace the
Firebase emulator URLs with your Render URL + route name:

```dotenv
VITE_CHAT_API_URL=https://cc-chatbot-backend.onrender.com/chat
VITE_USAGE_API_URL=https://cc-chatbot-backend.onrender.com/getUsage
VITE_YOUTUBE_SEARCH_API_URL=https://cc-chatbot-backend.onrender.com/searchYoutube
VITE_TRANSCRIBE_API_URL=https://cc-chatbot-backend.onrender.com/transcribeAudio
VITE_ANALYZE_VIDEO_API_URL=https://cc-chatbot-backend.onrender.com/analyzeVideoFrames
VITE_ANALYZE_IMAGE_API_URL=https://cc-chatbot-backend.onrender.com/analyzeImage
VITE_POLLINATIONS_API_KEY=<unchanged — Pollinations is still called directly from the browser>
```

No other frontend code changes are needed — `ChatWindow.tsx` and `ChatInput.tsx`
already read these from `import.meta.env`.

---

## Step 6 — Deploy the frontend to Firebase Hosting

Your `firebase.json` already has a `hosting` config pointing at `dist`, so:

```bash
npm run build
firebase deploy --only hosting
```

This gives you a live URL like `https://mahitha-cc-chatbot.web.app`.

**Then tighten CORS:** go back to Render → Environment → update `ALLOWED_ORIGINS`
to your real Hosting URL(s), comma-separated, e.g.:
```
https://mahitha-cc-chatbot.web.app,https://mahitha-cc-chatbot.firebaseapp.com
```
Render will auto-redeploy with the new value.

---

## Step 7 — Firestore security rules

Since Firestore is now written to from two places (your frontend directly, and
this backend via the Admin SDK), double check `firestore.rules` still requires
auth for the `users/{uid}/sessions/...` paths, and that the `logs` collection
(written server-side only) isn't publicly readable/writable by clients. Share
your `firestore.rules` if you'd like me to review it.

---

## What you can safely delete/ignore now

- Root `server.cjs`, `chat.cjs`, `chatloop.cjs`, `test.cjs` — unused legacy
  "Member 3" backend, superseded by this folder
- `functions/` folder — no longer deployed (kept in git history is fine, just
  don't run `firebase deploy --only functions` since that needs Blaze)

---

## Quick local test (optional, before deploying)

```bash
cd render-backend
npm install
cp .env.example .env   # fill in real values
npm start
curl http://localhost:3001/healthz
```
