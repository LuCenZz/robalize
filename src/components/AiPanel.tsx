import { useState, useRef, useEffect } from "react";
import { theme } from "../styles/theme";
import type { DisplayRow } from "../types";

interface AiPanelProps {
  open: boolean;
  onClose: () => void;
  displayRows: DisplayRow[];
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

function buildContext(rows: DisplayRow[]): string {
  const lines: string[] = [];
  lines.push(`Total projects visible: ${rows.filter((r) => r.type === "epic").length}`);
  lines.push(`Initiatives: ${rows.filter((r) => r.type === "initiative").length}`);
  lines.push("");
  lines.push("Projects:");

  for (const row of rows.slice(0, 80)) {
    const e = row.epic;
    if (row.type === "initiative") {
      lines.push(`[INITIATIVE] ${e.epicKey} - ${e.epicName} (${row.children?.length || 0} children)`);
    } else {
      const phases = e.phases.map((p) => `${p.phaseName}: ${p.startDate.toLocaleDateString("en-GB")} → ${p.endDate.toLocaleDateString("en-GB")}`).join(", ");
      const product = e.rawData["Custom field (Product)"] || "";
      lines.push(`${e.epicKey} | ${product} | ${e.epicName} | Status: ${e.status} | ${phases}`);
    }
  }

  if (rows.length > 80) {
    lines.push(`... and ${rows.length - 80} more rows`);
  }

  return lines.join("\n");
}

export function AiPanel({ open, onClose, displayRows }: AiPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          context: buildContext(displayRows),
        }),
      });

      const data = await res.json();
      if (data.error) {
        setMessages((prev) => [...prev, { role: "assistant", text: `Error: ${data.error}` }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", text: data.response }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", text: `Error: ${err}` }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 400,
        height: "100vh",
        background: "white",
        boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
        zIndex: 3000,
        display: "flex",
        flexDirection: "column",
        fontFamily: theme.fontFamily,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: theme.primary,
          color: "white",
          padding: "14px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>AI Assistant</span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "white", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {messages.length === 0 && (
          <div style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", marginTop: 40 }}>
            <p style={{ fontSize: 28, margin: "0 0 12px" }}>🤖</p>
            <p style={{ fontWeight: 600, color: theme.textDark, marginBottom: 8 }}>Ask me anything about your projects</p>
            <p style={{ fontSize: 12, lineHeight: 1.5 }}>
              "Which projects are at risk?"<br />
              "Summary of BMW projects"<br />
              "What's in Customer UAT right now?"
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                background: msg.role === "user" ? theme.primary : "#f4f1fe",
                color: msg.role === "user" ? "white" : theme.textDark,
                padding: "10px 14px",
                borderRadius: msg.role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                maxWidth: "85%",
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: theme.textMuted, fontSize: 13 }}>
            <span style={{ animation: "pulse 1s infinite", display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: theme.primary }} />
            Thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: `1px solid ${theme.borderLight}`,
          display: "flex",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask a question..."
          style={{
            flex: 1,
            padding: "10px 14px",
            border: `1.5px solid ${theme.borderLight}`,
            borderRadius: 10,
            fontSize: 13,
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = theme.primary)}
          onBlur={(e) => (e.currentTarget.style.borderColor = theme.borderLight)}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            background: theme.primary,
            color: "white",
            border: "none",
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
