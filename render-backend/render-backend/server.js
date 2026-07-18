"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const busboy = require("busboy");
const admin = require("firebase-admin");
const Groq = require("groq-sdk");
const { toFile } = require("groq-sdk");
const { createChatService } = require("./chatService");

// ---------------------------------------------------------------------------
// Firebase Admin init (service account passed as base64 env var — see README)
// ---------------------------------------------------------------------------
if (!admin.apps.length) {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    const serviceAccount = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    console.warn(
      "⚠️  FIREBASE_SERVICE_ACCOUNT_BASE64 not set. Firestore logging will fall back to in-memory only."
    );
  }
}

const db = admin.apps.length ? admin.firestore() : null;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT || 3001);
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const chatService = createChatService(GROQ_API_KEY);
const inMemoryLogs = [];

const RATE_LIMIT_RPM = Number(process.env.RATE_LIMIT_RPM || 25);
const RATE_LIMIT_RPD = Number(process.env.RATE_LIMIT_RPD || 500);
const usageByUser = new Map();

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();
app.disable("x-powered-by");

app.use(
  cors({
    origin: ALLOWED_ORIGINS.includes("*") ? true : ALLOWED_ORIGINS,
  })
);

// Only parses bodies with Content-Type: application/json — multipart requests
// (audio uploads) pass through untouched so busboy can read the raw stream.
app.use(express.json({ limit: "2mb" }));

// ---------------------------------------------------------------------------
// Rate limiting helpers (per-user, in-memory — resets if the server restarts)
// ---------------------------------------------------------------------------
function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getUserUsage(userId) {
  const key = userId || "anonymous";
  let entry = usageByUser.get(key);
  const todayKey = getTodayKey();

  if (!entry) {
    entry = { minuteTimestamps: [], dayCount: 0, dayKey: todayKey };
    usageByUser.set(key, entry);
  }
  if (entry.dayKey !== todayKey) {
    entry.dayCount = 0;
    entry.dayKey = todayKey;
  }
  return entry;
}

function buildUsageSnapshot(entry) {
  const now = Date.now();
  const recentTimestamps = entry.minuteTimestamps.filter((t) => now - t < 60000);
  entry.minuteTimestamps = recentTimestamps;

  const minuteUsed = recentTimestamps.length;
  const oldestInWindow = recentTimestamps[0];
  const minuteResetInSeconds = oldestInWindow
    ? Math.max(0, Math.ceil((oldestInWindow + 60000 - now) / 1000))
    : 0;

  return {
    minuteUsed,
    minuteLimit: RATE_LIMIT_RPM,
    dayUsed: entry.dayCount,
    dayLimit: RATE_LIMIT_RPD,
    minuteResetInSeconds,
  };
}

function checkAndRecordUsage(userId) {
  const entry = getUserUsage(userId);
  const usage = buildUsageSnapshot(entry);

  if (usage.minuteUsed >= RATE_LIMIT_RPM || usage.dayUsed >= RATE_LIMIT_RPD) {
    return { allowed: false, usage };
  }

  entry.minuteTimestamps.push(Date.now());
  entry.dayCount += 1;
  return { allowed: true, usage: buildUsageSnapshot(entry) };
}

function peekUsage(userId) {
  return buildUsageSnapshot(getUserUsage(userId));
}

// ---------------------------------------------------------------------------
// Firestore logging helpers
// ---------------------------------------------------------------------------
async function safeLog(data) {
  const entry = { ...data, timestamp: new Date().toISOString() };

  if (!db) {
    inMemoryLogs.unshift({ id: `local-${Date.now()}`, ...entry });
    if (inMemoryLogs.length > 100) inMemoryLogs.pop();
    return;
  }

  try {
    await db.collection("logs").add(entry);
  } catch (err) {
    inMemoryLogs.unshift({ id: `local-${Date.now()}`, ...entry });
    if (inMemoryLogs.length > 100) inMemoryLogs.pop();
    console.error("❌ Firestore log failed:", err.message);
  }
}

async function readRecentLogs(userId, max = 20) {
  if (!db) {
    return inMemoryLogs.filter((log) => !userId || log.userId === userId).slice(0, max);
  }
  try {
    let query = db.collection("logs");
    if (userId) query = query.where("userId", "==", userId);
    const snapshot = await query.limit(200).get();
    const results = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results.slice(0, max);
  } catch (err) {
    console.error("❌ Firestore read failed, serving in-memory logs:", err.message);
    return inMemoryLogs.filter((log) => !userId || log.userId === userId).slice(0, max);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

// GET /getUsage?userId=...
app.get("/getUsage", (req, res) => {
  const userId = req.query.userId || "anonymous";
  res.status(200).json({ usage: peekUsage(userId) });
});

// GET /chat?userId=...  -> recent logs
// POST /chat            -> main chat completion
app.get("/chat", async (req, res) => {
  const userId = req.query.userId || null;
  const logs = await readRecentLogs(userId, 20);
  res.status(200).json({ logs });
});

app.post("/chat", async (req, res) => {
  if (!chatService) {
    console.error("GROQ_API_KEY is missing.");
    return res.status(500).json({ error: "Backend is not configured with an API Key." });
  }

  try {
    const { messages, userId, hiddenContext, model } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required." });
    }

    const { allowed, usage } = checkAndRecordUsage(userId);
    if (!allowed) {
      return res.status(429).json({
        error: `You've hit the chat limit (${usage.minuteUsed}/${usage.minuteLimit} per minute or ${usage.dayUsed}/${usage.dayLimit} today). Try again in ${usage.minuteResetInSeconds}s.`,
        usage,
      });
    }

    const userContent = messages[messages.length - 1]?.content || "";

    await safeLog({
      type: "request",
      userId: userId || "anonymous",
      content: userContent,
      messageCount: messages.length,
    });

    const llmMessages = messages.map((message) => ({ ...message }));
    if (hiddenContext && typeof hiddenContext === "string" && llmMessages.length > 0) {
      const lastIndex = llmMessages.length - 1;
      if (llmMessages[lastIndex].role === "user") {
        llmMessages[lastIndex] = {
          ...llmMessages[lastIndex],
          content: `${llmMessages[lastIndex].content}\n\nContext from uploaded file:\n${hiddenContext.trim()}`,
        };
      }
    }

    const reply = await chatService.chat(llmMessages, model);

    await safeLog({ type: "response", userId: userId || "anonymous", reply });

    return res.status(200).json({ reply, usage: peekUsage(userId) });
  } catch (error) {
    console.error("Chat Function Error:", error.message);

    await safeLog({ type: "error", message: error.message, status: error.status || 500 });

    const isRateLimit = error.message && error.message.includes("rate_limit_exceeded");
    const userMessage = isRateLimit
      ? "The AI service (Groq) has hit its own usage limit for now. Please wait a few minutes and try again."
      : "Internal server error.";

    return res
      .status(isRateLimit ? 429 : 500)
      .json({ error: userMessage, usage: peekUsage(req.body?.userId) });
  }
});

// POST /transcribeAudio  (multipart/form-data, field name "file")
app.post("/transcribeAudio", async (req, res) => {
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY is missing.");
    return res.status(500).json({ error: "Backend is not configured with an API Key." });
  }

  try {
    const audioBuffer = await new Promise((resolve, reject) => {
      const bb = busboy({ headers: req.headers });
      const chunks = [];

      bb.on("file", (_name, file) => {
        file.on("data", (chunk) => chunks.push(chunk));
      });

      bb.on("finish", () => resolve(Buffer.concat(chunks)));
      bb.on("error", reject);
      req.pipe(bb);
    });

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: "No audio file received." });
    }

    const groq = new Groq({ apiKey: GROQ_API_KEY });
    const transcription = await groq.audio.transcriptions.create({
      file: await toFile(audioBuffer, "audio.mp3", { type: "audio/mpeg" }),
      model: "whisper-large-v3",
    });

    return res.status(200).json({ text: transcription.text || "" });
  } catch (error) {
    console.error("Transcription Error:", error.message);
    return res.status(500).json({ error: "Failed to transcribe audio." });
  }
});

// POST /analyzeVideoFrames  { frames: [dataUrl, ...] }
app.post("/analyzeVideoFrames", async (req, res) => {
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY is missing.");
    return res.status(500).json({ error: "Backend is not configured with an API Key." });
  }

  try {
    const { frames } = req.body;
    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: "frames array is required." });
    }

    const MAX_FRAMES = 5;
    const selectedFrames = frames.slice(0, MAX_FRAMES);
    const groq = new Groq({ apiKey: GROQ_API_KEY });

    const content = [
      {
        type: "text",
        text:
          "These are sequential frames extracted from a video, in order. " +
          "Describe concretely what is happening: setting, people/objects visible, " +
          "actions taking place, and any on-screen text. Do not guess at audio, " +
          "lyrics, or dialogue — describe only what is visually present in the frames.",
      },
      ...selectedFrames.map((frameDataUrl) => ({
        type: "image_url",
        image_url: { url: frameDataUrl },
      })),
    ];

    const completion = await groq.chat.completions.create({
      model: "qwen/qwen3.6-27b",
      messages: [{ role: "user", content }],
      temperature: 0.4,
      max_tokens: 1024,
    });

    const description =
      completion.choices?.[0]?.message?.content?.trim() ||
      "No description could be generated from the video frames.";

    return res.status(200).json({ description });
  } catch (error) {
    console.error("Video Analysis Error:", error.message);
    return res.status(500).json({ error: "Failed to analyze video frames." });
  }
});

// POST /analyzeImage  { imageDataUrl }
app.post("/analyzeImage", async (req, res) => {
  if (!GROQ_API_KEY) {
    console.error("GROQ_API_KEY is missing.");
    return res.status(500).json({ error: "Backend is not configured with an API Key." });
  }

  try {
    const { imageDataUrl } = req.body;
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return res.status(400).json({ error: "imageDataUrl is required." });
    }

    const groq = new Groq({ apiKey: GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      model: "qwen/qwen3.6-27b",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this image concretely: setting, objects, people, any visible text, layout. Be specific rather than generic.",
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0.4,
      max_tokens: 1024,
    });

    const description =
      completion.choices?.[0]?.message?.content?.trim() ||
      "No description could be generated from the image.";

    return res.status(200).json({ description });
  } catch (error) {
    console.error("Image Analysis Error:", error.message);
    return res.status(500).json({ error: "Failed to analyze image." });
  }
});

// GET|POST /searchYoutube  ?q=... or { q: "..." }
app.all("/searchYoutube", async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!YOUTUBE_API_KEY) {
    console.error("YOUTUBE_API_KEY is missing.");
    return res.status(500).json({ error: "YouTube API key is not configured." });
  }

  const query = req.method === "GET" ? req.query.q : req.body.q;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Query parameter 'q' is required." });
  }

  try {
    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "video",
      maxResults: "5",
      key: YOUTUBE_API_KEY,
      videoEmbeddable: "true",
      videoSyndicated: "true",
    });

    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      console.error("YouTube API Error:", data);
      return res.status(response.status).json({
        error: data.error?.message || "YouTube API request failed.",
        results: [],
      });
    }

    const results = (data.items || [])
      .filter((item) => item.id && item.id.videoId)
      .map((item) => ({
        videoId: item.id.videoId,
        title: item.snippet?.title || "Untitled Video",
        channelTitle: item.snippet?.channelTitle || "Unknown Channel",
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        thumbnail: item.snippet?.thumbnails?.default?.url || "",
      }));

    return res.status(200).json({ results });
  } catch (error) {
    console.error("YouTube Search Error:", error.message);
    return res.status(500).json({ error: "Failed to search YouTube.", results: [] });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend listening on port ${PORT}`);
});