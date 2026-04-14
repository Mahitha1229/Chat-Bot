import { useState, useRef, useEffect } from "react";
import { Bot, Trash2 } from "lucide-react";
import ChatMessage, { Message } from "./ChatMessage";
import ChatInput from "./ChatInput";
import LogViewer from "./LogViewer";
import { History, MessageSquare } from "lucide-react";

// 🔗 Prefer .env config; fallback keeps local emulator working.
const API_URL =
  import.meta.env.VITE_CHAT_API_URL ||
  "http://127.0.0.1:5001/cc-llm-chatbot/us-central1/chat";
const CHAT_SESSION_ID_KEY = "cc-chat-session-id";
const CHAT_HISTORY_PREFIX = "cc-chat-history";
const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: "Hey there! 👋 How can I help you today?",
  timestamp: new Date(),
};

function getSessionHistoryKey() {
  let sessionId = sessionStorage.getItem(CHAT_SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(CHAT_SESSION_ID_KEY, sessionId);
  }
  return `${CHAT_HISTORY_PREFIX}:${sessionId}`;
}

function loadSavedMessages(historyKey: string): Message[] {
  try {
    const raw = sessionStorage.getItem(historyKey);
    if (!raw) return [WELCOME_MESSAGE];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [WELCOME_MESSAGE];

    return parsed
      .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
      .map((m) => ({
        id: String(m.id || crypto.randomUUID()),
        role: m.role,
        content: m.content,
        timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
      }));
  } catch {
    return [WELCOME_MESSAGE];
  }
}

const ChatWindow = () => {
  const historyKeyRef = useRef<string>(getSessionHistoryKey());
  const [messages, setMessages] = useState<Message[]>(() => loadSavedMessages(historyKeyRef.current));
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'chat' | 'history'>('chat');

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, loading]);

  useEffect(() => {
    try {
      sessionStorage.setItem(historyKeyRef.current, JSON.stringify(messages));
    } catch {
      // Ignore quota/storage failures in demo mode.
    }
  }, [messages]);

  const clearChatForCurrentSession = () => {
    setMessages([WELCOME_MESSAGE]);
    try {
      sessionStorage.removeItem(historyKeyRef.current);
    } catch {
      // Ignore storage failures in demo mode.
    }
  };

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
    {/* Updated Header */}
    <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-chat-surface">
      <div className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-primary" />
        <h1 className="text-sm font-semibold">AI Assistant</h1>
      </div>
      
      <div className="flex items-center gap-2">
        {viewMode === "chat" && (
          <button
            onClick={clearChatForCurrentSession}
            className="flex items-center gap-2 text-xs font-medium bg-destructive/10 text-destructive px-3 py-1.5 rounded-full hover:bg-destructive/20 transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear Chat
          </button>
        )}
        {/* Member 4 Toggle Button */}
        <button
          onClick={() => setViewMode(viewMode === 'chat' ? 'history' : 'chat')}
          className="flex items-center gap-2 text-xs font-medium bg-secondary px-3 py-1.5 rounded-full hover:bg-secondary/80 transition-all"
        >
          {viewMode === 'chat' ? (
            <><History className="h-3.5 w-3.5" /> View Logs</>
          ) : (
            <><MessageSquare className="h-3.5 w-3.5" /> Back to Chat</>
          )}
        </button>
      </div>
    </div>

    {/* Dynamic Content Body */}
    <div className="flex-1 overflow-hidden">
      {viewMode === 'chat' ? (
        <div ref={scrollRef} className="h-full overflow-y-auto p-5">
          {messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)}
          {loading && <div className="text-xs text-muted-foreground animate-pulse">AI is typing...</div>}
        </div>
      ) : (
        <LogViewer />
      )}
    </div>

    {/* Input is only visible in chat mode */}
    {viewMode === 'chat' && <ChatInput onSend={sendMessage} disabled={loading} />}
  </div>
);
};

export default ChatWindow;