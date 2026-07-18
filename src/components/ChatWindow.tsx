import { useState, useRef, useEffect } from "react";
import { Bot, PanelLeft, PanelLeftClose, Trash2, Plus } from "lucide-react";
import ChatMessage, { Message } from "./ChatMessage";
import ChatInput from "./ChatInput";
import LogViewer from "./LogViewer";
import { playSentSound, playReceivedSound } from "@/lib/soundEffects";
import ThemeToggle from "./ThemeToggle";
import ModelSelector, { ModelValue } from "./ModelSelector";
import { useAuth } from "@/context/AuthContext";
import { LogOut } from "lucide-react";
import UsageIndicator from "./UsageIndicator";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

// 🔗 Prefer .env config; fallback keeps local emulator working.
const API_URL =
  import.meta.env.VITE_CHAT_API_URL ||
  "http://127.0.0.1:5001/mahitha-cc-chatbot/us-central1/chat";
const USAGE_API_URL =
  import.meta.env.VITE_USAGE_API_URL ||
  "http://127.0.0.1:5001/mahitha-cc-chatbot/us-central1/getUsage";

const YOUTUBE_SEARCH_API_URL =
  import.meta.env.VITE_YOUTUBE_SEARCH_API_URL ||
  "http://127.0.0.1:5001/mahitha-cc-chatbot/us-central1/searchYoutube";

const IMAGE_GENERATION_API_URL =
  import.meta.env.VITE_IMAGE_GENERATION_API_URL ||
  "http://127.0.0.1:5001/mahitha-cc-chatbot/us-central1/generateImage";

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: "Hey there! 👋 How can I help you today?",
  timestamp: new Date(),
};
const SUGGESTION_PROMPTS = [
  { label: "Explain a concept", prompt: "Explain how neural networks work in simple terms" },
  { label: "Write some code", prompt: "Write a Python function to check if a string is a palindrome" },
  { label: "Summarize a file", prompt: "Summarize the file I'm about to upload" },
  { label: "Brainstorm ideas", prompt: "Help me brainstorm ideas for a college project" },
];

interface UsageInfo {
  minuteUsed: number;
  minuteLimit: number;
  dayUsed: number;
  dayLimit: number;
  minuteResetInSeconds: number;
}

// --- Firestore helpers for session-based history ---
function getSessionsCollection(uid: string) {
  return collection(db, "users", uid, "sessions");
}

function getSessionMessagesCollection(uid: string, sessionId: string) {
  return collection(db, "users", uid, "sessions", sessionId, "messages");
}

async function loadSessionMessages(uid: string, sessionId: string): Promise<Message[]> {
  try {
    const q = query(getSessionMessagesCollection(uid, sessionId), orderBy("timestamp", "asc"));
    const snap = await getDocs(q);
    if (snap.empty) return [WELCOME_MESSAGE];
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        role: data.role,
        content: data.content,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      } as Message;
    });
  } catch (err) {
    console.error("❌ Failed to load session messages:", err);
    return [WELCOME_MESSAGE];
  }
}

async function persistMessage(uid: string, sessionId: string, msg: Message) {
  try {
    await addDoc(getSessionMessagesCollection(uid, sessionId), {
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp.toISOString(),
    });
  } catch (err) {
    console.error("❌ Failed to save message to Firestore:", err);
  }
}

function makeTitleFromContent(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  return trimmed.length > 50 ? `${trimmed.slice(0, 50)}...` : trimmed || "New chat";
}

async function ensureSessionDoc(uid: string, sessionId: string, firstUserContent?: string) {
  try {
    const sessionRef = doc(db, "users", uid, "sessions", sessionId);
    await setDoc(
      sessionRef,
      {
        ...(firstUserContent ? { title: makeTitleFromContent(firstUserContent) } : {}),
        updatedAt: serverTimestamp(),
        ...(firstUserContent ? { createdAt: serverTimestamp() } : {}),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("❌ Failed to save session metadata:", err);
  }
}

// --- Image generation intent detection ---
const IMAGE_INTENT_REGEX =
  /\b(generat\w*|creat\w*|draw\w*|mak\w*|paint\w*)\b.*?\b(image|picture|photo|illustration|artwork)\b\s*(of|depicting|showing|for|about|in)?\s*/i;

function detectImageGenerationPrompt(content: string): string | null {
  const match = content.match(IMAGE_INTENT_REGEX);
  if (!match || match.index === undefined) return null;

  const remainder = content.slice(match.index + match[0].length).trim();
  const prompt = remainder || content.trim();
  return prompt;
}

// --- YouTube search intent detection (MODEL-INDEPENDENT) ---
function detectYoutubeSearchQuery(content: string): string | null {
  console.log("🔍 [MODEL-INDEPENDENT] Checking for YouTube search intent in:", content);
  
  // First, check if user is asking to DESCRIBE or ANALYZE a video
  const isDescribing = /\b(describe|analysis|analyze|explain|tell me about|what is|what are|what's happening|what does)\b.*?\b(video|this|the)\b/i.test(content);
  
  if (isDescribing) {
    console.log("🔍 Detected video description request - NOT YouTube search");
    return null;
  }

  // Check if it's a YouTube search request
  const youtubePatterns = [
    /\b(give|show|find|get|recommend|suggest|search)\s+.*?\b(video|youtube)\s+(links?|videos?)\s+(for|on|about)\s+/i,
    /\b(video|youtube)\s+(links?|videos?)\s+(for|on|about)\s+/i,
    /\b(youtube\s+videos?)\s+(about|on|for)\s+/i,
    /\b(find|search)\s+(youtube\s+)?videos?\s+(for|on|about)\s+/i,
    /\b(links?|videos?)\s+(for|on|about)\s+/i,
    /\byoutube\s+(links?|videos?)\s*/i,
  ];

  let match = null;

  for (const pattern of youtubePatterns) {
    const testMatch = content.match(pattern);
    if (testMatch) {
      match = testMatch;
      console.log("✅ Matched YouTube pattern:", pattern.toString());
      break;
    }
  }

  if (!match || match.index === undefined) {
    console.log("❌ No YouTube pattern matched");
    return null;
  }

  // Extract the query after the matched pattern
  let remainder = content.slice(match.index + match[0].length).trim();
  console.log("📝 Extracted remainder:", remainder);
  
  if (!remainder) {
    const queryExtract = content.match(/(?:for|on|about)\s+(.+?)(?:\?|$)/i);
    if (queryExtract) {
      const query = queryExtract[1].trim();
      console.log("📝 Extracted query from pattern:", query);
      return query;
    }
    
    const fullQuery = content
      .replace(/\b(give|show|find|get|recommend|suggest|search)\s*/i, '')
      .replace(/\b(video|youtube)\s*(links?|videos?)\s*/i, '')
      .replace(/\b(for|on|about)\s*/i, '')
      .trim();
    
    if (fullQuery && fullQuery.length > 3) {
      console.log("📝 Extracted query from full message:", fullQuery);
      return fullQuery;
    }
    
    return null;
  }

  const cleanQuery = remainder.replace(/[?.!]$/, '').trim();
  if (cleanQuery.length < 3 || /^\s*(video|link|youtube)\s*$/i.test(cleanQuery)) {
    console.log("❌ Query too short or invalid:", cleanQuery);
    return null;
  }

  console.log(`🎥 [MODEL-INDEPENDENT] YouTube search query: "${cleanQuery}"`);
  return cleanQuery;
}

const ChatWindow = () => {
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [loading, setLoading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelValue>("openai/gpt-oss-20b");
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();

  useEffect(() => {
    setSessionId(crypto.randomUUID());
    setMessages([WELCOME_MESSAGE]);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setUsage(null);
      return;
    }
    fetch(`${USAGE_API_URL}?userId=${encodeURIComponent(user.uid)}`)
      .then((res) => res.json())
      .then((data) => setUsage(data.usage))
      .catch((err) => console.error("Failed to fetch usage:", err));
  }, [user?.uid]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, loading]);

  const startNewChat = () => {
    setSessionId(crypto.randomUUID());
    setMessages([WELCOME_MESSAGE]);
  };

  const openSession = async (id: string) => {
    if (!user?.uid) return;
    setSessionId(id);
    const loaded = await loadSessionMessages(user.uid, id);
    setMessages(loaded);
  };

  const clearChatForCurrentSession = async () => {
    setMessages([WELCOME_MESSAGE]);
    if (!user?.uid) return;
    try {
      const snap = await getDocs(getSessionMessagesCollection(user.uid, sessionId));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, "users", user.uid, "sessions", sessionId));
    } catch (err) {
      console.error("❌ Failed to clear session history:", err);
    }
    setSessionId(crypto.randomUUID());
  };

  // --- HANDLE YOUTUBE SEARCH (MODEL-INDEPENDENT) ---
  const handleYoutubeSearch = async (query: string): Promise<string> => {
    console.log("🎥 [MODEL-INDEPENDENT] Executing YouTube search for:", query);
    try {
      const searchUrl = `${YOUTUBE_SEARCH_API_URL}?q=${encodeURIComponent(query)}`;
      const res = await fetch(searchUrl);
      
      if (!res.ok) {
        throw new Error(`YouTube API error: ${res.status}`);
      }
      
      const data = await res.json();
      console.log("📡 YouTube API Response:", data);

      if (data.results && data.results.length > 0) {
        const linksMarkdown = data.results
          .map(
            (r: { title: string; url: string; channelTitle: string }, i: number) =>
              `${i + 1}. [${r.title}](${r.url}) — *${r.channelTitle}*`
          )
          .join("\n");
        return `Here are YouTube videos for "${query}":\n\n${linksMarkdown}`;
      } else {
        return `⚠️ No YouTube videos found for "${query}". Try a different search term.`;
      }
    } catch (err) {
      console.error("❌ YouTube search error:", err);
      return `⚠️ YouTube search failed: ${err instanceof Error ? err.message : 'Unknown error'}.`;
    }
  };

  const sendMessage = async (content: string, hiddenContext?: string) => {
    console.group(`💬 Chat Exchange: ${new Date().toLocaleTimeString()}`);
    console.log("📝 User Input:", content);
    console.log("📎 Hidden Context length:", hiddenContext?.length || 0);
    console.log("🤖 Selected Model (ONLY for normal chat):", selectedModel);

    const isFirstUserMessage = messages.length === 1 && messages[0].id === "welcome";

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);
    playSentSound();

    if (user?.uid) {
      persistMessage(user.uid, sessionId, userMsg);
      ensureSessionDoc(user.uid, sessionId, isFirstUserMessage ? content : undefined);
    }

    // ============================================================
    // INTERCEPTION 1: VIDEO ANALYSIS (MODEL-INDEPENDENT)
    // ============================================================
    const hasVideoAttachment = hiddenContext?.includes('📹 **Video Analysis:**');

    const isAskingAboutVideo = /\b(this video|the video|attached video|video file|what is happening|describe this|describe the video|what's happening|what does it show)\b/i.test(content);

    if (hasVideoAttachment && isAskingAboutVideo) {
      console.log("🎬 [MODEL-INDEPENDENT] User asking about attached video - using hidden context");
      
      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Based on the video you uploaded:\n\n${hiddenContext}`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMsg]);
      if (user?.uid) persistMessage(user.uid, sessionId, botMsg);
      playReceivedSound();
      setLoading(false);
      console.groupEnd();
      return;
    }

    // ============================================================
    // INTERCEPTION 2: IMAGE GENERATION (MODEL-INDEPENDENT)
    // ============================================================
    const imagePrompt = detectImageGenerationPrompt(content);
    if (imagePrompt) {
      console.log("🎨 [MODEL-INDEPENDENT] Detected image generation intent, prompt:", imagePrompt);
      const imageUrl = `${IMAGE_GENERATION_API_URL}?prompt=${encodeURIComponent(imagePrompt)}`;
      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Here's an image based on: "${imagePrompt}"\n\n![Generated image](${imageUrl})`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMsg]);
      if (user?.uid) persistMessage(user.uid, sessionId, botMsg);
      playReceivedSound();
      setLoading(false);
      console.groupEnd();
      return;
    }

    // ============================================================
    // INTERCEPTION 3: YOUTUBE SEARCH (MODEL-INDEPENDENT)
    // ============================================================
    const youtubeQuery = detectYoutubeSearchQuery(content);
    console.log("🎯 [MODEL-INDEPENDENT] YouTube query result:", youtubeQuery);

    if (youtubeQuery) {
      console.log("🎥 [MODEL-INDEPENDENT] Processing YouTube search (NO MODEL USED)");
      
      // Execute YouTube search (completely independent of model)
      const replyContent = await handleYoutubeSearch(youtubeQuery);
      
      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: replyContent,
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, botMsg]);
      if (user?.uid) persistMessage(user.uid, sessionId, botMsg);
      playReceivedSound();
      setLoading(false);
      console.groupEnd();
      return;
    }

    // ============================================================
    // NORMAL CHAT FLOW (USES SELECTED MODEL)
    // ============================================================
    console.log("🤖 [MODEL-DEPENDENT] Using normal chat flow with model:", selectedModel);
    
    const MAX_HISTORY_MESSAGES = 10;

    const apiMessages = updatedMessages
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    try {
      console.log("📡 Calling API URL:", API_URL);
      console.log("🤖 Using model:", selectedModel);

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.uid || "anonymous",
          messages: apiMessages,
          hiddenContext: hiddenContext?.trim() || "",
          model: selectedModel,
        }),
      });

      console.log("📊 HTTP Status:", res.status);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (errorData.usage) setUsage(errorData.usage);
        throw new Error(errorData.error || `Server responded with ${res.status}`);
      }

      const data = await res.json();
      console.info("✅ AI Response received successfully");
      if (data.usage) setUsage(data.usage);

      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply || "I'm sorry, I couldn't generate a response.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMsg]);
      if (user?.uid) persistMessage(user.uid, sessionId, botMsg);
      playReceivedSound();

    } catch (err: any) {
      console.error("❌ Pipeline Error:", err.message);

      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `⚠️ ${err.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      if (user?.uid) persistMessage(user.uid, sessionId, errorMsg);
    } finally {
      setLoading(false);
      console.groupEnd();
    }
  };

  const isFreshSession = messages.length === 1 && messages[0].id === "welcome";
  return (
    <div className="h-screen w-full bg-background p-3 sm:p-4">
      <div className="h-full overflow-hidden rounded-2xl border border-border bg-chat-surface shadow-xl">
        <ResizablePanelGroup direction="horizontal">
          {isHistoryOpen && (
            <>
              <ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
                <aside className="h-full min-w-[240px] border-r border-border/70 bg-background/40">
                  <LogViewer
                    userId={user?.uid}
                    activeSessionId={sessionId}
                    onSelectSession={openSession}
                    onNewChat={startNewChat}
                  />
                </aside>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}

          <ResizablePanel defaultSize={isHistoryOpen ? 70 : 100} minSize={55}>
            <div className="flex min-w-0 h-full flex-1 flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-chat-surface">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-sm font-semibold leading-tight">CloudChat AI</h1>
                    <p className="text-[11px] text-muted-foreground leading-tight">Powered by Groq · Firebase</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden sm:block text-xs text-muted-foreground mr-1">
                    {user?.email}
                  </span>
                  <UsageIndicator usage={usage} />
                  <ModelSelector value={selectedModel} onChange={setSelectedModel} />
                  <ThemeToggle />
                  <button
                    onClick={logout}
                    className="flex items-center gap-2 text-xs font-medium bg-secondary px-3 py-1.5 rounded-full hover:bg-secondary/80 transition-all"
                    title="Log out"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
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
                    onClick={startNewChat}
                    className="flex items-center gap-2 text-xs font-medium bg-secondary px-3 py-1.5 rounded-full hover:bg-secondary/80 transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" /> New Chat
                  </button>
                  <button
                    onClick={clearChatForCurrentSession}
                    className="flex items-center gap-2 text-xs font-medium bg-destructive/10 text-destructive px-3 py-1.5 rounded-full hover:bg-destructive/30 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear Chat
                  </button>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-5">
                {messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)}
                {isFreshSession && !loading && (
                  <div className="flex flex-wrap gap-2 mt-2 ml-10">
                    {SUGGESTION_PROMPTS.map((item) => (
                      <button
                        key={item.label}
                        onClick={() => sendMessage(item.prompt)}
                        className="rounded-full border border-border bg-secondary/50 px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary hover:border-primary/30"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
                {loading && (
                  <div className="flex items-center gap-2.5 mb-5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Bot className="h-4.5 w-4.5" />
                    </div>
                    <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-chat-bot px-4 py-3.5 shadow-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
                    </div>
                  </div>
                )}
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