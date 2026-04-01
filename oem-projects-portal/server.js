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

const PORT = 3001;
app.listen(PORT, () => console.log(`JIRA proxy running on http://localhost:${PORT}`));
