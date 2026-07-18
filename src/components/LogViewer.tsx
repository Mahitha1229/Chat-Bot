import { useEffect, useState } from "react";
import { MessageSquare, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  serverTimestamp 
} from "firebase/firestore";

interface LogViewerProps {
  userId?: string;
  activeSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

interface SessionEntry {
  id: string;
  title: string;
}

const LogViewer = ({ userId, activeSessionId, onSelectSession, onNewChat }: LogViewerProps) => {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, "users", userId, "sessions"),
      orderBy("updatedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const entries: SessionEntry[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title || "New chat",
          };
        });
        setSessions(entries);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to fetch sessions:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const handleRename = async (sessionId: string) => {
    if (!userId || !editTitle.trim()) return;

    try {
      const sessionRef = doc(db, "users", userId, "sessions", sessionId);
      await updateDoc(sessionRef, {
        title: editTitle.trim(),
        updatedAt: serverTimestamp(),
      });
      
      setEditingSessionId(null);
      setEditTitle("");
    } catch (error) {
      console.error("Failed to rename session:", error);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!userId) return;
    
    if (!window.confirm("Are you sure you want to delete this conversation? This action cannot be undone.")) {
      return;
    }

    setDeletingSessionId(sessionId);

    try {
      const messagesRef = collection(db, "users", userId, "sessions", sessionId, "messages");
      const messagesSnapshot = await getDocs(messagesRef);
      
      const deletePromises = messagesSnapshot.docs.map((docSnapshot) => 
        deleteDoc(docSnapshot.ref)
      );
      await Promise.all(deletePromises);
      
      const sessionRef = doc(db, "users", userId, "sessions", sessionId);
      await deleteDoc(sessionRef);
      
      if (sessionId === activeSessionId) {
        onNewChat();
      }
      
      setDeletingSessionId(null);
    } catch (error) {
      console.error("Failed to delete session:", error);
      setDeletingSessionId(null);
    }
  };

  const startEditing = (session: SessionEntry) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  const cancelEditing = () => {
    setEditingSessionId(null);
    setEditTitle("");
  };

  const handleKeyDown = (e: React.KeyboardEvent, sessionId: string) => {
    if (e.key === "Enter") {
      handleRename(sessionId);
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  return (
    <div className="p-4 h-full overflow-y-auto space-y-2 bg-background">
      <div className="flex justify-between items-center border-b pb-3 mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Recents</h2>
        <button
          onClick={onNewChat}
          className="flex items-center gap-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 rounded-md transition-colors"
          title="Start a new chat"
        >
          <Plus className="h-3.5 w-3.5" /> New
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">No chats yet. Start one!</div>
      ) : (
        <div className="space-y-1">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                session.id === activeSessionId
                  ? "bg-secondary font-medium text-foreground"
                  : "hover:bg-secondary/50 text-muted-foreground"
              }`}
            >
              {editingSessionId === session.id ? (
                <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, session.id)}
                    className="flex-1 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus
                    placeholder="Enter conversation name..."
                  />
                  <button
                    onClick={() => handleRename(session.id)}
                    className="p-1 hover:bg-primary/10 rounded transition-colors"
                    title="Save"
                  >
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  </button>
                  <button
                    onClick={cancelEditing}
                    className="p-1 hover:bg-destructive/10 rounded transition-colors"
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => onSelectSession(session.id)}
                    className="flex-1 flex items-center gap-2 min-w-0"
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{session.title}</span>
                  </button>
                  
                  {/* Action buttons - always visible on touch/mobile, hover-revealed on desktop */}
                  <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditing(session);
                      }}
                      className="p-1 hover:bg-primary/10 rounded transition-colors"
                      title="Rename conversation"
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground hover:text-primary" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(session.id);
                      }}
                      className="p-1 hover:bg-destructive/10 rounded transition-colors"
                      title="Delete conversation"
                      disabled={deletingSessionId === session.id}
                    >
                      {deletingSessionId === session.id ? (
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                      ) : (
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LogViewer;