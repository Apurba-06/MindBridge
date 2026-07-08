"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { Emotion } from "@/lib/emotion";

type Message = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "mindbridge:session:v1";

function EmotionGauge({ emotion }: { emotion: Emotion | null }) {
  const valence = emotion?.valence ?? 0;
  const arousal = emotion?.arousal ?? 0;
  const urgency = emotion?.urgency ?? 1;

  const cx = 100;
  const cy = 104;
  const r = 78;

  const clampedValence = Math.max(-1, Math.min(1, valence));
  const angleDeg = 180 - ((clampedValence + 1) / 2) * 180;
  const rad = (angleDeg * Math.PI) / 180;
  const needleLen = r - 10;
  const tipX = cx + needleLen * Math.cos(rad);
  const tipY = cy - needleLen * Math.sin(rad);

  const arousalMag = Math.max(0, Math.min(1, Math.abs(arousal)));
  const pulseDuration = 2.6 - arousalMag * 1.8;

  const isCrisis = urgency >= 4;

  return (
    <div className="gauge-wrap">
      <div
        className="gauge-halo"
        style={{
          animationDuration: `${pulseDuration}s`,
          opacity: 0.18 + arousalMag * 0.28,
          background: isCrisis
            ? "radial-gradient(circle, var(--coral-soft), transparent 70%)"
            : "radial-gradient(circle, var(--teal-soft), transparent 70%)",
        }}
      />
      <svg viewBox="0 0 200 130" className="gauge-svg">
        <defs>
          <linearGradient id="arcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--coral)" />
            <stop offset="50%" stopColor="var(--mist-dim)" />
            <stop offset="100%" stopColor="var(--teal)" />
          </linearGradient>
        </defs>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="url(#arcGradient)"
          strokeWidth="10"
          strokeLinecap="round"
          opacity={0.85}
        />
        <line
          x1={cx}
          y1={cy}
          x2={tipX}
          y2={tipY}
          stroke={isCrisis ? "var(--coral)" : "var(--ink)"}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="5" fill={isCrisis ? "var(--coral)" : "var(--ink)"} />
      </svg>
      <div className="gauge-labels">
        <span>stormy</span>
        <span>clear</span>
      </div>
    </div>
  );
}

function UrgencyTicks({ urgency }: { urgency: number }) {
  return (
    <div className="urgency-ticks" aria-label={`Urgency ${urgency} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="tick"
          style={{
            background: i <= urgency ? (urgency >= 4 ? "var(--coral)" : "var(--teal)") : "var(--line)",
          }}
        />
      ))}
    </div>
  );
}

/** Small sparkline showing how valence has shifted across the conversation. */
function ValenceSparkline({ history }: { history: Emotion[] }) {
  if (history.length < 2) return null;

  const w = 260;
  const h = 48;
  const pad = 4;
  const points = history.map((e, i) => {
    const x = pad + (i / (history.length - 1)) * (w - pad * 2);
    const v = Math.max(-1, Math.min(1, e.valence));
    const y = h / 2 - (v * (h / 2 - pad));
    return `${x},${y}`;
  });

  const last = history[history.length - 1];
  const lastColor = last.valence >= 0 ? "var(--teal)" : "var(--coral)";

  return (
    <div className="sparkline-wrap">
      <span className="sparkline-label">Valence over time</span>
      <svg viewBox={`0 0 ${w} ${h}`} className="sparkline-svg" preserveAspectRatio="none">
        <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="var(--line)" strokeWidth="1" />
        <polyline points={points.join(" ")} fill="none" stroke="var(--mist)" strokeWidth="1.5" opacity={0.6} />
        <circle
          cx={points[points.length - 1].split(",")[0]}
          cy={points[points.length - 1].split(",")[1]}
          r="3"
          fill={lastColor}
        />
      </svg>
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [emotion, setEmotion] = useState<Emotion | null>(null);
  const [emotionHistory, setEmotionHistory] = useState<Emotion[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restore session on first load. sessionStorage (not localStorage) is
  // deliberate: it survives a refresh but clears when the tab/browser
  // closes, which is a reasonable default for sensitive conversations.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.messages)) setMessages(parsed.messages);
        if (Array.isArray(parsed.emotionHistory)) setEmotionHistory(parsed.emotionHistory);
        if (parsed.emotion) setEmotion(parsed.emotion);
      }
    } catch {
      // Corrupt or inaccessible storage — just start fresh.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, emotionHistory, emotion }));
    } catch {
      // Storage full or unavailable — non-fatal, just skip persistence.
    }
  }, [messages, emotionHistory, emotion, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const clearSession = useCallback(() => {
    setMessages([]);
    setEmotion(null);
    setEmotionHistory([]);
    setErrorMsg(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const historyForRequest = messages;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: historyForRequest }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Too many messages — please slow down.");
        setLoading(false);
        return;
      }

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Something went wrong.");
        setLoading(false);
        return;
      }

      // Append a placeholder assistant message we'll stream tokens into.
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;

          const event = JSON.parse(line);

          if (event.type === "emotion") {
            setEmotion(event.emotion);
            setEmotionHistory((prev) => [...prev, event.emotion]);
          } else if (event.type === "chunk") {
            setMessages((prev) => {
              const next = [...prev];
              const lastIdx = next.length - 1;
              next[lastIdx] = { ...next[lastIdx], content: next[lastIdx].content + event.text };
              return next;
            });
          } else if (event.type === "error") {
            setErrorMsg(event.message);
          }
        }
      }
    } catch {
      setErrorMsg("Couldn't reach MindBridge. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const isCrisis = (emotion?.urgency ?? 1) >= 4;

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <span className="wordmark">MindBridge</span>
          <span className="tagline">emotionally intelligent conversation</span>
        </div>
        {messages.length > 0 && (
          <button className="reset-btn" onClick={clearSession} type="button">
            Start over
          </button>
        )}
      </header>

      <div className="layout">
        <main className="chat-col">
          {isCrisis && (
            <div className="crisis-banner" role="alert">
              <strong>Support is available right now.</strong>
              <span>Call or text 988 (Suicide &amp; Crisis Lifeline) · Text HOME to 741741 (Crisis Text Line)</span>
            </div>
          )}

          <div className="messages" ref={scrollRef}>
            {messages.length === 0 && !loading && (
              <p className="empty-state">How are you feeling today?</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bubble-row ${m.role}`}>
                <div className={`bubble ${m.role}`}>
                  {m.content || (loading && i === messages.length - 1 ? "…" : "")}
                </div>
              </div>
            ))}
          </div>

          {errorMsg && <div className="error-banner">{errorMsg}</div>}

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Say what's on your mind…"
              aria-label="Message"
            />
            <button type="submit" disabled={loading || !input.trim()}>
              Send
            </button>
          </form>
        </main>

        <aside className="weather-col">
          <h2>Emotional weather</h2>
          <EmotionGauge emotion={emotion} />
          {emotion ? (
            <div className="reading">
              <div className="reading-row">
                <span>Arousal</span>
                <span>{emotion.arousal >= 0 ? "activated" : "numb"}</span>
              </div>
              <div className="reading-row">
                <span>Urgency</span>
                <UrgencyTicks urgency={emotion.urgency} />
              </div>
              <div className="reading-row">
                <span>Masking</span>
                <span>{emotion.masking}</span>
              </div>
              <p className="subtext">&ldquo;{emotion.subtext}&rdquo;</p>
              <ValenceSparkline history={emotionHistory} />
            </div>
          ) : (
            <p className="reading-empty">Start chatting to see a reading.</p>
          )}
        </aside>
      </div>

      <style jsx>{`
        .shell {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1.5rem 2rem 1rem;
          border-bottom: 1px solid var(--line);
        }
        .wordmark {
          font-family: var(--font-display), serif;
          font-style: italic;
          font-weight: 500;
          font-size: 1.6rem;
          letter-spacing: 0.01em;
          margin-right: 0.75rem;
        }
        .tagline {
          color: var(--mist-dim);
          font-size: 0.85rem;
        }
        .reset-btn {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--mist);
          border-radius: 8px;
          padding: 0.4rem 0.8rem;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .reset-btn:hover {
          border-color: var(--mist-dim);
        }
        .layout {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 1.5rem;
          padding: 1.5rem 2rem 2rem;
          max-width: 1100px;
          width: 100%;
          margin: 0 auto;
        }
        @media (max-width: 820px) {
          .layout {
            grid-template-columns: 1fr;
          }
        }
        .chat-col {
          display: flex;
          flex-direction: column;
          min-height: 60vh;
          border: 1px solid var(--line);
          border-radius: 18px;
          background: var(--bg-panel);
          overflow: hidden;
        }
        .crisis-banner {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          background: var(--coral-soft);
          border-bottom: 1px solid rgba(232, 115, 95, 0.35);
          color: #ffd9d0;
          padding: 0.9rem 1.25rem;
          font-size: 0.9rem;
        }
        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .empty-state {
          color: var(--mist-dim);
          font-family: var(--font-display), serif;
          font-style: italic;
          font-size: 1.2rem;
          margin: auto;
        }
        .bubble-row {
          display: flex;
        }
        .bubble-row.user {
          justify-content: flex-end;
        }
        .bubble {
          max-width: 75%;
          padding: 0.7rem 1rem;
          border-radius: 14px;
          line-height: 1.45;
          font-size: 0.95rem;
          white-space: pre-wrap;
        }
        .bubble.user {
          background: var(--teal-soft);
          border: 1px solid rgba(94, 200, 185, 0.4);
        }
        .bubble.assistant {
          background: var(--bg-panel-raised);
          border: 1px solid var(--line);
        }
        .error-banner {
          margin: 0 1.5rem;
          padding: 0.6rem 0.9rem;
          background: var(--coral-soft);
          border: 1px solid rgba(232, 115, 95, 0.35);
          border-radius: 10px;
          font-size: 0.85rem;
        }
        .composer {
          display: flex;
          gap: 0.6rem;
          padding: 1rem 1.25rem;
          border-top: 1px solid var(--line);
        }
        .composer input {
          flex: 1;
          background: var(--bg-deep);
          border: 1px solid var(--line);
          border-radius: 10px;
          color: var(--ink);
          padding: 0.65rem 0.9rem;
          font-size: 0.95rem;
        }
        .composer button {
          background: var(--teal);
          color: #0e1626;
          border: none;
          border-radius: 10px;
          padding: 0 1.2rem;
          font-weight: 600;
          cursor: pointer;
        }
        .composer button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .weather-col {
          border: 1px solid var(--line);
          border-radius: 18px;
          background: var(--bg-panel);
          padding: 1.5rem;
          height: fit-content;
        }
        .weather-col h2 {
          font-family: var(--font-display), serif;
          font-weight: 500;
          font-size: 1.05rem;
          margin: 0 0 1rem;
          color: var(--mist);
        }
        .gauge-wrap {
          position: relative;
          display: flex;
          justify-content: center;
        }
        .gauge-halo {
          position: absolute;
          inset: -20px;
          border-radius: 50%;
          animation: pulse ease-in-out infinite;
        }
        @keyframes pulse {
          0%,
          100% {
            transform: scale(0.92);
          }
          50% {
            transform: scale(1.05);
          }
        }
        .gauge-svg {
          width: 100%;
          max-width: 220px;
          position: relative;
        }
        .gauge-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.7rem;
          color: var(--mist-dim);
          padding: 0 0.5rem;
          margin-top: -0.5rem;
        }
        .reading {
          margin-top: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }
        .reading-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.85rem;
          color: var(--mist);
        }
        .urgency-ticks {
          display: flex;
          gap: 4px;
        }
        .tick {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .subtext {
          font-family: var(--font-display), serif;
          font-style: italic;
          font-size: 0.9rem;
          color: var(--mist);
          line-height: 1.5;
          margin: 0.25rem 0 0;
        }
        .reading-empty {
          color: var(--mist-dim);
          font-size: 0.85rem;
        }
        .sparkline-wrap {
          margin-top: 0.5rem;
          border-top: 1px solid var(--line);
          padding-top: 0.75rem;
        }
        .sparkline-label {
          display: block;
          font-size: 0.7rem;
          color: var(--mist-dim);
          margin-bottom: 0.35rem;
        }
        .sparkline-svg {
          width: 100%;
          height: 48px;
        }
      `}</style>
    </div>
  );
}
