"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { Emotion } from "@/lib/emotion";

type Message = { role: "user" | "assistant"; content: string; timestamp: number };

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
  const needleLen = r - 10;
  // Base needle is drawn pointing straight up; rotating the group by
  // (90 - angleDeg) degrees brings it to the correct valence angle. Doing
  // it via a CSS-transitioned transform (rather than recomputing raw
  // coordinates) lets the needle ease smoothly between readings instead
  // of jumping.
  const rotation = 90 - angleDeg;

  const arousalMag = Math.max(0, Math.min(1, Math.abs(arousal)));
  const pulseDuration = 2.6 - arousalMag * 1.8;

  const isCrisis = urgency >= 4;
  const needleColor = isCrisis ? "var(--coral)" : "var(--ink)";

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
        <g
          className="gauge-needle"
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
          }}
        >
          <line x1={cx} y1={cy} x2={cx} y2={cy - needleLen} stroke={needleColor} strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r="5" fill={needleColor} />
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

function TypingDots() {
  return (
    <span className="typing-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

/** A small living presence next to MindBridge's messages — not a static icon. */
function Avatar() {
  return (
    <span className="avatar" aria-hidden="true">
      <span className="avatar-core" />
    </span>
  );
}

/** Relative time that stays honest — shows the exact time on hover/focus. */
function MessageTime({ timestamp }: { timestamp: number }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const update = () => {
      const diffSec = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
      if (diffSec < 10) setLabel("just now");
      else if (diffSec < 60) setLabel(`${diffSec}s ago`);
      else if (diffSec < 3600) setLabel(`${Math.floor(diffSec / 60)}m ago`);
      else setLabel(new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    };
    update();
    const id = setInterval(update, 15000);
    return () => clearInterval(id);
  }, [timestamp]);

  const absolute = new Date(timestamp).toLocaleString([], {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });

  return (
    <span className="msg-time" title={absolute}>
      {label}
    </span>
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
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastFailedMessageRef = useRef<string | null>(null);

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
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      setShowJumpToLatest(false);
    } else {
      setShowJumpToLatest(true);
    }
  }, [messages, loading]);

  const handleMessagesScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setShowJumpToLatest(!nearBottom);
  }, []);

  const jumpToLatest = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setShowJumpToLatest(false);
  }, []);

  // Keep focus in the composer between turns so people can just keep typing.
  useEffect(() => {
    if (hydrated && !loading) inputRef.current?.focus();
  }, [hydrated, loading]);

  // Auto-grow the textarea up to a max height instead of scrolling internally.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [input]);

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

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    const historyForRequest = overrideText ? messages.slice(0, -1) : messages;
    if (!overrideText) {
      setMessages((prev) => [...prev, { role: "user", content: text, timestamp: Date.now() }]);
      setInput("");
    }
    setLoading(true);
    setErrorMsg(null);
    lastFailedMessageRef.current = null;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: historyForRequest }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Too many messages — please slow down.");
        lastFailedMessageRef.current = text;
        setLoading(false);
        return;
      }

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Something went wrong.");
        lastFailedMessageRef.current = text;
        setLoading(false);
        return;
      }

      // Append a placeholder assistant message we'll stream tokens into.
      setMessages((prev) => [...prev, { role: "assistant", content: "", timestamp: Date.now() }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawError = false;

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
            setErrorMsg(event.debugDetail ? `${event.message} (${event.debugDetail})` : event.message);
            lastFailedMessageRef.current = text;
            sawError = true;
          }
        }
      }

      // If the stream errored out with no tokens at all, drop the empty
      // placeholder bubble rather than leaving a blank assistant message.
      if (sawError) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && last.content === "") return prev.slice(0, -1);
          return prev;
        });
      }
    } catch {
      setErrorMsg("Couldn't reach MindBridge. Check your connection and try again.");
      lastFailedMessageRef.current = text;
    } finally {
      setLoading(false);
    }
  }

  function retryLastMessage() {
    if (lastFailedMessageRef.current) sendMessage(lastFailedMessageRef.current);
  }

  const isCrisis = (emotion?.urgency ?? 1) >= 4;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-title">
          <span className="wordmark">MindBridge</span>
          <span className="presence" aria-hidden="true" />
          <span className="tagline">here to listen, any time</span>
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

          <div className="messages" ref={scrollRef} onScroll={handleMessagesScroll} aria-live="polite">
            {messages.length === 0 && !loading && (
              <div className="intro-card">
                <p className="intro-title">How are you feeling today?</p>
                <p className="intro-body">
                  Say whatever&rsquo;s on your mind — MindBridge listens and asks questions rather than
                  handing out advice. Your conversation stays in this browser tab and clears when you
                  close it or hit &ldquo;Start over.&rdquo;
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bubble-row ${m.role} bubble-enter`}>
                {m.role === "assistant" && <Avatar />}
                <div className="bubble-col">
                  <div className={`bubble ${m.role}`}>
                    {m.content ? m.content : loading && i === messages.length - 1 ? <TypingDots /> : ""}
                  </div>
                  {m.content && <MessageTime timestamp={m.timestamp ?? Date.now()} />}
                </div>
              </div>
            ))}
          </div>

          {showJumpToLatest && (
            <button className="jump-btn" type="button" onClick={jumpToLatest}>
              ↓ Jump to latest
            </button>
          )}

          {errorMsg && (
            <div className="error-banner">
              <span>{errorMsg}</span>
              {lastFailedMessageRef.current && (
                <button type="button" className="retry-btn" onClick={retryLastMessage}>
                  Retry
                </button>
              )}
            </div>
          )}

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Say what's on your mind… (Enter to send, Shift+Enter for a new line)"
              aria-label="Message"
              rows={1}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()}>
              {loading ? "…" : "Send"}
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
        .topbar-title {
          display: flex;
          align-items: baseline;
          gap: 0.6rem;
        }
        .wordmark {
          font-family: var(--font-display), serif;
          font-style: italic;
          font-weight: 500;
          font-size: 1.6rem;
          letter-spacing: 0.01em;
        }
        .presence {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--teal);
          box-shadow: 0 0 0 0 rgba(94, 200, 185, 0.5);
          animation: presence-pulse 2.4s ease-in-out infinite;
          align-self: center;
        }
        @keyframes presence-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(94, 200, 185, 0.45);
          }
          70% {
            box-shadow: 0 0 0 6px rgba(94, 200, 185, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(94, 200, 185, 0);
          }
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
          position: relative;
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
        .intro-card {
          margin: auto;
          max-width: 380px;
          text-align: center;
        }
        .intro-title {
          font-family: var(--font-display), serif;
          font-style: italic;
          font-size: 1.3rem;
          margin: 0 0 0.6rem;
        }
        .intro-body {
          color: var(--mist-dim);
          font-size: 0.85rem;
          line-height: 1.55;
          margin: 0;
        }
        .jump-btn {
          position: absolute;
          bottom: 5.5rem;
          left: 50%;
          transform: translateX(-50%);
          background: var(--bg-panel-raised);
          border: 1px solid var(--line);
          color: var(--mist);
          border-radius: 999px;
          padding: 0.35rem 0.9rem;
          font-size: 0.78rem;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
        }
        .jump-btn:hover {
          border-color: var(--teal);
          color: var(--ink);
        }
        .bubble-row {
          display: flex;
          align-items: flex-end;
          gap: 0.5rem;
        }
        .bubble-row.user {
          justify-content: flex-end;
        }
        .bubble-enter {
          animation: bubble-in 0.35s ease-out both;
        }
        @keyframes bubble-in {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .avatar {
          flex-shrink: 0;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, var(--teal), var(--bg-panel-raised) 70%);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 2px;
        }
        .avatar-core {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--ink);
          opacity: 0.85;
        }
        .bubble-col {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          max-width: 75%;
        }
        .bubble-row.user .bubble-col {
          align-items: flex-end;
        }
        .msg-time {
          font-size: 0.68rem;
          color: var(--mist-dim);
          padding: 0 0.2rem;
        }
        .bubble {
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
        .typing-dots {
          display: inline-flex;
          gap: 4px;
          align-items: center;
          padding: 0.15rem 0;
        }
        .typing-dots span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--mist-dim);
          animation: typing-bounce 1.1s ease-in-out infinite;
        }
        .typing-dots span:nth-child(2) {
          animation-delay: 0.15s;
        }
        .typing-dots span:nth-child(3) {
          animation-delay: 0.3s;
        }
        @keyframes typing-bounce {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: 0.5;
          }
          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
        .error-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin: 0 1.5rem;
          padding: 0.6rem 0.9rem;
          background: var(--coral-soft);
          border: 1px solid rgba(232, 115, 95, 0.35);
          border-radius: 10px;
          font-size: 0.85rem;
        }
        .retry-btn {
          flex-shrink: 0;
          background: transparent;
          border: 1px solid rgba(232, 115, 95, 0.5);
          color: #ffd9d0;
          border-radius: 8px;
          padding: 0.3rem 0.7rem;
          font-size: 0.78rem;
          cursor: pointer;
        }
        .retry-btn:hover {
          background: rgba(232, 115, 95, 0.15);
        }
        .composer {
          display: flex;
          align-items: flex-end;
          gap: 0.6rem;
          padding: 1rem 1.25rem;
          border-top: 1px solid var(--line);
        }
        .composer textarea {
          flex: 1;
          resize: none;
          background: var(--bg-deep);
          border: 1px solid var(--line);
          border-radius: 10px;
          color: var(--ink);
          padding: 0.65rem 0.9rem;
          font-size: 0.95rem;
          font-family: inherit;
          line-height: 1.4;
          max-height: 140px;
        }
        .composer textarea:disabled {
          opacity: 0.6;
        }
        .composer button {
          background: var(--teal);
          color: #0e1626;
          border: none;
          border-radius: 10px;
          padding: 0 1.2rem;
          height: 42px;
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
        .gauge-needle {
          transition: transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
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
