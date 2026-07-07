"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { createChatService } = require("./chatService");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true }); // Standard CORS middleware
const Groq = require("groq-sdk");
const { toFile } = require("groq-sdk");
const busboy = require("busboy");
require("dotenv").config();

// Initialize Firebase Admin (Member 3)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const API_KEY = process.env.GROQ_API_KEY;
const chatService = createChatService(API_KEY);
const inMemoryLogs = [];
// --- Rate limiting (per-user, in-memory) ---
const RATE_LIMIT_RPM = Number(process.env.RATE_LIMIT_RPM || 25); // requests per minute
const RATE_LIMIT_RPD = Number(process.env.RATE_LIMIT_RPD || 500); // requests per day
const usageByUser = new Map(); // userId -> { minuteTimestamps: number[], dayCount: number, dayKey: string }

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
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

// Returns { allowed, usage }. Call only once per real request attempt.
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
  const entry = getUserUsage(userId);
  return buildUsageSnapshot(entry);
}

/**
 * Enhanced Logging Function (USER HISTORY)
 * Saves request/response details to Firestore 'logs' collection.
 */
async function safeLog(data) {
  const entry = {
    ...data,
    // Use ISO string for local emulator compatibility
    timestamp: new Date().toISOString(),
  };

  try {
    await db.collection("logs").add(entry);
    console.log(`📊 [USER HISTORY Log]: ${data.type} recorded.`);
  } catch (err) {
    // Keep local demo resilient when Firestore API is not enabled.
    inMemoryLogs.unshift({ id: `local-${Date.now()}`, ...entry });
    if (inMemoryLogs.length > 100) inMemoryLogs.pop();
    console.error("❌ Firestore log failed:", err.message);
  }
}

async function readRecentLogs(userId, max = 20) {
  try {
    let query = db.collection("logs");

    if (userId) {
      query = query.where("userId", "==", userId);
    }

    const snapshot = await query.limit(200).get();
    const results = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results.slice(0, max);
  } catch (err) {
    console.error("❌ Firestore read failed, serving in-memory logs:", err.message);
    return inMemoryLogs
      .filter((log) => !userId || log.userId === userId)
      .slice(0, max);
  }
}

/**
 * Main Chat Cloud Function (Integration Hub)
 */
/**
 * Usage Check Cloud Function
 * Returns current rate-limit usage for a user without consuming a request.
 */
exports.getUsage = onRequest(
  { region: "us-central1", timeoutSeconds: 10 },
  async (req, res) => {
    return cors(req, res, async () => {
      const userId = req.query.userId || "anonymous";
      return res.status(200).json({ usage: peekUsage(userId) });
    });
  }
);

exports.chat = onRequest(
  { region: "us-central1", timeoutSeconds: 60, secrets: ["GROQ_API_KEY"] },
  async (req, res) => {
    // Wrap in CORS for Frontend UI (Member 1) connectivity
    return cors(req, res, async () => {

      // 1. Validate Method
      if (req.method === "GET") {
        const userId = req.query.userId || null;
        const logs = await readRecentLogs(userId, 20);
        return res.status(200).json({ logs });
      }

      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
      }

      // 2. Validate Configuration (Member 3)
      if (!chatService) {
        logger.error("GROQ_API_KEY is missing.");
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

        // Identify the current user message
        const userContent = messages[messages.length - 1]?.content || "";

        // 3. Log the incoming request (USER HISTORY)
        await safeLog({
          type: "request",
          userId: userId || "anonymous",
          content: userContent,
          messageCount: messages.length
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

        // 4. Call the LLM Service (Member 2 Logic)
        const reply = await chatService.chat(llmMessages, model);

        // 5. Log the successful response (USER HISTORY)
        await safeLog({
          type: "response",
          userId: userId || "anonymous",
          reply: reply
        });

        // 6. Final response to Frontend (Member 1)
        return res.status(200).json({ reply, usage: peekUsage(userId) });
      } catch (error) {
        logger.error("Chat Function Error:", error.message);

        // 7. Log errors for USER HISTORY DB records
        await safeLog({
          type: "error",
          message: error.message,
          status: error.status || 500
        });

        const isRateLimit = error.message && error.message.includes("rate_limit_exceeded");
        const userMessage = isRateLimit
          ? "The AI service (Groq) has hit its own usage limit for now. Please wait a few minutes and try again."
          : "Internal server error.";

        return res.status(isRateLimit ? 429 : 500).json({ error: userMessage, usage: peekUsage(req.body?.userId) });
      }
    });
  }
);

/**
 * Audio Transcription Cloud Function
 * Accepts an uploaded audio file (MP3, M4A, WAV, WEBM, OGG) and returns transcribed text
 * using Groq's Whisper API.
 */
exports.transcribeAudio = onRequest(
  { region: "us-central1", timeoutSeconds: 60, secrets: ["GROQ_API_KEY"] },
  async (req, res) => {
    return cors(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
      }

      if (!API_KEY) {
        logger.error("GROQ_API_KEY is missing.");
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
          bb.end(req.rawBody);
        });

        if (!audioBuffer || audioBuffer.length === 0) {
          return res.status(400).json({ error: "No audio file received." });
        }

        const groq = new Groq({ apiKey: API_KEY });

        const transcription = await groq.audio.transcriptions.create({
          file: await toFile(audioBuffer, "audio.mp3", { type: "audio/mpeg" }),
          model: "whisper-large-v3",
        });

        return res.status(200).json({ text: transcription.text || "" });
      } catch (error) {
        logger.error("Transcription Error:", error.message);
        return res.status(500).json({ error: "Failed to transcribe audio." });
      }
    });
  }
);

/**
 * Video Frame Analysis Cloud Function (ENHANCED - Detailed Descriptions)
 * Accepts an array of base64 image data URLs and returns a detailed visual description
 * using Groq's Llama 3.2 Vision model.
 */
/**
 * Video Frame Analysis - TEST VERSION (Doesn't use Groq)
 * This just returns a test description to verify the function works
 */
exports.analyzeVideoFrames = onRequest(
  { region: "us-central1", timeoutSeconds: 60, secrets: ["GROQ_API_KEY"] },
  async (req, res) => {
    return cors(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
      }

      if (!API_KEY) {
        logger.error("GROQ_API_KEY is missing.");
        return res.status(500).json({ error: "Backend is not configured with an API Key." });
      }

      try {
        const { frames } = req.body;

        if (!frames || !Array.isArray(frames) || frames.length === 0) {
          return res.status(400).json({ error: "frames array is required." });
        }

        const MAX_FRAMES = 5;
        const selectedFrames = frames.slice(0, MAX_FRAMES);

        const groq = new Groq({ apiKey: API_KEY });

        const content = [
          {
            type: "text",
            text:
              "These are sequential frames extracted from a video, in order. " +
              "Describe concretely what is happening: setting, people/objects visible, " +
              "actions taking place, and any on-screen text. Do not guess at audio, " +
              "lyrics, or dialogue — describe only what is visually present in the frames."
          },
          ...selectedFrames.map((frameDataUrl) => ({
            type: "image_url",
            image_url: { url: frameDataUrl }
          }))
        ];

        const completion = await groq.chat.completions.create({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [{ role: "user", content }],
          temperature: 0.4,
          max_tokens: 1024
        });

        const description =
          completion.choices?.[0]?.message?.content?.trim() ||
          "No description could be generated from the video frames.";

        return res.status(200).json({ description });
      } catch (error) {
        console.error("❌ Video analysis error:", error.message);
        logger.error("Video Analysis Error:", error.message);
        return res.status(500).json({ error: "Failed to analyze video frames." });
      }
    });
  }
);
exports.analyzeImage = onRequest(
  { region: "us-central1", timeoutSeconds: 60, secrets: ["GROQ_API_KEY"] },
  async (req, res) => {
    return cors(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
      }

      if (!API_KEY) {
        logger.error("GROQ_API_KEY is missing.");
        return res.status(500).json({ error: "Backend is not configured with an API Key." });
      }

      try {
        const { imageDataUrl } = req.body;

        if (!imageDataUrl || typeof imageDataUrl !== "string") {
          return res.status(400).json({ error: "imageDataUrl is required." });
        }

        const groq = new Groq({ apiKey: API_KEY });

        const completion = await groq.chat.completions.create({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Describe this image concretely: setting, objects, people, any visible text, layout. Be specific rather than generic."
                },
                { type: "image_url", image_url: { url: imageDataUrl } }
              ]
            }
          ],
          temperature: 0.4,
          max_tokens: 1024
        });

        const description =
          completion.choices?.[0]?.message?.content?.trim() ||
          "No description could be generated from the image.";

        return res.status(200).json({ description });
      } catch (error) {
        console.error("❌ Image analysis error:", error.message);
        logger.error("Image Analysis Error:", error.message);
        return res.status(500).json({ error: "Failed to analyze image." });
      }
    });
  }
);
exports.searchYoutube = onRequest(
  { region: "us-central1", timeoutSeconds: 30, secrets: ["YOUTUBE_API_KEY"] },
  async (req, res) => {
    return cors(req, res, async () => {
      if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed." });
      }

      const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
      if (!YOUTUBE_API_KEY) {
        logger.error("YOUTUBE_API_KEY is missing.");
        return res.status(500).json({ error: "YouTube API key is not configured." });
      }

      const query = req.method === "GET" ? req.query.q : req.body.q;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query parameter 'q' is required." });
      }

      console.log(`🎥 Searching YouTube for: "${query}"`);

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
          logger.error("YouTube API Error:", data);
          return res.status(response.status).json({ 
            error: data.error?.message || "YouTube API request failed.",
            results: []
          });
        }

        const results = (data.items || [])
          .filter(item => item.id && item.id.videoId)
          .map((item) => ({
            videoId: item.id.videoId,
            title: item.snippet?.title || "Untitled Video",
            channelTitle: item.snippet?.channelTitle || "Unknown Channel",
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            thumbnail: item.snippet?.thumbnails?.default?.url || "",
          }));

        console.log(`✅ Found ${results.length} YouTube videos`);

        return res.status(200).json({ results });

      } catch (error) {
        console.error("❌ YouTube Search Error:", error.message);
        logger.error("YouTube Search Error:", error.message);
        return res.status(500).json({ 
          error: "Failed to search YouTube.",
          results: []
        });
      }
    });
  }
);