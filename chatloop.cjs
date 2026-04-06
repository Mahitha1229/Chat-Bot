require("dotenv").config();
const readline = require("readline");
const { chat } = require("./chat.cjs");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let conversationHistory = [];

console.log("🤖 Chatbot is ready! Type your message below.");
console.log('   (Type "exit" to quit)\n');

function askQuestion() {
  rl.question("You: ", async (userInput) => {
    // Handle exit
    if (userInput.toLowerCase() === "exit") {
      console.log("\nBot: Goodbye! 👋");
      rl.close();
      return;
    }

    // Handle empty input
    if (!userInput.trim()) {
      console.log("Bot: Please type something!\n");
      askQuestion();
      return;
    }

    // Get reply from chatbot
    const result = await chat(userInput, conversationHistory);
    conversationHistory = result.conversationHistory;

    console.log(`\nBot: ${result.reply}\n`);
    askQuestion();
  });
}

askQuestion();
