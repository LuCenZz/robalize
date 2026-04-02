const JIRA_BASE = "https://imawebgroup.atlassian.net";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();

  // Reconstruct the JIRA path from the catch-all route
  const pathSegments = req.query.path;
  const jiraPath = "/" + (Array.isArray(pathSegments) ? pathSegments.join("/") : pathSegments);
  const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  const url = `${JIRA_BASE}${jiraPath}${queryString}`;

  try {
    const jiraRes = await fetch(url, {
      method: req.method,
      headers: {
        Authorization: req.headers.authorization || "",
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Atlassian-Token": "no-check",
      },
      body: req.method !== "GET" && req.body ? JSON.stringify(req.body) : undefined,
    });
    const text = await jiraRes.text();
    res.status(jiraRes.status).setHeader("Content-Type", "application/json").end(text);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
