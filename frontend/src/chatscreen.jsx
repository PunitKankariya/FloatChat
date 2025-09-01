// src/chatscreen.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

export default function ChatScreen({ onBack }) {
  // Colors (exactly 5): primary blue, accent cyan, and 3 neutrals
  const theme = useMemo(
    () => ({
      blue: "#1478FF",
      cyan: "#06B6D4",
      neutral900: "#0A1426", // darkest background
      neutral800: "#0E1C36", // surface for chat/input
      neutral100: "#E6F0FF", // light text
    }),
    []
  );

  // Hide page scrollbars while this screen is mounted
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  const [messages, setMessages] = useState([
    { id: "m1", role: "assistant", text: "Hi! Ask me anything about salinity profiles." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  function addMessage(role, text) {
    setMessages((m) => [...m, { id: crypto.randomUUID(), role, text }]);
  }

  async function handleSend(e) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    addMessage("user", content);
    setSending(true);

    // Simulate a streaming assistant reply (replace with your API later)
    const reply =
      "Got it. I’ll analyze that and summarize key insights for you. Anything else you want me to focus on?";
    for (let i = 1; i <= reply.length; i++) {
      const partial = reply.slice(0, i);
      setMessages((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && last.streaming) {
          next[next.length - 1] = { ...last, text: partial, streaming: true };
        } else {
          next.push({ id: crypto.randomUUID(), role: "assistant", text: partial, streaming: true });
        }
        return next;
      });
      await new Promise((r) => setTimeout(r, 12)); // typing speed
    }
    // finalize
    setMessages((m) => {
      const next = [...m];
      const last = next[next.length - 1];
      if (last?.role === "assistant") next[next.length - 1] = { ...last, streaming: false };
      return next;
    });
    setSending(false);
  }

  return (
    <div style={styles.viewport(theme)}>
      <style>{globalStyles(theme)}</style>

      {/* Header */}
      <header style={styles.header(theme)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={onBack}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.neutral100,
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            ← Back
          </button>
          <div style={styles.brandLeft}>
            <div style={styles.brandDot(theme)} aria-hidden />
            <h1 style={styles.title}>Copilot</h1>
          </div>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.badge(theme)}>Chat</span>
        </div>
      </header>

      {/* Chat area */}
      <main style={styles.main}>
        <section style={styles.chatContainer(theme)} aria-label="Chat messages">
          <div id="chat-scroll" style={styles.chatScroll}>
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} text={m.text} theme={theme} />
            ))}
            <div ref={endRef} />
          </div>

          <form onSubmit={handleSend} style={styles.inputWrap(theme)} aria-label="Message composer">
            <input
              type="text"
              placeholder="Type a new message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={styles.input(theme)}
              aria-label="Message"
            />
            <button type="submit" disabled={sending || !input.trim()} style={styles.send(theme)}>
              {sending ? "Sending…" : "Send"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

function MessageBubble({ role, text, theme }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={isUser ? styles.userBubble(theme) : styles.assistantBubble(theme)}>
        {text}
      </div>
    </div>
  );
}

/* Inline CSS */
const styles = {
  viewport: (t) => ({
    height: "100vh",
    width: "100vw",
    display: "flex",
    flexDirection: "column",
    color: t.neutral100,
    background:
      "radial-gradient(1200px 600px at 80% -20%, rgba(20,120,255,0.20), transparent 60%), " +
      "linear-gradient(180deg, #071022 0%, #0A1426 60%, #0A1426 100%)",
    // fallback solid:
    backgroundColor: t.neutral900,
    fontFamily:
      '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,"Helvetica Neue",Arial,"Noto Sans",sans-serif',
  }),
  header: (t) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background:
      "linear-gradient(180deg, rgba(10,20,38,0.7) 0%, rgba(10,20,38,0.1) 100%)",
    backdropFilter: "blur(6px)",
  }),
  brandLeft: { display: "flex", alignItems: "center", gap: 10 },
  brandDot: (t) => ({
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: `linear-gradient(135deg, ${t.blue}, ${t.cyan})`,
    boxShadow: `0 0 18px ${t.blue}`,
  }),
  title: {
    margin: 0,
    fontSize: 18,
    letterSpacing: 0.3,
    fontWeight: 600,
  },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  badge: (t) => ({
    fontSize: 12,
    color: t.neutral100,
    background: "rgba(255,255,255,0.06)",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.08)",
  }),
  main: { flex: 1, display: "flex", padding: 16 },
  chatContainer: (t) => ({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    maxWidth: 1200,
    margin: "0 auto",
    width: "100%",
    background:
      "linear-gradient(180deg, rgba(10,28,54,0.65) 0%, rgba(10,28,54,0.35) 100%)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 16,
    overflow: "hidden",
  }),
  chatScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 18px",
  },
  inputWrap: (t) => ({
    display: "flex",
    gap: 10,
    alignItems: "center",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    padding: 12,
    background:
      "linear-gradient(180deg, rgba(10,28,54,0.95) 0%, rgba(10,28,54,0.85) 100%)",
  }),
  input: (t) => ({
    flex: 1,
    height: 44,
    padding: "0 14px",
    color: t.neutral100,
    background:
      "linear-gradient(180deg, rgba(6,18,40,0.95) 0%, rgba(6,24,52,0.95) 100%)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 10,
    outline: "none",
    transition: "box-shadow 0.2s ease, border-color 0.2s ease",
  }),
  send: (t) => ({
    height: 44,
    padding: "0 16px",
    borderRadius: 10,
    color: "white",
    border: "none",
    cursor: "pointer",
    background: `linear-gradient(135deg, ${t.blue} 0%, ${t.cyan} 100%)`,
    boxShadow: "0 6px 20px rgba(20,120,255,0.25), inset 0 0 0 1px rgba(255,255,255,0.12)",
    transition: "transform 0.06s ease, filter 0.2s ease",
  }),
  userBubble: (t) => ({
    maxWidth: "72ch",
    padding: "12px 14px",
    margin: "8px 0",
    color: "white",
    background: `linear-gradient(135deg, ${t.blue} 0%, ${t.cyan} 100%)`,
    borderRadius: "16px 16px 4px 16px",
    boxShadow: "0 8px 24px rgba(20,120,255,0.20)",
    lineHeight: 1.5,
    fontSize: 14.5,
  }),
  assistantBubble: (t) => ({
    maxWidth: "72ch",
    padding: "12px 14px",
    margin: "8px 0",
    color: t.neutral100,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "16px 16px 16px 4px",
    lineHeight: 1.6,
    fontSize: 14.5,
  }),
};

function globalStyles(theme) {
  return `
    /* Hide scrollbars but keep scrollability */
    #chat-scroll {
      scrollbar-width: none; /* Firefox */
    }
    #chat-scroll::-webkit-scrollbar {
      width: 0;
      height: 0;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    input:focus {
      box-shadow:
        0 0 0 2px rgba(20,120,255,0.25),
        0 0 0 6px rgba(6,182,212,0.12);
      border-color: rgba(255,255,255,0.22) !important;
    }
    button:hover:not(:disabled) { filter: brightness(1.06); }
    button:active:not(:disabled) { transform: translateY(1px); }

    @media (max-width: 640px) {
      header h1 { font-size: 16px; }
    }
  `;
}