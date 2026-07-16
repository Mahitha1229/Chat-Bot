# 🤖 LLM-Powered Cloud Chatbot

A full-stack AI chatbot built using **React**, **Firebase Cloud Functions**, **Cloud Firestore**, and the **Groq API**. The application provides a modern chat interface, cloud-based backend, LLM integration, and conversation logging.

---

## 👥 Team Scope

| Member | Responsibility | Deliverable |
| :------ | :------------- | :---------- |
| Member 1 | Frontend UI | Chat interface & API integration |
| Member 2 | LLM Integration | Prompt engineering & Groq response handling |
| Member 3 | Cloud Backend | Firebase Cloud Functions |
| Member 4 | Logging & Database | Firestore integration & Log Viewer |

---

## 🧰 Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Backend:** Firebase Cloud Functions (Node.js 20)
- **Database:** Cloud Firestore
- **LLM:** Groq API

---

# 🚀 Getting Started

## 1. Prerequisites

Make sure you have the following installed:

- Node.js **20.x**
- npm
- Firebase CLI

Install Firebase CLI:

```bash
npm install -g firebase-tools
```

Login to Firebase:

```bash
firebase login
```

---

## 2. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd CC_LLM-powered-chatbot-on-cloud
```

---

## 3. Install Dependencies

From the project root:

```bash
npm install
```

Install Firebase Function dependencies:

```bash
cd functions
npm install --legacy-peer-deps
cd ..
```

---

## 4. Configure Environment Variables

### Backend Environment

Copy:

```text
functions/.env.example
```

to

```text
functions/.env
```

Replace the placeholder values with your own API keys.

Example:

```env
GROQ_API_KEY=your_groq_api_key_here
YOUTUBE_API_KEY=your_youtube_api_key_here
VITE_POLLINATIONS_API_KEY=your_pollinations_api_key_here
```

### Frontend Environment

Copy:

```text
.env.example
```

to

```text
.env
```

Example:

```env
VITE_CHAT_API_URL=http://127.0.0.1:5001/cc-llm-chatbot/us-central1/chat
VITE_LOGS_API_URL=http://127.0.0.1:5001/cc-llm-chatbot/us-central1/chat
```

> **Note:** Never commit `.env` or `functions/.env` to GitHub. They contain your personal API keys.

---

## 5. Start Firebase Emulator

Open a terminal and run:

```bash
firebase emulators:start
```

---

## 6. Start the Frontend

Open another terminal:

```bash
npm run dev
```

The application will be available at:

```
http://localhost:8080
```

---

# ✅ Verify the Application

1. Sign in (if authentication is enabled).
2. Send a chat message.
3. Verify the AI generates a response.
4. Open **View Logs**.
5. Confirm conversation logs are stored correctly.

---

# 🔌 API Endpoints

### POST `/chat`

Request

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    }
  ],
  "userId": "user123"
}
```

Response

```json
{
  "reply": "Hello! How can I help you today?"
}
```

---

### GET `/chat`

Response

```json
{
  "logs": []
}
```

---

# 📂 Project Structure

```
.
├── src/
├── public/
├── functions/
│   ├── .env.example
│   ├── index.js
│   ├── chatService.js
│   └── package.json
├── .env.example
├── firebase.json
├── firestore.rules
├── package.json
└── README.md
```

---

# 📝 Notes

- `.env` and `functions/.env` are intentionally excluded from Git using `.gitignore`.
- Use your own API keys when running the project.
- Firestore falls back to in-memory logs if it is unavailable.
- This project is intended for educational and demonstration purposes.

---

# 🚀 Deployment

Deploy Firebase Functions:

```bash
firebase deploy --only functions
```

To deploy Firebase Hosting:

```bash
firebase deploy --only hosting
```
