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

/**
 * Enhanced Logging Function (Member 4)
 * Saves request/response details to Firestore 'logs' collection.
 */
async function safeLog(data) {
  try {
    await db.collection("logs").add({
      ...data,
      // Use ISO string for local emulator compatibility
      timestamp: new Date().toISOString(), 
    });
    console.log(`📊 [Member 4 Log]: ${data.type} recorded.`);
  } catch (err) {
    console.error("❌ Firestore log failed:", err.message);
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
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
      }

      // 2. Validate Configuration (Member 3)
      if (!chatService) {
        logger.error("GROQ_API_KEY is missing.");
        return res.status(500).json({ error: "Backend is not configured with an API Key." });
      }

      try {
        const { messages, userId } = req.body;

        if (!messages || !Array.isArray(messages)) {
          return res.status(400).json({ error: "messages array is required." });
        }

        // Identify the current user message
        const userContent = messages[messages.length - 1]?.content || "";

        // 3. Log the incoming request (Member 4)
        await safeLog({ 
          type: "request", 
          userId: userId || "anonymous",
          content: userContent,
          messageCount: messages.length 
        });

        // 4. Call the LLM Service (Member 2 Logic)
        const reply = await chatService.chat(messages);

        // 5. Log the successful response (Member 4)
        await safeLog({ 
          type: "response", 
          userId: userId || "anonymous",
          reply: reply 
        });

        // 6. Final response to Frontend (Member 1)
        return res.status(200).json({ reply });

      } catch (error) {
        logger.error("Chat Function Error:", error.message);

        // 7. Log errors for Member 4's DB records
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