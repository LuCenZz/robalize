import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json());

const JIRA_BASE = "https://imawebgroup.atlassian.net";

// Universal proxy - all requests go through POST to avoid query param issues
app.post("/api/jira", async (req, res) => {
  const { email, apiToken, method, path, body } = req.body;
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const url = `${JIRA_BASE}${path}`;

  console.log(`JIRA ${method || "GET"}: ${url}`);

  try {
    const jiraRes = await fetch(url, {
      method: method || "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        "X-Atlassian-Token": "no-check",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await jiraRes.text();
    if (path.includes("search")) console.log("Response:", text.slice(0, 500));
    res.status(jiraRes.status).type("application/json").send(text);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// Claude AI endpoint
app.post("/api/ai", async (req, res) => {
  const { message, context } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set. Run: export ANTHROPIC_API_KEY=your_key" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: `You are an AI assistant for an OEM Projects Portal (automotive industry). You analyze project data from JIRA and provide insights. Answer in the same language as the user's question. Be concise and actionable. Use markdown for formatting.`,
        messages: [
          {
            role: "user",
            content: `Here is the current project data context:\n\n${context}\n\nUser question: ${message}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "No response";
    res.json({ response: text });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`JIRA proxy running on http://localhost:${PORT}`));
