import { useState, useRef, useEffect } from "react";
import { Bot, Loader2 } from "lucide-react";
import ChatMessage, { Message } from "./ChatMessage";
import ChatInput from "./ChatInput";

const API_URL = ""; // TODO: Replace with your Cloud Function endpoint URL

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (content: string) => {
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
      if (!API_URL) {
        // Mock response when no backend is connected
        await new Promise((r) => setTimeout(r, 1000));
        const botMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `I received your message: "${content}"\n\nConnect me to a backend API to get real responses!`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, botMsg]);
        return;
      }

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply || data.message || data.content || "No response received.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "⚠️ Something went wrong. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-chat-surface shadow-xl sm:my-6 sm:h-[calc(100vh-3rem)] sm:rounded-2xl sm:border sm:border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-chat-surface">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-foreground">AI Assistant</h1>
          <p className="text-xs text-muted-foreground">Always here to help</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm px-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Thinking...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={loading} />
    </div>
  );
};

export default ChatWindow;
