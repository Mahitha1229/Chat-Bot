import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import {
  Bot,
  User,
  Download,
  FileText,
  FileSpreadsheet,
  FileType,
  Presentation,
  ChevronDown,
  FileCode,
  Image as ImageIcon,
} from "lucide-react";
import {
  extractCodeBlocksAsNotebook,
  downloadNotebook,
  extractAllCodeBlocks,
  downloadTextFile,
  downloadAsWord,
  downloadAsPdf,
  extractMarkdownTables,
  downloadAsExcel,
  extractSlidesFromContent,
  downloadAsPptx,
  downloadAsPlainText,
  downloadAsMarkdown,
  extractImageUrls,
  downloadImageFromUrl,
} from "@/lib/notebookExport";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatMessageProps {
  message: Message;
}

const MIN_CONTENT_LENGTH_FOR_EXPORT = 60;

const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === "user";
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const codeBlocks = !isUser ? extractAllCodeBlocks(message.content) : [];
  const hasPythonCode = codeBlocks.some((b) => b.extension === "py");
  const { notebook } = hasPythonCode
    ? extractCodeBlocksAsNotebook(message.content)
    : { notebook: {} };
  const tables = !isUser ? extractMarkdownTables(message.content) : [];
  const slides = !isUser ? extractSlidesFromContent(message.content) : [];
  const hasSlides = slides.length >= 1;
  const imageUrls = !isUser ? extractImageUrls(message.content) : [];

  const isSubstantiveText = !isUser && message.content.trim().length >= MIN_CONTENT_LENGTH_FOR_EXPORT;
  const showToolbar =
    !isUser &&
    (codeBlocks.length > 0 || tables.length > 0 || imageUrls.length > 0 || isSubstantiveText);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cn("flex w-full mb-5 gap-2.5", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-4.5 w-4.5" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-3 transition-all duration-200",
          isUser
            ? "bg-gradient-to-br from-primary to-primary/90 text-chat-user-foreground rounded-br-md shadow-md shadow-primary/20"
            : "bg-chat-bot text-chat-bot-foreground rounded-bl-md shadow-sm border border-border/50"
        )}
      >
        <div
          className={cn(
            "prose prose-sm max-w-none prose-p:leading-relaxed prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
            isUser ? "prose-invert" : "dark:prose-invert"
          )}
        >
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>

        {showToolbar && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {/* Specific, content-detected exports */}
            {codeBlocks.map((block, i) => (
              <button
                key={block.id}
                onClick={() =>
                  downloadTextFile(block.code, `generated_${i + 1}.${block.extension}`, "text/plain")
                }
                className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <Download className="h-3 w-3" />
                .{block.extension}
              </button>
            ))}

            {hasPythonCode && (
              <button
                onClick={() => downloadNotebook(notebook, "generated_notebook.ipynb")}
                className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <FileCode className="h-3 w-3" />
                .ipynb
              </button>
            )}

            {tables.map((table, i) => (
              <button
                key={`table-${i}`}
                onClick={() => downloadAsExcel(table, `table_${i + 1}.xlsx`)}
                className="flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/5 px-2.5 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 transition-colors hover:bg-green-500/10"
              >
                <FileSpreadsheet className="h-3 w-3" />
                Table as .xlsx
              </button>
            ))}

            {hasSlides && (
              <button
                onClick={() => downloadAsPptx(slides, "presentation.pptx")}
                className="flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/5 px-2.5 py-1.5 text-xs font-medium text-orange-700 dark:text-orange-400 transition-colors hover:bg-orange-500/10"
              >
                <Presentation className="h-3 w-3" />
                .pptx
              </button>
            )}

            {imageUrls.map((url, i) => (
              <button
                key={`image-${i}`}
                onClick={() => downloadImageFromUrl(url, `generated_image_${i + 1}.jpg`)}
                className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/5 px-2.5 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 transition-colors hover:bg-purple-500/10"
              >
                <ImageIcon className="h-3 w-3" />
                Download Image
              </button>
            ))}

            {/* Generic "Download as..." menu, available on any substantive reply */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Download className="h-3 w-3" />
                Download as
                <ChevronDown className="h-3 w-3" />
              </button>

              {isMenuOpen && (
                <div className="absolute bottom-full mb-1 left-0 z-10 min-w-[140px] rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                  <button
                    onClick={() => {
                      downloadAsWord(message.content, "response.docx");
                      setIsMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-left hover:bg-secondary transition-colors"
                  >
                    <FileText className="h-3 w-3 text-blue-600" /> Word (.docx)
                  </button>
                  <button
                    onClick={() => {
                      downloadAsPdf(message.content, "response.pdf");
                      setIsMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-left hover:bg-secondary transition-colors"
                  >
                    <FileType className="h-3 w-3 text-red-600" /> PDF (.pdf)
                  </button>
                  <button
                    onClick={() => {
                      downloadAsPlainText(message.content, "response.txt");
                      setIsMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-left hover:bg-secondary transition-colors"
                  >
                    <FileText className="h-3 w-3 text-muted-foreground" /> Plain Text (.txt)
                  </button>
                  <button
                    onClick={() => {
                      downloadAsMarkdown(message.content, "response.md");
                      setIsMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-left hover:bg-secondary transition-colors"
                  >
                    <FileText className="h-3 w-3 text-muted-foreground" /> Markdown (.md)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <span
          className={cn(
            "block text-[11px] mt-1.5 opacity-60",
            isUser ? "text-right" : "text-left"
          )}
        >
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <User className="h-4.5 w-4.5" />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;