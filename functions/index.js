"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { createChatService } = require("./chatService");
require("dotenv").config();
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const API_KEY = process.env.GROQ_API_KEY;

const chatService = createChatService(API_KEY);

function setCorsHeaders(res) {
  res.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && typeof m.content === "string" && typeof m.role === "string")
    .map((m) => ({
      role: m.role === "assistant" || m.role === "system" ? m.role : "user",
      content: m.content.trim().slice(0, 4000)
    }))
    .filter((m) => m.content.length > 0)
    .slice(-20);
}

exports.chat = onRequest({ region: "us-central1", timeoutSeconds: 60 }, async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  if (!chatService) {
    logger.error("GROQ_API_KEY is missing.");
    res.status(500).json({ error: "Backend is not configured." });
    return;
  }

  try {
    const incomingMessages = sanitizeMessages(req.body?.messages);
    if (incomingMessages.length === 0) {
      res.status(400).json({ error: "messages[] is required." });
      return;
    }

    const reply = await chatService.chat(incomingMessages);
    res.status(200).json({ reply });
  } catch (error) {
    const status = error?.status || 500;
    logger.error("Chat function failed", { status, message: error?.message });

    if (status === 401) {
      res.status(401).json({ error: "Invalid API key." });
      return;
    }
    if (status === 429) {
      res.status(429).json({ error: "Rate limit reached. Try again shortly." });
      return;
    }

    res.status(500).json({ error: "Internal server error." });
  }
});
