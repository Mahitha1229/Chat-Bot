import { useRef, useState, KeyboardEvent, useEffect } from "react";
import { Loader2, Mic, Paperclip, Send, X } from "lucide-react";
import { db } from "../lib/firebase";
import mammoth from "mammoth";
import { createWorker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import * as XLSX from "xlsx";
import JSZip from "jszip";

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

// --- Audio / video transcription config ---
const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav", ".webm", ".ogg"];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".mkv"];
const MAX_MEDIA_SIZE_MB = 25;
const MAX_MEDIA_SIZE_BYTES = MAX_MEDIA_SIZE_MB * 1024 * 1024;

const TRANSCRIBE_API_URL =
  import.meta.env.VITE_TRANSCRIBE_API_URL ||
  "http://127.0.0.1:5001/mahitha-cc-chatbot/us-central1/transcribeAudio";
const ANALYZE_VIDEO_API_URL =
  import.meta.env.VITE_ANALYZE_VIDEO_API_URL ||
  "http://127.0.0.1:5001/mahitha-cc-chatbot/us-central1/analyzeVideoFrames";
const ANALYZE_IMAGE_API_URL =
  import.meta.env.VITE_ANALYZE_IMAGE_API_URL ||
  "http://127.0.0.1:5001/mahitha-cc-chatbot/us-central1/analyzeImage";

// --- Spreadsheet config ---
const SPREADSHEET_EXTENSIONS = [".xlsx", ".xls", ".csv"];

// --- Plain-text-like code/config files ---
const TEXT_LIKE_EXTENSIONS = [
  ".json", ".xml", ".md", ".py", ".js", ".ts", ".tsx", ".jsx",
  ".java", ".c", ".cpp", ".h", ".css", ".html", ".yml", ".yaml",
  ".log", ".ini", ".sh", ".rb", ".go", ".php", ".sql", ".env", ".ipynb",
];

// Roughly 4 chars ≈ 1 token. Cap extracted text well under Groq's TPM limit,
// leaving room for the rest of the conversation + system prompt.
const MAX_EXTRACTED_TEXT_CHARS = 12000;

function truncateExtractedText(text: string, fileName: string): string {
  if (text.length <= MAX_EXTRACTED_TEXT_CHARS) return text;
  const truncated = text.slice(0, MAX_EXTRACTED_TEXT_CHARS);
  return `${truncated}\n\n[... Content truncated. "${fileName}" was too large to include in full (${text.length} characters). Showing the first ${MAX_EXTRACTED_TEXT_CHARS} characters only.]`;
}

// --- Zip archive config ---
const ZIP_EXTENSIONS = [".zip"];
const MAX_ZIP_ENTRIES_TO_READ = 20;
const MAX_ZIP_ENTRY_CHARS = 3000;
const MAX_GENERIC_SIZE_MB = 25;
const MAX_GENERIC_SIZE_BYTES = MAX_GENERIC_SIZE_MB * 1024 * 1024;

interface PendingAttachment {
  id: string;
  fileName: string;
  extractedText: string;
}

const ChatInput = ({ onSend, disabled }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechBaseTextRef = useRef("");
  const speechFinalTranscriptRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Auto-grow function ---
  const autoGrow = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    }
  };

  // --- Auto-grow on input change ---
  useEffect(() => {
    autoGrow();
  }, [input]);

  // --- Reset height when sending ---
  const resetTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const processAndSendText = async (rawText: string, hiddenContext?: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || disabled || isSending) return;

    setIsSending(true);

    try {
      if (onSend) {
        onSend(trimmed, hiddenContext);
      }

      setInput("");
      resetTextareaHeight();
      if (attachments.length > 0) {
        setStatusMessage("Sent. Attached file context is still available for follow-up questions.");
      }
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
  const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const analyzeImageVisuals = async (file: File): Promise<string> => {
  try {
    const dataUrl = await fileToDataUrl(file);
    const res = await fetch(ANALYZE_IMAGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: dataUrl }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return (data.description || "").trim();
  } catch (err) {
    console.error("❌ Image analysis error:", err);
    return "";
  }
};

  // --- Audio/video: send to transcribeAudio Cloud Function ---
  const transcribeMediaFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const res = await fetch(TRANSCRIBE_API_URL, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Transcription failed with status ${res.status}`);
    }

    const data = await res.json();
    console.log("DEBUG - Raw transcription result:", data.text);
    return (data.text || "").trim();
  };
  
  const extractFramesFromVideo = (file: File, frameCount = 4): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.src = URL.createObjectURL(file);

      const frames: string[] = [];
      let loaded = false;

      const cleanup = () => {
        if (video.src) URL.revokeObjectURL(video.src);
        video.remove();
      };

      video.onloadedmetadata = () => {
        loaded = true;
        const duration = video.duration;
        
        if (!duration || duration <= 0) {
          cleanup();
          reject(new Error("Video has invalid duration"));
          return;
        }

        const timestamps = Array.from(
          { length: Math.min(frameCount, 4) },
          (_, i) => (duration * (i + 1)) / (Math.min(frameCount, 4) + 1)
        );
        
        console.log(`🎞️ Extracting ${timestamps.length} frames at:`, timestamps);
        
        let index = 0;

        const captureNext = () => {
          if (index >= timestamps.length) {
            cleanup();
            console.log(`✅ Extracted ${frames.length} frames`);
            resolve(frames);
            return;
          }
          video.currentTime = timestamps[index];
        };

        video.onseeked = () => {
          try {
            const canvas = document.createElement("canvas");
            const MAX_DIMENSION = 480;
            const scale = Math.min(1, MAX_DIMENSION / Math.max(video.videoWidth || 640, video.videoHeight || 480));
            canvas.width = Math.round((video.videoWidth || 640) * scale);
            canvas.height = Math.round((video.videoHeight || 480) * scale);
            
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
              frames.push(dataUrl);
              console.log(`📸 Frame ${index + 1}/${timestamps.length} captured (${Math.round(dataUrl.length / 1024)}KB)`);
            }
            index += 1;
            captureNext();
          } catch (err) {
            console.error('❌ Frame capture error:', err);
            cleanup();
            reject(err);
          }
        };

        video.onerror = () => {
          console.error('❌ Video loading error');
          cleanup();
          reject(new Error("Could not load video for frame extraction."));
        };

        captureNext();
      };

      video.onerror = () => {
        cleanup();
        reject(new Error("Failed to load video file."));
      };

      setTimeout(() => {
        if (!loaded) {
          cleanup();
          reject(new Error("Video loading timed out"));
        }
      }, 10000);
    });
  };

  // --- ENHANCED: analyzeVideoVisuals with better error handling ---
  const analyzeVideoVisuals = async (frames: string[]): Promise<string> => {
    console.log("🔍 Sending frames to analyzeVideoFrames API...");
    console.log(`📹 Number of frames: ${frames.length}`);
    console.log(`📹 First frame size: ${Math.round(frames[0]?.length / 1024)}KB`);
    
    try {
      const res = await fetch(ANALYZE_VIDEO_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames }),
      });

      console.log(`📡 Response status: ${res.status}`);

      if (!res.ok) {
        const errorText = await res.text();
        console.error("❌ API Error Response:", errorText);
        return "";
      }

      const data = await res.json();
      console.log("📡 Response data received");
      
      if (data.description && typeof data.description === 'string') {
        // Don't return fallback messages
        if (data.description.includes("currently unavailable") || 
            data.description.includes("Visual analysis is unavailable") ||
            data.description.includes("Visual analysis not available") ||
            data.description.includes("couldn't analyze")) {
          console.warn("⚠️ API returned fallback message, ignoring");
          return "";
        }
        return data.description.trim();
      }
      
      return "";
    } catch (error) {
      console.error("❌ analyzeVideoVisuals error:", error);
      return "";
    }
  };

  // --- Spreadsheets: parse with xlsx ---
  const extractTextFromSpreadsheet = async (file: File): Promise<string> => {
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheetTexts: string[] = [];

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet).trim();
      if (csv) {
        sheetTexts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
      }
    });

    return sheetTexts.join("\n\n");
  };

  // --- Zip archives: read text-like entries, list the rest ---
  const extractTextFromZip = async (file: File): Promise<string> => {
    const bytes = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(bytes);
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    const entriesToRead = entries.slice(0, MAX_ZIP_ENTRIES_TO_READ);
    const parts: string[] = [];

    for (const entry of entriesToRead) {
      const lowerName = entry.name.toLowerCase();
      const isTextLike =
        lowerName.endsWith(".txt") ||
        TEXT_LIKE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

      if (isTextLike) {
        try {
          const content = (await entry.async("string")).trim();
          if (content) {
            parts.push(`--- ${entry.name} ---\n${content.slice(0, MAX_ZIP_ENTRY_CHARS)}`);
          }
        } catch {
          parts.push(`--- ${entry.name} --- (could not read as text)`);
        }
      } else {
        parts.push(`--- ${entry.name} --- (binary file, not extracted)`);
      }
    }

    if (entries.length > MAX_ZIP_ENTRIES_TO_READ) {
      parts.push(`... and ${entries.length - MAX_ZIP_ENTRIES_TO_READ} more file(s) not shown.`);
    }

    if (!parts.length) {
      return `Zip archive "${file.name}" appears to be empty.`;
    }

    return parts.join("\n\n");
  };

  // --- Universal fallback: never throw, always produce something ---
  const extractTextFromUnknownFile = async (file: File): Promise<string> => {
    return `[Attached file: ${file.name} (${file.type || "unknown type"}, ${(file.size / 1024).toFixed(1)} KB). This file type could not be converted to readable text automatically, but has been noted as an attachment.]`;
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    const lowerName = file.name.toLowerCase();

    // Plain text
    if (file.type.startsWith("text/") || lowerName.endsWith(".txt")) {
      return (await file.text()).trim();
    }

    // PDF
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

    // DOCX
    if (
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      lowerName.endsWith(".docx")
    ) {
      return extractTextFromDocx(file);
    }

    // Images
    // Images
    const isSupportedImage = SUPPORTED_IMAGE_TYPES.includes(file.type);
    if (isSupportedImage) {
  const [ocrText, visualDescription] = await Promise.all([
    extractTextFromImage(file),
    analyzeImageVisuals(file),
  ]);

  const parts: string[] = [];
  if (visualDescription) parts.push(`[Image description]:\n${visualDescription}`);
  if (ocrText) parts.push(`[Text found in image]:\n${ocrText}`);

  return parts.length > 0 ? parts.join("\n\n") : "";
}

    // Audio
    const isAudioFile =
      file.type.startsWith("audio/") ||
      AUDIO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (isAudioFile) {
      if (file.size > MAX_MEDIA_SIZE_BYTES) {
        throw new Error(`Audio file is too large. Maximum allowed size is ${MAX_MEDIA_SIZE_MB} MB.`);
      }
      const transcript = await transcribeMediaFile(file);
      return `[Audio transcript]:\n${transcript || "(No clear speech detected.)"}`;
    }

    // --- ENHANCED: VIDEO PROCESSING WITH DETAILED ANALYSIS ---
    const isVideoFile =
      file.type.startsWith("video/") ||
      VIDEO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (isVideoFile) {
      if (file.size > MAX_MEDIA_SIZE_BYTES) {
        throw new Error(`Video file is too large. Maximum allowed size is ${MAX_MEDIA_SIZE_MB} MB.`);
      }

      console.log(`🎬 Processing video: ${file.name}, Size: ${Math.round(file.size / 1024 / 1024)}MB`);

      // First, always try to get audio transcript
      console.log("🎤 Getting audio transcript...");
      let transcript = "";
      try {
        transcript = await transcribeMediaFile(file);
        console.log(`📝 Transcript received: ${transcript?.length || 0} chars`);
      } catch (err) {
        console.error("❌ Audio transcription failed:", err);
        transcript = "No audio transcript available.";
      }

      // Try to get detailed visual description
      console.log("🎞️ Extracting frames for detailed visual analysis...");
      let visualDescription = "";
      let frames: string[] = [];

      try {
        frames = await extractFramesFromVideo(file, 2);
        console.log(`🖼️ Extracted ${frames.length} frames`);

        if (frames.length > 0) {
          console.log("👁️ Requesting detailed visual analysis...");
          try {
            const result = await analyzeVideoVisuals(frames);
            if (result && result.length > 0 && 
                !result.includes("couldn't analyze") && 
                !result.includes("currently unavailable") &&
                !result.includes("Visual analysis is unavailable")) {
              visualDescription = result;
              console.log(`✅ Detailed visual description: ${visualDescription?.length || 0} chars`);
            } else {
              console.log("⚠️ No valid visual description received");
              visualDescription = "";
            }
          } catch (visionErr) {
            console.error("❌ Visual analysis failed:", visionErr);
            visualDescription = "";
          }
        } else {
          console.log("⚠️ No frames extracted from video");
          visualDescription = "";
        }
      } catch (frameErr) {
        console.error("❌ Frame extraction failed:", frameErr);
        visualDescription = "";
      }

      // Combine results - prioritize visual description if available
      let result = "";
      if (visualDescription && visualDescription.length > 0) {
        // Visual description is available - show it along with transcript
        result = `📹 **Video Analysis:**\n\n${visualDescription}\n\n---\n\n**Audio Transcript:**\n${transcript || "No speech detected."}`;
      } else {
        // Only audio transcript is available
        result = `📹 **Video Analysis:**\n\nI processed this video but could only extract the audio. Here's the transcript:\n\n**Audio Transcript:**\n${transcript || "No speech detected."}\n\n_Note: Visual analysis is currently unavailable. Please describe what you see in the video manually if you need visual details._`;
      }

      console.log("✅ Video processing complete");
      return result;
    }

    // Spreadsheets
    const isSpreadsheet =
      file.type.includes("spreadsheet") ||
      file.type === "text/csv" ||
      SPREADSHEET_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (isSpreadsheet) {
      return extractTextFromSpreadsheet(file);
    }

    // Zip archives
    const isZip =
      file.type === "application/zip" ||
      ZIP_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (isZip) {
      if (file.size > MAX_GENERIC_SIZE_BYTES) {
        throw new Error(`Zip file is too large. Maximum allowed size is ${MAX_GENERIC_SIZE_MB} MB.`);
      }
      return extractTextFromZip(file);
    }

    // Code/config/text-like files
    const isTextLikeFile = TEXT_LIKE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (isTextLikeFile) {
      return (await file.text()).trim();
    }

    // Universal fallback
    return extractTextFromUnknownFile(file);
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
        setStatusMessage(`Processing ${file.name}...`);
        const rawExtractedText = await extractTextFromFile(file);
        const extractedText = truncateExtractedText(rawExtractedText, file.name);
        if (!extractedText) {
          setStatusMessage(`No readable content found in ${file.name}.`);
          continue;
        }
        parsedAttachments.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          extractedText,
        });
      }

      if (!parsedAttachments.length) {
        setStatusMessage("No readable content was found in selected files.");
        return;
      }

      setAttachments((prev) => [...prev, ...parsedAttachments]);
      setStatusMessage(`${parsedAttachments.length} file(s) processed. Type your message and press Send.`);
    } catch (error) {
      console.error("❌ File processing error:", error);
      setStatusMessage(error instanceof Error ? error.message : "Failed to process file.");
    } finally {
      event.target.value = "";
      setIsProcessingFile(false);
      setTimeout(() => setStatusMessage(""), 2500);
    }
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items || disabled || isSending) return;

    const imageItem = Array.from(items).find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;

    event.preventDefault();

    const file = imageItem.getAsFile();
    if (!file) return;

    if (attachments.length >= MAX_FILES_PER_UPLOAD) {
      setStatusMessage(`You can keep only ${MAX_FILES_PER_UPLOAD} attachments before sending.`);
      return;
    }

    setIsProcessingFile(true);
    setStatusMessage("Extracting text from pasted screenshot...");

    try {
      const rawExtractedText = await extractTextFromImage(file);
      const extractedText = truncateExtractedText(rawExtractedText, "pasted-screenshot.png");
      if (!extractedText) {
        setStatusMessage("No readable text found in pasted image.");
        return;
      }

      setAttachments((prev) => [
        ...prev,
        { id: crypto.randomUUID(), fileName: "Pasted screenshot", extractedText },
      ]);
      setStatusMessage("Screenshot pasted and parsed. Type your message and press Send.");
    } catch (error) {
      console.error("❌ Clipboard image processing error:", error);
      setStatusMessage(error instanceof Error ? error.message : "Failed to process pasted image.");
    } finally {
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
                {item.fileName.match(/\.(mp4|mov|avi|mkv|webm)$/i) && (
                  <span className="text-[10px] text-muted-foreground">(video)</span>
                )}
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
          {attachments.some(item => item.fileName.match(/\.(mp4|mov|avi|mkv|webm)$/i)) && (
            <p className="text-xs text-muted-foreground mt-1">
              💡 Ask about "this video" or "what is happening" to get a detailed description
            </p>
          )}
        </div>
      )}
      <div className="flex items-end gap-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
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
          title="Upload any file"
        >
          {isProcessingFile ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
        </button>
        
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Type a message... (or paste a screenshot with Ctrl+V)"
          disabled={disabled || isSending || isProcessingFile}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
          style={{
            minHeight: '44px',
            maxHeight: '200px',
            overflow: 'hidden',
            lineHeight: '1.5',
          }}
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