import { useState, useRef, useEffect } from "react";
import { Bot, Loader2 } from "lucide-react";
import ChatMessage, { Message } from "./ChatMessage";
import ChatInput from "./ChatInput";

// 🔗 Points to your local Firebase Emulator (Member 3 - Backend)
const API_URL = "http://127.0.0.1:5001/ccproject-b0f76/us-central1/chat";

const ChatWindow = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey there! 👋 How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, loading]);

  const sendMessage = async (content: string) => {
    // 📊 Member 4: Tracking the start of a conversation exchange
    console.group(`💬 Chat Exchange: ${new Date().toLocaleTimeString()}`);
    console.log("User Input:", content);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      // 📡 Member 1: Fetching response from Cloud Function
      console.log("Calling API URL:", API_URL);

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Pass a mock userId for Member 4's logging logic
          userId: "local-dev-user", 
          messages: updatedMessages.map((m) => ({ 
            role: m.role, 
            content: m.content 
          })),
        }),
      });

      console.log("HTTP Status:", res.status);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${res.status}`);
      }

      const data = await res.json();
      
      // 🤖 Member 2: Parsing LLM response
      console.info("AI Response received successfully:", data.reply);
      
      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply || "I'm sorry, I couldn't generate a response.",
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, botMsg]);

    } catch (err: any) {
      // ⚠️ Error Handling (Member 3/4)
      console.error("❌ Pipeline Error:", err.message);

      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `⚠️ Error: ${err.message}. Please ensure the Firebase Emulator is running.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      console.groupEnd();
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-chat-surface shadow-xl sm:my-6 sm:h-[calc(100vh-3rem)] sm:rounded-2xl sm:border sm:border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-chat-surface shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-foreground">AI Assistant</h1>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <p className="text-xs text-muted-foreground font-medium">Emulator Active</p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin scrollbar-thumb-border"
      >
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm px-2 animate-in fade-in slide-in-from-bottom-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="italic">AI is thinking...</span>
          </div>
        )}
      </div>

      {/* Input Component */}
      <div className="p-4 bg-chat-surface border-t border-border">
        <ChatInput onSend={sendMessage} disabled={loading} />
      </div>
    </div>
  );
};

export default ChatWindow;