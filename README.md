# CC LLM-Powered Chatbot on Cloud

A full-stack, multimodal AI chatbot built with React and TypeScript on the frontend and Firebase Cloud Functions with the Groq API on the backend. It supports voice input, image and video understanding, multi-format document export, and per-user rate-limited usage tracking, deployed serverlessly on Firebase.

## Live Demo
🌐 **Application:** https://mahitha-cc-chatbot.web.app

> Built as a team project. Members handled frontend, LLM logic, and backend/infrastructure respectively — see Team section below.

---

## Features

### Core Chat
- Real-time chat interface powered by the Groq LLM API, with a system prompt tuned for clear, concise answers and correctly formatted resource links
- Model switcher between `llama-3.1-8b-instant` (faster) and `llama-3.3-70b-versatile` (higher quality)
- Per-user chat history synced to Firestore, with an in-memory fallback if Firestore is unavailable
- Rate limiting with configurable per-minute and per-day request caps per user, reflected in a live usage indicator in the UI
- Markdown-rendered responses (`react-markdown` with GFM support for tables, task lists, etc.)
- Light and dark theme toggle
- Toast notifications and suggestion chips for guided conversations

### Multimodal Input
- Audio transcription: record or upload audio, transcribed via Groq Whisper (`whisper-large-v3`)
- Image analysis: upload an image and receive a detailed visual description via a Llama 4 Scout vision model
- Video frame analysis: extracts and analyzes up to five sequential frames from a video to describe on-screen content
- Document ingestion: PDF (`pdfjs-dist`), Word (`mammoth`), and scanned images (`tesseract.js` OCR); extracted content is injected as hidden context for the LLM
- YouTube search: retrieves relevant video results via the YouTube Data API

### Export Engine
Chat responses are not limited to plain text. A dedicated export module (`src/lib/notebookExport.ts`) parses each response and generates the appropriate file on demand:
- Jupyter Notebook (.ipynb): fenced code blocks and surrounding text are split into valid code/markdown cells (nbformat 4)
- Individual code files: fenced code blocks are detected and mapped to the correct file extension across 20+ languages (Python, JS/TS, Java, C/C++, Go, Rust, SQL, etc.)
- Word (.docx) via `docx`
- PDF via `jspdf`, auto-wrapped to page width
- Excel (.xlsx) via `xlsx`, with automatic detection and parsing of markdown tables
- PowerPoint (.pptx) via `pptxgenjs`, parsing `Slide N: <title>` headers and bullet lines into styled slides, with placeholder lines such as `[Insert Image]` filtered out
- Plain text and markdown direct download
- Generated image download: detects markdown image URLs in a response (e.g. from image generation) and allows the user to save the image

### Authentication and Infrastructure
- Firebase Authentication for user accounts, gating chat history and per-user rate limits
- Firestore for persisting chat logs, request/response metadata, and errors
- Deployed as Firebase Cloud Functions (2nd gen), region `us-central1`
- Local development mirrors production via the Firebase Emulator Suite

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix primitives) |
| Routing / State | React Router, TanStack Query, React Hook Form with Zod |
| Backend | Firebase Cloud Functions (Node 20), Express (local dev server) |
| LLM | Groq API (`llama-3.1-8b-instant`, `llama-3.3-70b-versatile`, Llama 4 Scout for vision, Whisper large-v3 for audio) |
| Database / Auth | Firebase Firestore, Firebase Authentication |
| File Handling | `docx`, `jspdf`, `pptxgenjs`, `xlsx`, `jszip`, `mammoth`, `pdfjs-dist`, `tesseract.js` |
| Testing | Vitest, Playwright, Testing Library |
| Tooling | ESLint, PostCSS, Concurrently |

---

## Application Architecture

`App.tsx` is intentionally minimal: a single-page chat experience (route `/`, with a catch-all 404) wrapped in a provider stack:

```
ThemeProvider (system-aware dark/light)
  -> QueryClientProvider (TanStack Query)
       -> AuthProvider (Firebase Auth context)
            -> TooltipProvider
                 -> Toaster + Sonner (notifications)
                      -> BrowserRouter -> Index / NotFound
```

All chat functionality — window, input, model selection, export, usage tracking — lives inside the `Index` page, composed from the components listed below.

---

## Project Structure

```
CC_LLM-powered-chatbot-on-cloud/
├── functions/                  # Firebase Cloud Functions (backend)
│   ├── index.js                 # All HTTP endpoints (chat, transcribe, analyze, search)
│   ├── chatService.js           # Groq chat completion wrapper and system prompt
│   └── .env                     # GROQ_API_KEY, rate limit config (not committed)
├── src/
│   ├── components/
│   │   ├── ChatWindow.tsx
│   │   ├── ChatInput.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── ModelSelector.tsx
│   │   ├── UsageIndicator.tsx
│   │   ├── ThemeToggle.tsx
│   │   ├── LogViewer.tsx
│   │   ├── Login.tsx
│   │   └── ui/                  # shadcn/ui components
│   ├── context/
│   │   └── AuthContext.tsx      # Firebase Auth state/provider
│   ├── lib/
│   │   ├── firebase.ts          # Firebase app/config init
│   │   ├── notebookExport.ts    # Export engine: .ipynb, code files, docx, pdf, xlsx, pptx, images
│   │   ├── soundEffects.ts
│   │   └── utils.ts
│   ├── pages/
│   │   ├── Index.tsx
│   │   └── NotFound.tsx
│   └── App.tsx
├── server.cjs                   # Local Express dev server
├── chatloop.cjs / test.cjs      # CLI scripts for direct LLM testing
├── firebase.json / .firebaserc  # Firebase project config
├── firestore.rules / firestore.indexes.json
└── MEMBER3_BACKEND_SETUP.md     # Backend setup notes
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- A Firebase project with Firestore and Authentication enabled
- A Groq API key
- Optional: a YouTube Data API key, for video search

### 1. Clone and Install
```bash
git clone <your-repo-url>
cd CC_LLM-powered-chatbot-on-cloud
npm install
cd functions && npm install && cd ..
```

### 2. Environment Variables
Create `functions/.env`:
```env
GROQ_API_KEY=your_groq_api_key
YOUTUBE_API_KEY=your_youtube_api_key   # optional
RATE_LIMIT_RPM=25                      # optional, defaults to 25
RATE_LIMIT_RPD=500                     # optional, defaults to 500
```

Create a root `.env` for the frontend with your Firebase web config (see `src/lib/firebase.ts`).

### 3. Run Locally

Option A — full stack with Firebase emulators:
```bash
npm run start:full
```
Runs the local Express backend and the Vite dev server concurrently.

Option B — functions emulator only:
```bash
cd functions
npm run serve
```
Then, in another terminal:
```bash
npm run dev
```

### 4. Test the LLM Directly (No UI)
```bash
npm run llm:test        # single test call
npm run llm:chatloop    # interactive CLI chat loop
```

### 5. Run Tests
```bash
npm run test            # Vitest unit tests
npx playwright test     # End-to-end tests
```

### 6. Deploy
```bash
cd functions
npm run deploy           # deploys Cloud Functions
```
Deploy the frontend with `firebase deploy --only hosting` after running `npm run build`.

---

## API Endpoints (Cloud Functions)

| Endpoint | Method | Description |
|---|---|---|
| `/chat` | POST | Send a message array, receive an LLM reply. Supports `model`, `userId`, and `hiddenContext` (injected file context) |
| `/chat` | GET | Retrieve recent chat logs for a user |
| `/getUsage` | GET | Check current rate-limit usage without consuming a request |
| `/transcribeAudio` | POST | Upload audio (multipart), returns transcribed text |
| `/analyzeImage` | POST | Send a base64 image data URL, returns a visual description |
| `/analyzeVideoFrames` | POST | Send an array of base64 frame data URLs (max 5), returns a scene description |
| `/searchYoutube` | GET / POST | Search YouTube by query string, returns the top 5 video results |

All endpoints are CORS-enabled and deployed to `us-central1`.

---

<!--
## Team

This project was built collaboratively:

| Member | Focus Area |
|---|---|
| Member 1 | Frontend (React UI, components, UX) |
| Member 2 | LLM integration logic (chat service, prompt design) |
| Member 3 | Backend and infrastructure (Cloud Functions, Firebase, deployment) |

---

## Notes

- Rate limiting is currently in-memory per function instance. This is sufficient for demo or development use; for production scale, consider moving usage tracking to Firestore or Redis.
- The system prompt is designed to prevent the LLM from inventing fake download links or file placeholders; the application layer handles real file generation from structured LLM output.
- Free-tier Groq and Firebase usage should comfortably support a portfolio or demo deployment at no cost.

---

## License

*(Add license information here — MIT is a common choice for portfolio projects.)*-->
