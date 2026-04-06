# Member 3 - Cloud Backend Setup (Firebase + Groq)

This setup gives you a live backend endpoint for the chat app:
- Endpoint: `https://us-central1-<project-id>.cloudfunctions.net/chat`
- Function source: `functions/index.js`

## 1) Install tools

- Install Firebase CLI (once):
  - `npm install -g firebase-tools`
- Login:
  - `firebase login`

## 2) Configure project id

- Open `.firebaserc`
- Replace `your-project-id` with your real Firebase/GCP project id.

## 3) Configure function secrets/env

- In `functions/`:
  - Copy `functions/.env.example` to `functions/.env`
  - Set `GROQ_API_KEY`
  - Optional: change `ALLOWED_ORIGIN` and `MODEL_NAME`

## 4) Install backend dependencies

From project root:
- `cd functions`
- `npm install`

## 5) Deploy cloud function

From project root:
- `firebase deploy --only functions`

After deploy, copy the URL printed for `chat`.

## 6) Connect frontend (Member 1 integration)

- Copy `.env.example` to `.env` in project root.
- Set:
  - `VITE_CHAT_API_URL=https://us-central1-<project-id>.cloudfunctions.net/chat`
- Restart frontend dev server.

## Request format expected by function

```json
{
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi!" }
  ]
}
```

## Notes for Member 4 integration

- Keep this same cloud function as the integration point.
- Member 4 can add Firestore/cloud logging inside `functions/index.js` in the success/error branches without changing frontend API contract.
