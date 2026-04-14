# 🤖 LLM-Powered Cloud Chatbot

Full-stack chatbot built with React + Firebase Functions + Groq.  
Includes chat UI, LLM integration, cloud backend, and conversation logging.

## 👥 Team Scope

| Member | Focus | Deliverable |
| :--- | :--- | :--- |
| Member 1 | Frontend UI | Chat interface + API integration |
| Member 2 | LLM Integration | Prompt + Groq response handling |
| Member 3 | Cloud Backend | Firebase Function endpoint |
| Member 4 | Logging & DB | Firestore/integration log viewer |

## 🧰 Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind
- Backend: Firebase Cloud Functions (Node.js 20)
- Database: Cloud Firestore
- LLM: Groq API

## 🚀 How To Run (Local)

### 1) Prerequisites

- Node.js `20.x`
- Firebase CLI installed globally:
  ```bash
  npm install -g firebase-tools
  ```
- Firebase login:
  ```bash
  firebase login
  ```
- A valid Groq API key

### 2) Install dependencies

From project root:

```bash
npm install
cd functions
npm install --legacy-peer-deps
cd ..
```

### 3) Create environment files

Create `functions/.env`:

```env
GROQ_API_KEY=your_groq_api_key_here
```

Create root `.env`:

```env
VITE_CHAT_API_URL=http://127.0.0.1:5001/cc-llm-chatbot/us-central1/chat
VITE_LOGS_API_URL=http://127.0.0.1:5001/cc-llm-chatbot/us-central1/chat
```

### 4) Start backend (Terminal 1)

```bash
nvm use 20
firebase emulators:start
```

### 5) Start frontend (Terminal 2)

```bash
npm run dev
```

Open the app at: `http://localhost:8080`

## ✅ Quick Verification

1. Send a chat message.
2. Confirm AI response appears.
3. Open **View Logs** and verify log entries are listed.

## 🔌 API Contract

- `POST /chat`
  - Request body: `{ messages: [{ role, content }], userId }`
  - Response: `{ reply }`
- `GET /chat`
  - Response: `{ logs: [...] }`

## 📝 Notes

- If Firestore is not enabled, backend falls back to in-memory logs for demo continuity.
- To deploy functions:
  ```bash
  firebase deploy --only functions
  ```