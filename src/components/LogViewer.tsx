import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { Clock, User, ShieldCheck, AlertCircle } from "lucide-react";

const LogViewer = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Member 4 Logic: Querying the logs collection ordered by time
      const q = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(15));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(data);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  return (
    <div className="p-4 h-full overflow-y-auto space-y-4 bg-background">
      <div className="flex justify-between items-center border-b pb-2 mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
          <ShieldCheck className="h-5 w-5 text-primary" /> System Logs (Member 4)
        </h2>
        <button onClick={fetchLogs} className="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1 rounded-md transition-colors">
          Refresh Data
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground">Fetching from Firestore...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">No logs found. Start a chat!</div>
      ) : (
        <div className="grid gap-3">
          {logs.map((log) => (
            <div key={log.id} className="group p-3 border rounded-xl bg-card hover:shadow-md transition-all border-border/50">
              <div className="flex justify-between items-center mb-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  log.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                }`}>
                  {log.type}
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
              
              <div className="space-y-1 text-sm">
                <p className="text-foreground italic">
                  <span className="font-semibold not-italic">User:</span> {log.content || log.userMessage || "N/A"}
                </p>
                <p className="text-foreground">
                  <span className="font-semibold text-green-600">AI:</span> {log.reply || log.aiResponse || (log.type === 'error' ? log.message : "Waiting...")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LogViewer;