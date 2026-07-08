# MindBridge (web)

A Next.js port of MindBridge, built to deploy on Vercel (the original `App.py`
Streamlit version can't run on Vercel — it needs a persistent WebSocket
server, which Vercel's serverless functions don't support).

## Features

- Streaming responses (tokens appear as Gemini generates them)
- Emotion detection per message, visualized as an "emotional weather" gauge
- Independent keyword-based crisis detection as a safety net alongside the
  LLM-based detector (see `lib/safety.ts`)
- Basic in-memory rate limiting per IP (`lib/rateLimit.ts` — note its
  documented limitations for production use)
- Session persistence via `sessionStorage` (survives a refresh, clears when
  the tab closes)
- A small valence sparkline showing emotional trend across the conversation
- Unit tests for the pure emotion-parsing and safety logic

## Local development

```bash
cd webapp
npm install
cp .env.example .env.local   # then add your real GEMINI_API_KEY
npm run dev
```

Open http://localhost:3000.

## Running tests

```bash
npm test
```


## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In Vercel, import the `Apurba-06/MindBridge` repo as a new project.
3. Set the **Root Directory** to `webapp`.
4. Add an environment variable: `GEMINI_API_KEY` = your real key.
5. Deploy.

Vercel auto-detects Next.js, so no other config is needed.
