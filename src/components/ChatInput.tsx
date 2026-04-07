import { useState, KeyboardEvent } from "react";
import { Send } from "lucide-react";
// 1. Import your db and Firestore functions
import { db } from "../lib/firebase"; 
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

interface ChatInputProps {
  onSend?: (message: string) => void;
  disabled?: boolean;
}

const ChatInput = ({ onSend, disabled }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false); // Track loading state

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || disabled || isSending) return;

    setIsSending(true);
    console.log("Attempting to save to Firestore..."); // Debug log
    
    try {
      // 1. Save to Firestore (This is for your message history)
      await addDoc(collection(db, "messages"), {
        text: trimmed,
        sender: "user",
        timestamp: serverTimestamp(),
      });
      console.log("✅ Saved to Firestore");

      // 2. CRITICAL: Call the onSend prop!
      // This tells ChatWindow.tsx to send the message to your AI Emulator.
      if (onSend) {
        console.log("Triggering AI API call via onSend...");
        onSend(trimmed);
      }
      
      setInput("");
    } catch (error) {
      console.error("❌ Error adding message: ", error);
      // If you get a permission error here now, restart your browser tab.
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-end gap-3 p-4 border-t border-border bg-chat-surface">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled || isSending}
        rows={1}
        className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !input.trim() || isSending}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {isSending ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <Send className="h-5 w-5" />
        )}
      </button>
    </div>
  );
};

export default ChatInput;