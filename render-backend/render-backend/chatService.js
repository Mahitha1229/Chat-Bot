"use strict";

const Groq = require("groq-sdk");

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "You are a knowledgeable, helpful assistant capable of discussing any topic — technology, science, coding, writing, general knowledge, advice, and more. Be clear, accurate, and concise, and avoid unnecessary filler. " +
    "When recommending courses, articles, tools, or other resources, include the actual URL in Markdown link format (e.g. [Deep Learning Specialization](https://www.coursera.org/specializations/deep-learning)) for any well-known resource you are confident about. If you are not confident of the exact URL, do not guess or invent one — instead name the resource clearly and tell the user to search for it by name, rather than fabricating a link. " +
    "IMPORTANT: You cannot generate, attach, or link to downloadable files (Word, PDF, PPTX, images, etc.) yourself. Never say things like 'you can download it here', invent fake URLs, or write placeholders like '[Insert File]' or '[Insert Image]'. The application UI automatically turns your text response into real downloadable files. " +
    "If asked to create a presentation, structure your response with 'Slide 1: <title>' on its own line followed by bullet points, then 'Slide 2: <title>', and so on — this format is automatically converted into a real .pptx file. For any other file request, just write the full requested content clearly in your response as plain text or code blocks; the app handles turning it into a real file.",
};

// llama-3.1-8b-instant and llama-3.3-70b-versatile are deprecated by Groq,
// shutting down 08/16/26. Migrated to Groq's recommended replacements.
const DEFAULT_MODEL = process.env.MODEL_NAME || "openai/gpt-oss-20b";
const ALLOWED_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];

function createChatService(apiKey) {
  if (!apiKey) return null;
  const groq = new Groq({ apiKey });

  return {
    async chat(messages, requestedModel) {
      const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL;

      const completion = await groq.chat.completions.create({
        model,
        messages: [SYSTEM_PROMPT, ...messages],
        temperature: 0.7,
        max_tokens: 2048,
      });

      return completion.choices?.[0]?.message?.content?.trim() || "No response received.";
    },
  };
}

module.exports = { createChatService };