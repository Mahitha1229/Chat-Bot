const { chat } = require("./chat.cjs");

async function main() {
  let history = [];

  // Test 1 — basic reply
  console.log("--- Test 1: Basic message ---");
  let result = await chat("Hello! What is cloud computing?", history);
  console.log("Bot:", result.reply);
  history = result.conversationHistory;

  // Test 2 — memory test
  console.log("\n--- Test 2: Memory test ---");
  result = await chat("Can you summarize what you just said in one sentence?", history);
  console.log("Bot:", result.reply);
  history = result.conversationHistory;

  // Test 3 — empty message
  console.log("\n--- Test 3: Empty message ---");
  result = await chat("", history);
  console.log("Bot:", result.reply);
}

main();
