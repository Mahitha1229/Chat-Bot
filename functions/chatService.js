"use strict";

const Groq = require("groq-sdk");

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "You are a helpful, friendly and concise assistant. Answer clearly and avoid unnecessary filler."
};

const MODEL_NAME = process.env.MODEL_NAME || "llama-3.3-70b-versatile";

function createChatService(apiKey) {
  if (!apiKey) return null;
  const groq = new Groq({ apiKey });

  return {
    async chat(messages) {
      const completion = await groq.chat.completions.create({
        model: MODEL_NAME,
        messages: [SYSTEM_PROMPT, ...messages],
        temperature: 0.7,
        max_tokens: 1024
      });

      return completion.choices?.[0]?.message?.content?.trim() || "No response received.";
    }
  };
}

module.exports = { createChatService };
