import { useState, useRef, useEffect } from "react";
import { Bot, PanelLeft, PanelLeftClose, Trash2 } from "lucide-react";
import ChatMessage, { Message } from "./ChatMessage";
import ChatInput from "./ChatInput";
import LogViewer from "./LogViewer";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable";

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
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
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

  const sendMessage = async (content: string, hiddenContext?: string) => {
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

    const apiMessages = updatedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      // 📡 Member 1: Fetching response from Cloud Function
      console.log("Calling API URL:", API_URL);

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Pass a mock userId for Member 4's logging logic
          userId: "local-dev-user", 
          messages: apiMessages,
          hiddenContext: hiddenContext?.trim() || "",
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
  <div className="h-screen w-full bg-background p-3 sm:p-4">
    <div className="h-full overflow-hidden rounded-2xl border border-border bg-chat-surface shadow-xl">
      <ResizablePanelGroup direction="horizontal">
        {isHistoryOpen && (
          <>
            <ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
              <aside className="h-full min-w-[240px] border-r border-border/70 bg-background/40">
                <LogViewer />
              </aside>
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}

        <ResizablePanel defaultSize={isHistoryOpen ? 70 : 100} minSize={55}>
          <div className="flex min-w-0 h-full flex-1 flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-chat-surface">
              <div className="flex items-center gap-3">
                <Bot className="h-6 w-6 text-primary" />
                <h1 className="text-sm font-semibold">AI Assistant</h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsHistoryOpen((prev) => !prev)}
                  className="flex items-center gap-2 text-xs font-medium bg-secondary px-3 py-1.5 rounded-full hover:bg-secondary/80 transition-all"
                >
                  {isHistoryOpen ? (
                    <>
                      <PanelLeftClose className="h-3.5 w-3.5" /> Close USER HISTORY
                    </>
                  ) : (
                    <>
                      <PanelLeft className="h-3.5 w-3.5" /> Open USER HISTORY
                    </>
                  )}
                </button>
                <button
                  onClick={clearChatForCurrentSession}
                  className="flex items-center gap-2 text-xs font-medium bg-destructive/10 text-destructive px-3 py-1.5 rounded-full hover:bg-destructive/20 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear Chat
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5">
              {messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)}
              {loading && <div className="text-xs text-muted-foreground animate-pulse">AI is typing...</div>}
            </div>

            <ChatInput onSend={sendMessage} disabled={loading} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  </div>
  );
};

export default ChatWindow;