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

### 1. Prerequisites
- Node.js (v20+)
- Firebase CLI (`npm install -g firebase-tools`)
- A valid API Key (Groq or Gemini)

### 2. Backend Setup
Navigate to the `/functions` directory and create a `.env` file:
```env
GROQ_API_KEY=your_api_key_here

# Install Frontend dependencies (Root folder)
npm install

# Install Backend dependencies (Functions folder)
cd functions
npm install

4. Running Locally (Integration Mode)
To run the full project locally using the Firebase Emulator:

Terminal 1 (Backend Emulators):

Bash
firebase emulators:start
Terminal 2 (Frontend UI):

Bash
npm run dev