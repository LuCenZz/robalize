import { readFileSync } from "fs";
import { createServer } from "http";

// Load .env
try {
  const env = readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  }
} catch {}

const JIRA_BASE = "https://imawebgroup.atlassian.net";

function parseBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "POST" && req.url === "/api/jira") {
    const body = await parseBody(req);
    const { email, apiToken, method, path, body: jiraBody } = body;
    const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
    const url = `${JIRA_BASE}${path}`;
    console.log(`JIRA ${method || "GET"}: ${url}`);

    try {
      const jiraRes = await fetch(url, {
        method: method || "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          ...(jiraBody ? { "Content-Type": "application/json" } : {}),
          "X-Atlassian-Token": "no-check",
        },
        body: jiraBody ? JSON.stringify(jiraBody) : undefined,
      });
      const text = await jiraRes.text();
      res.writeHead(jiraRes.status, { "Content-Type": "application/json" });
      res.end(text);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/ai") {
    const body = await parseBody(req);
    const { message, context } = body;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }));
      return;
    }

    console.log("AI request:", message?.slice(0, 50));

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
          system: "You are an AI assistant for an OEM Projects Portal (automotive industry). You analyze project data from JIRA and provide insights. Answer in the same language as the user's question. Be concise and actionable. FORMATTING RULES: Use ONLY plain text. NO markdown at all — no #, no ##, no **, no *, no |, no tables. Use simple dashes (- ) for lists. Separate sections with blank lines. Write section titles on their own line followed by a colon. Keep answers short.",
          messages: [
            { role: "user", content: `Here is the current project data context:\n\n${context}\n\nUser question: ${message}` },
          ],
        }),
      });

      const text = await response.text();
      if (!response.ok) {
        res.writeHead(response.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: text }));
        return;
      }

      const data = JSON.parse(text);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ response: data.content?.[0]?.text || "No response" }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(3001, () => console.log("Server running on http://localhost:3001"));
