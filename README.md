# 🤖 LLM-Powered Cloud Chatbot

A full-stack AI chatbot application integrated with **React**, **Firebase Functions**, and **Groq/Gemini LLM**. This project features a serverless architecture with automated conversation logging to Firestore.

---

## 👥 Team Roles & Responsibilities

| Member | Focus | Key Deliverables |
| :--- | :--- | :--- |
| **Member 1** | **Frontend UI** | React Chat Interface, Message Components, & API integration. |
| **Member 2** | **LLM Integration** | Prompt engineering, LLM Service logic, & API response parsing. |
| **Member 3** | **Cloud Backend** | Firebase Functions (v2) setup, Security, & CORS management. |
| **Member 4** | **Logging & DB** | Firestore Schema design & automated conversation logging. |

---

## 🛠️ Tech Stack

- **Frontend:** React 18 (TypeScript), Vite, Tailwind CSS, Lucide Icons.
- **Backend:** Node.js, Firebase Cloud Functions (v2).
- **Database:** Google Cloud Firestore (NoSQL).
- **AI Engine:** Groq SDK / Gemini API.
- **Tools:** Firebase CLI, NPM.

---

## 🚀 Getting Started

### 1) Prerequisites
- Node.js `20.x`
- Firebase CLI: `npm install -g firebase-tools`
- Groq API key

### 2) Install Dependencies
From project root:

```bash
npm install
cd functions
npm install --legacy-peer-deps
cd ..
```

### 3) Configure Environment Variables
Create `functions/.env`:

```env
GROQ_API_KEY=your_groq_api_key_here
```

Create root `.env`:

```env
VITE_CHAT_API_URL=http://127.0.0.1:5001/cc-llm-chatbot/us-central1/chat
VITE_LOGS_API_URL=http://127.0.0.1:5001/cc-llm-chatbot/us-central1/chat
```

### 4) Run Locally (Integration Mode)
Terminal 1 (backend emulator):

```bash
nvm use 20
firebase emulators:start
```

Terminal 2 (frontend):

```bash
npm run dev
```

Open `http://localhost:8080`.

### 5) API Contract
- `POST /chat`: send `{ messages, userId }` and receive `{ reply }`.
- `GET /chat`: returns `{ logs }` for Member 4 log viewer.

### 6) Notes
- If Firestore API is disabled, logs still work in local fallback memory mode.
- For cloud deploy: `firebase deploy --only functions`.