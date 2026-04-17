"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { createChatService } = require("./chatService");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true }); // Standard CORS middleware
require("dotenv").config();

// Initialize Firebase Admin (Member 3)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const API_KEY = process.env.GROQ_API_KEY;
const chatService = createChatService(API_KEY);
const inMemoryLogs = [];

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

async function readRecentLogs(max = 20) {
  try {
    const snapshot = await db
      .collection("logs")
      .orderBy("timestamp", "desc")
      .limit(max)
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error("❌ Firestore read failed, serving in-memory logs:", err.message);
    return inMemoryLogs.slice(0, max);
  }
}

/**
 * Main Chat Cloud Function (Integration Hub)
 */
exports.chat = onRequest(
  { region: "us-central1", timeoutSeconds: 60 },
  async (req, res) => {
    // Wrap in CORS for Frontend UI (Member 1) connectivity
    return cors(req, res, async () => {
      
      // 1. Validate Method
      if (req.method === "GET") {
        const logs = await readRecentLogs(20);
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
        const { messages, userId, hiddenContext } = req.body;

        if (!messages || !Array.isArray(messages)) {
          return res.status(400).json({ error: "messages array is required." });
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
        const reply = await chatService.chat(llmMessages);

        // 5. Log the successful response (USER HISTORY)
        await safeLog({ 
          type: "response", 
          userId: userId || "anonymous",
          reply: reply 
        });

        // 6. Final response to Frontend (Member 1)
        return res.status(200).json({ reply });

      } catch (error) {
        logger.error("Chat Function Error:", error.message);

        // 7. Log errors for USER HISTORY DB records
        await safeLog({ 
          type: "error", 
          message: error.message,
          status: error.status || 500
        });

        return res.status(500).json({ error: "Internal server error." });
      }
    });
  }
);