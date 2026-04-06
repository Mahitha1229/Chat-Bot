 require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// System prompt — defines the chatbot's personality
const SYSTEM_PROMPT = {
  role: 'system',
  content: 'You are a helpful, friendly and concise assistant. Answer clearly and avoid unnecessary filler.'
};

// Main chat function — takes a user message and conversation history
async function chat(userMessage, conversationHistory = []) {
  try {
    // If this is the first message, start with the system prompt
    if (conversationHistory.length === 0) {
      conversationHistory.push(SYSTEM_PROMPT);
    }

    // Add the new user message to history
    conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    // Call the Groq API
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: conversationHistory,
      max_tokens: 1024,
      temperature: 0.7
    });

    // Extract the reply
    const reply = response.choices[0].message.content;

    // Add the bot's reply to history
    conversationHistory.push({
      role: 'assistant',
      content: reply
    });

    return { reply, conversationHistory };

    } catch (error) {
    if (error.status === 429) {
      return { reply: 'I am a bit busy right now, please try again in a moment.', conversationHistory };
    } else if (error.status === 401) {
      return { reply: 'Invalid API key. Please check your .env file.', conversationHistory };
    } else {
      return { reply: 'Something went wrong. Please try again.', conversationHistory };
    }
  }
}

module.exports = { chat };
