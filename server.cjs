/* eslint-disable no-console */
"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");

// Load local env vars if present (GROQ_API_KEY is used by chat.js)
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  require("dotenv").config();
} catch (_) {
  // dotenv is optional for the simulation server; chat.js already calls dotenv internally.
}

const app = express();
app.disable("x-powered-by");

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:8080,http://localhost:8081";
const PORT = Number(process.env.PORT || 3001);

app.use(
  express.json({
    limit: "1mb"
  })
);

// Lightweight CORS for React frontend calls.
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const allowedOrigins = ALLOWED_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (allowedOrigins.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  } else if (allowedOrigins.length > 0) {
    // Fallback for non-browser clients or missing Origin header.
    res.setHeader("Access-Control-Allow-Origin", allowedOrigins[0]);
  }

  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  next();
});

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function resolveChatModule() {
  // Prefer a local copy if the repo includes one.
  const localChatCjsPath = path.resolve(__dirname, "chat.cjs");
  const localChatPath = path.resolve(__dirname, "chat.js");
  const downloadsChatPath = path.resolve(__dirname, "../../../../Downloads/chat.js");

  const explicit = process.env.CHAT_JS_PATH ? path.resolve(process.env.CHAT_JS_PATH) : null;
  const chosen =
    explicit ||
    (exists(localChatCjsPath)
      ? localChatCjsPath
      : exists(localChatPath)
        ? localChatPath
        : downloadsChatPath);

  if (!exists(chosen)) {
    throw new Error(
      "Cannot locate chat.js. Set CHAT_JS_PATH or place chat.js in the project root."
    );
  }

  return chosen;
}

// Import and use the existing Member 2 LLM logic without rewriting it.
const chatModulePath = resolveChatModule();
// eslint-disable-next-line @typescript-eslint/no-var-requires, import/no-dynamic-require
const { chat } = require(chatModulePath);

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && typeof m === "object")
    .filter((m) => typeof m.role === "string" && typeof m.content === "string")
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, 4000)
    }))
    .filter((m) => m.content.length > 0)
    .slice(-20);
}

function pickChatInputs(body) {
  // Required format:
  // { message: string, history: array }
  if (body && typeof body.message === "string") {
    return {
      message: body.message.trim(),
      history: sanitizeHistory(body.history)
    };
  }

  // Compatibility with existing frontend payload:
  // { messages: [{ role, content }, ...] }
  if (body && Array.isArray(body.messages) && body.messages.length > 0) {
    const sanitized = sanitizeHistory(body.messages);
    const last = sanitized[sanitized.length - 1];
    if (!last) return { message: "", history: [] };
    return {
      message: String(last.content || "").trim(),
      history: sanitized.slice(0, -1)
    };
  }

  return { message: "", history: [] };
}

// Placeholder logging hook for Member 4 integration (no DB implementation here).
async function logConversation(message, reply) {
  // TODO (Member 4): write to Firestore / Cloud Logging.
  void message;
  void reply;
}

async function handleChatRequest(body) {
  const { message, history } = pickChatInputs(body);

  if (!message) {
    return { statusCode: 400, json: { error: "message is required and must be a non-empty string." } };
  }

  try {
    const result = await chat(message, history);
    const reply = typeof result?.reply === "string" ? result.reply : "";
    const updatedHistory = Array.isArray(result?.conversationHistory)
      ? result.conversationHistory
      : history;

    // Fire-and-forget is fine; placeholder does nothing.
    await Promise.resolve(logConversation(message, reply));

    return { statusCode: 200, json: { reply, history: updatedHistory } };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "Internal server error.";
    return { statusCode: 500, json: { error: msg } };
  }
}

app.post("/api/chat", async (req, res) => {
  try {
    const { statusCode, json } = await handleChatRequest(req.body);
    res.status(statusCode).json(json);
  } catch (err) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/api/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Member 3 backend listening on http://localhost:${PORT}`);
});

