// Port of src/components/AiPanel.tsx (no paywall/roles).

let messages = []; // {role: "user"|"assistant", text}
let loading = false;

function buildContext(rows) {
  const lines = [];
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
  if (rows.length > 80) lines.push(`... and ${rows.length - 80} more rows`);
  return lines.join("\n");
}

export function toggleAiPanel(state) {
  const root = document.getElementById("ai-root");
  if (root.innerHTML) { root.innerHTML = ""; return; }
  render(root, state);
}

function render(root, state) {
  root.innerHTML = `
    <div class="ai-panel">
      <div class="ai-header"><span>AI Assistant</span><button class="ai-close">×</button></div>
      <div class="ai-messages">
        ${messages.length === 0 ? `
          <div class="ai-empty">
            <p class="ai-empty-icon">🤖</p>
            <p class="ai-empty-title">Ask me anything about your projects</p>
            <p class="ai-empty-hint">"Which projects are at risk?"<br/>"Summary of BMW projects"<br/>"What's in Customer UAT right now?"</p>
          </div>` : ""}
        ${messages.map((m) => `<div class="ai-msg ai-msg-${m.role}"><div class="ai-bubble"></div></div>`).join("")}
        ${loading ? '<div class="ai-thinking"><span class="ai-pulse"></span>Thinking...</div>' : ""}
      </div>
      <div class="ai-input-row">
        <input id="ai-input" type="text" placeholder="Ask a question..." />
        <button id="ai-send" ${loading ? "disabled" : ""}>Send</button>
      </div>
    </div>
  `;
  // textContent (not innerHTML) for message bodies — they contain user/model text
  const bubbles = root.querySelectorAll(".ai-bubble");
  messages.forEach((m, i) => { bubbles[i].textContent = m.text; });
  const msgBox = root.querySelector(".ai-messages");
  msgBox.scrollTop = msgBox.scrollHeight;

  root.querySelector(".ai-close").addEventListener("click", () => { root.innerHTML = ""; });
  const input = root.querySelector("#ai-input");
  const send = async () => {
    const trimmed = input.value.trim();
    if (!trimmed || loading) return;
    messages.push({ role: "user", text: trimmed });
    loading = true;
    render(root, state);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, context: buildContext(state.derived.displayRows) }),
      });
      const data = await res.json();
      messages.push({ role: "assistant", text: data.error ? `Error: ${data.error}` : data.response });
    } catch (err) {
      messages.push({ role: "assistant", text: `Error: ${err}` });
    } finally {
      loading = false;
      render(root, state);
      root.querySelector("#ai-input")?.focus();
    }
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  root.querySelector("#ai-send").addEventListener("click", send);
  input.focus();
}
