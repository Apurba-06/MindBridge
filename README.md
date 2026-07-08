# MindBridge
Emotionally Intelligent Conversational AI

**Live app:** https://mind-bridge-zuih.vercel.app

This repo has two implementations:

- **`webapp/`** — Next.js app, deployed on Vercel (the one running at the link above). Streams responses, includes a keyword-based crisis-detection safety net, basic rate limiting, session persistence, and a small unit test suite. This is the actively maintained version — start here.
- **`App.py` / `core.py`** — the original Streamlit prototype. Kept for local experimentation, but Streamlit can't be deployed on Vercel (it needs a persistent WebSocket server, not serverless functions), so it isn't part of the deployed product. Run it locally with:
  ```bash
  pip install -r requirements.txt
  cp .env.example .env   # add your GEMINI_API_KEY
  streamlit run App.py
  ```

See `webapp/README.md` for details on running or deploying the Next.js version.
