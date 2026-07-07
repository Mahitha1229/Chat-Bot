import { Document, Packer, Paragraph, TextRun } from "docx";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import pptxgen from "pptxgenjs";

// ============================================================
// Jupyter Notebook (.ipynb) export
// ============================================================

interface NotebookCell {
  cell_type: "code" | "markdown";
  source: string[];
}

function buildNotebookJson(cells: NotebookCell[]) {
  return {
    cells: cells.map((cell) => ({
      cell_type: cell.cell_type,
      metadata: {},
      source: cell.source,
      ...(cell.cell_type === "code" ? { execution_count: null, outputs: [] } : {}),
    })),
    metadata: {
      kernelspec: {
        display_name: "Python 3",
        language: "python",
        name: "python3",
      },
      language_info: {
        name: "python",
        version: "3.10",
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

// Extracts fenced code blocks (```python ... ``` or ``` ... ```) and any
// surrounding text, and turns them into notebook cells.
export function extractCodeBlocksAsNotebook(markdownText: string): { hasCode: boolean; notebook: object } {
  const codeBlockRegex = /```(?:python|py)?\n([\s\S]*?)```/g;
  const cells: NotebookCell[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let hasCode = false;

  while ((match = codeBlockRegex.exec(markdownText)) !== null) {
    const textBefore = markdownText.slice(lastIndex, match.index).trim();
    if (textBefore) {
      cells.push({ cell_type: "markdown", source: textBefore.split("\n").map((l) => l + "\n") });
    }

    const code = match[1].replace(/\n$/, "");
    cells.push({ cell_type: "code", source: code.split("\n").map((l) => l + "\n") });
    hasCode = true;
    lastIndex = codeBlockRegex.lastIndex;
  }

  const remainingText = markdownText.slice(lastIndex).trim();
  if (remainingText) {
    cells.push({ cell_type: "markdown", source: remainingText.split("\n").map((l) => l + "\n") });
  }

  return { hasCode, notebook: buildNotebookJson(cells) };
}

export function downloadNotebook(notebook: object, filename = "generated_notebook.ipynb") {
  const blob = new Blob([JSON.stringify(notebook, null, 2)], { type: "application/x-ipynb+json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================
// Generic code block detection + plain file export
// ============================================================

const LANGUAGE_TO_EXTENSION: Record<string, string> = {
  python: "py",
  py: "py",
  javascript: "js",
  js: "js",
  typescript: "ts",
  ts: "ts",
  jsx: "jsx",
  tsx: "tsx",
  java: "java",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  csharp: "cs",
  "c#": "cs",
  html: "html",
  css: "css",
  json: "json",
  sql: "sql",
  bash: "sh",
  shell: "sh",
  sh: "sh",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  markdown: "md",
  md: "md",
  csv: "csv",
  go: "go",
  rust: "rs",
  ruby: "rb",
  php: "php",
  r: "r",
  txt: "txt",
  text: "txt",
};

export interface DetectedCodeBlock {
  id: string;
  language: string;
  extension: string;
  code: string;
}

export function extractAllCodeBlocks(markdownText: string): DetectedCodeBlock[] {
  const codeBlockRegex = /```([a-zA-Z0-9+#]*)\n([\s\S]*?)```/g;
  const blocks: DetectedCodeBlock[] = [];
  let match: RegExpExecArray | null;
  let counter = 0;

  while ((match = codeBlockRegex.exec(markdownText)) !== null) {
    const rawLanguage = (match[1] || "").toLowerCase().trim();
    const code = match[2].replace(/\n$/, "");
    if (!code.trim()) continue;

    const extension = LANGUAGE_TO_EXTENSION[rawLanguage] || "txt";
    blocks.push({
      id: `block-${counter}`,
      language: rawLanguage || "text",
      extension,
      code,
    });
    counter += 1;
  }

  return blocks;
}

export function downloadTextFile(content: string, filename: string, mimeType = "text/plain") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================
// Word (.docx) export
// ============================================================

export async function downloadAsWord(content: string, filename = "response.docx") {
  const paragraphs = content.split("\n").map(
    (line) =>
      new Paragraph({
        children: [new TextRun(line || " ")],
      })
  );

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================
// PDF export
// ============================================================

export function downloadAsPdf(content: string, filename = "response.pdf") {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth() - 20;
  const lines = doc.splitTextToSize(content, pageWidth);
  doc.setFontSize(11);
  doc.text(lines, 10, 15);
  doc.save(filename);
}

// ============================================================
// Excel (.xlsx) export — detects markdown tables in AI responses
// ============================================================

export function extractMarkdownTables(content: string): string[][][] {
  const tableRegex = /(\|.+\|\n\|[-:| ]+\|\n(?:\|.+\|\n?)+)/g;
  const tables: string[][][] = [];
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(content)) !== null) {
    const rows = match[1]
      .trim()
      .split("\n")
      .filter((_, i) => i !== 1); // drop the "---|---" separator row

    const parsedRows = rows.map((row) =>
      row
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
    );

    tables.push(parsedRows);
  }

  return tables;
}

export function downloadAsExcel(table: string[][], filename = "response.xlsx") {
  const worksheet = XLSX.utils.aoa_to_sheet(table);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, filename);
}
// ============================================================
// PowerPoint (.pptx) export — detects "Slide N: ..." structured content
// ============================================================

interface SlideContent {
  title: string;
  bullets: string[];
}

const PLACEHOLDER_LINE_REGEX = /^\[.*\]$/;

export function extractSlidesFromContent(content: string): SlideContent[] {
  const lines = content.split("\n");
  const slides: SlideContent[] = [];
  let current: SlideContent | null = null;

  const slideHeaderRegex = /^(?:\*\*)?Slide\s+\d+[:.]?\s*(.*?)(?:\*\*)?$/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headerMatch = line.match(slideHeaderRegex);
    if (headerMatch) {
      if (current) slides.push(current);
      current = { title: headerMatch[1].trim() || "Untitled Slide", bullets: [] };
      continue;
    }

    if (!current) continue;
    if (PLACEHOLDER_LINE_REGEX.test(line)) continue; // skip "[Insert Image]" etc.

    const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
    const cleanText = (bulletMatch ? bulletMatch[1] : line).replace(/\*\*/g, "").trim();

    if (cleanText) current.bullets.push(cleanText);
  }

  if (current) slides.push(current);
  return slides;
}

export async function downloadAsPptx(slides: SlideContent[], filename = "presentation.pptx") {
  const pres = new pptxgen();

  slides.forEach((slide) => {
    const pptxSlide = pres.addSlide();
    pptxSlide.addText(slide.title, {
      x: 0.5,
      y: 0.4,
      w: 9,
      h: 1,
      fontSize: 28,
      bold: true,
      color: "1F2937",
    });

    if (slide.bullets.length > 0) {
      pptxSlide.addText(
        slide.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        { x: 0.7, y: 1.5, w: 8.5, h: 4.5, fontSize: 16, color: "374151" }
      );
    }
  });

  await pres.writeFile({ fileName: filename });
}

// ============================================================
// Generic plain-text-style exports (.txt / .md / .json)
// ============================================================

export function downloadAsPlainText(content: string, filename = "response.txt") {
  downloadTextFile(content, filename, "text/plain");
}

export function downloadAsMarkdown(content: string, filename = "response.md") {
  downloadTextFile(content, filename, "text/markdown");
}
export function extractImageUrls(content: string): string[] {
  const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
  const urls: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = imageRegex.exec(content)) !== null) {
    urls.push(match[1]);
  }

  return urls;
}

export async function downloadImageFromUrl(imageUrl: string, filename = "generated_image.jpg") {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}