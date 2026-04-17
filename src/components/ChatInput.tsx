import { useRef, useState, KeyboardEvent } from "react";
import { Loader2, Mic, Paperclip, Send, X } from "lucide-react";
// 1. Import your db and Firestore functions
import { db } from "../lib/firebase"; 
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import mammoth from "mammoth";
import { createWorker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

interface ChatInputProps {
  onSend?: (message: string, hiddenContext?: string) => void;
  disabled?: boolean;
}

type BrowserWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
};

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionAlternative {
  0: SpeechRecognitionResultItem;
  isFinal: boolean;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionAlternative[];
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
const MAX_PDF_SIZE_MB = 5;
const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 3;
const OCR_MAX_PDF_PAGES = 10;
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png"];

interface PendingAttachment {
  id: string;
  fileName: string;
  extractedText: string;
}

const ChatInput = ({ onSend, disabled }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false); // Track loading state
  const [isListening, setIsListening] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechBaseTextRef = useRef("");
  const speechFinalTranscriptRef = useRef("");
  const processAndSendText = async (rawText: string, hiddenContext?: string) => {
    const trimmed = rawText.trim();
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
        onSend(trimmed, hiddenContext);
      }
      
      setInput("");
      if (attachments.length > 0) {
        setStatusMessage("Sent. Attached file context is still available for follow-up questions.");
      }
    } catch (error) {
      console.error("❌ Error adding message: ", error);
      // If you get a permission error here now, restart your browser tab.
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = async () => {
    const hiddenContext = attachments.map((item) => item.extractedText).join("\n\n").trim();
    await processAndSendText(input, hiddenContext || undefined);
  };

  const extractTextWithOcrFromPdf = async (pdf: pdfjsLib.PDFDocumentProxy) => {
    const worker = await createWorker("eng");
    const pages: string[] = [];
    try {
      const pagesToScan = Math.min(pdf.numPages, OCR_MAX_PDF_PAGES);
      for (let pageIndex = 1; pageIndex <= pagesToScan; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) continue;

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: context, viewport }).promise;

        const result = await worker.recognize(canvas);
        const text = result.data.text.trim();
        if (text) pages.push(text);
      }
    } finally {
      await worker.terminate();
    }
    return pages.join("\n");
  };

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const bytes = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const pages: string[] = [];
    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .trim();
      if (text) pages.push(text);
    }

    const directText = pages.join("\n").trim();
    if (directText) return directText;

    return extractTextWithOcrFromPdf(pdf);
  };

  const extractTextFromDocx = async (file: File): Promise<string> => {
    const bytes = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: bytes });
    return result.value.trim();
  };

  const extractTextFromImage = async (file: File): Promise<string> => {
    const worker = await createWorker("eng");
    try {
      const result = await worker.recognize(file);
      return result.data.text.trim();
    } finally {
      await worker.terminate();
    }
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    const lowerName = file.name.toLowerCase();

    if (file.type.startsWith("text/") || lowerName.endsWith(".txt")) {
      return (await file.text()).trim();
    }

    if (
      file.type === "application/pdf" ||
      file.type === "application/x-pdf" ||
      lowerName.endsWith(".pdf")
    ) {
      if (file.size > MAX_PDF_SIZE_BYTES) {
        throw new Error(`PDF is too large. Maximum allowed size is ${MAX_PDF_SIZE_MB} MB.`);
      }
      return extractTextFromPdf(file);
    }

    if (
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      lowerName.endsWith(".docx")
    ) {
      return extractTextFromDocx(file);
    }

    const isSupportedImage =
      SUPPORTED_IMAGE_TYPES.includes(file.type) ||
      lowerName.endsWith(".jpg") ||
      lowerName.endsWith(".jpeg") ||
      lowerName.endsWith(".png");

    if (isSupportedImage) {
      return extractTextFromImage(file);
    }

    throw new Error("Unsupported file type. Use TXT, PDF, DOCX, JPG, or PNG.");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || disabled || isSending) return;
    if (files.length > MAX_FILES_PER_UPLOAD) {
      setStatusMessage(`You can upload maximum ${MAX_FILES_PER_UPLOAD} files at once.`);
      event.target.value = "";
      return;
    }
    if (attachments.length + files.length > MAX_FILES_PER_UPLOAD) {
      setStatusMessage(`You can keep only ${MAX_FILES_PER_UPLOAD} attachments before sending.`);
      event.target.value = "";
      return;
    }

    setIsProcessingFile(true);
    setStatusMessage("Extracting file text...");

    try {
      const parsedAttachments: PendingAttachment[] = [];
      for (const file of files) {
        setStatusMessage(`Extracting text from ${file.name}...`);
        const extractedText = await extractTextFromFile(file);
        if (!extractedText) {
          setStatusMessage(`No readable text found in ${file.name}.`);
          continue;
        }

        await addDoc(collection(db, "messages"), {
          text: extractedText,
          sender: "user",
          source: "upload_extracted_text",
          fileName: file.name,
          visibleInChat: false,
          timestamp: serverTimestamp(),
        });
        parsedAttachments.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          extractedText,
        });
      }

      if (!parsedAttachments.length) {
        setStatusMessage("No readable text was found in selected files.");
        return;
      }

      setAttachments((prev) => [...prev, ...parsedAttachments]);
      setStatusMessage(`${parsedAttachments.length} file(s) parsed and stored. Type your message and press Send.`);
    } catch (error) {
      console.error("❌ File processing error:", error);
      setStatusMessage(error instanceof Error ? error.message : "Failed to process file.");
    } finally {
      event.target.value = "";
      setIsProcessingFile(false);
      setTimeout(() => setStatusMessage(""), 2500);
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((prev) => {
      const next = prev.filter((item) => item.id !== attachmentId);
      setStatusMessage(
        next.length > 0
          ? "Attachment removed. Remaining attachments are still used for follow-ups."
          : "Attachment removed. No file context is currently attached."
      );
      return next;
    });
  };

  const toggleSpeechRecognition = () => {
    if (disabled || isSending || isProcessingFile) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setStatusMessage("Stopped listening.");
      return;
    }

    const browserWindow = window as BrowserWindow;
    const SpeechRecognitionAPI =
      browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setStatusMessage("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    speechBaseTextRef.current = input.trim();
    speechFinalTranscriptRef.current = "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let nextFinalTranscript = "";
      let interimTranscript = "";

      for (let i = 0; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript.trim();
        if (!chunk) continue;

        if (event.results[i].isFinal) {
          nextFinalTranscript = `${nextFinalTranscript} ${chunk}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${chunk}`.trim();
        }
      }

      speechFinalTranscriptRef.current = nextFinalTranscript;
      const nextInput = [speechBaseTextRef.current, nextFinalTranscript, interimTranscript]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      setInput(nextInput);
    };

    recognition.onerror = () => {
      setStatusMessage("Unable to capture audio. Check microphone permissions.");
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setStatusMessage("Voice input ready.");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setStatusMessage("Listening... click mic again to stop.");
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border bg-chat-surface p-4">
      {attachments.length > 0 && (
        <div className="mb-2">
          <div className="flex flex-wrap gap-2">
            {attachments.map((item) => (
              <div
                key={item.id}
                className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary"
              >
                <span>📎 Attached: {item.fileName}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(item.id)}
                  className="rounded-full p-0.5 hover:bg-primary/20"
                  title="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-end gap-3">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.pdf,.docx,.jpg,.jpeg,.png"
        onChange={handleFileUpload}
        className="hidden"
      />
      <button
        onClick={toggleSpeechRecognition}
        disabled={disabled || isSending || isProcessingFile}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-input bg-background text-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        title="Speech to text"
      >
        {isListening ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || isSending || isProcessingFile}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-input bg-background text-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        title="Upload document or image"
      >
        {isProcessingFile ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
      </button>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled || isSending || isProcessingFile}
        rows={1}
        className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !input.trim() || isSending || isProcessingFile}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {isSending ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <Send className="h-5 w-5" />
        )}
      </button>
      </div>
      {statusMessage && <p className="mt-2 text-xs text-muted-foreground">{statusMessage}</p>}
    </div>
  );
};

export default ChatInput;