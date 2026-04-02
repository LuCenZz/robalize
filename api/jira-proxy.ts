import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // The client calls /api/jira-proxy/rest/api/3/field?params...
  // Vercel rewrites to this handler with the full URL in req.url
  // Extract everything after /api/jira-proxy
  const fullUrl = req.url || "";
  const jiraPath = fullUrl.replace(/^\/api\/jira-proxy/, "");

  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const targetUrl = `https://imawebgroup.atlassian.net${jiraPath}`;

  try {
    const jiraRes = await fetch(targetUrl, {
      method: req.method || "GET",
      headers: {
        Authorization: auth,
        Accept: "application/json",
        ...(req.method !== "GET" ? { "Content-Type": "application/json" } : {}),
        "X-Atlassian-Token": "no-check",
      },
      body: req.method !== "GET" && req.body ? JSON.stringify(req.body) : undefined,
    });

    const text = await jiraRes.text();
    res.status(jiraRes.status).setHeader("Content-Type", "application/json").send(text);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Proxy error";
    res.status(500).json({ error: message });
  }
}
