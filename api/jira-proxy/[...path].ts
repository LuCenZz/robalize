import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathSegments = req.query.path;
  const jiraPath = Array.isArray(pathSegments) ? "/" + pathSegments.join("/") : "/" + (pathSegments || "");

  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  // Rebuild query string excluding the "path" param (used by Vercel catch-all)
  const url = new URL(`https://imawebgroup.atlassian.net${jiraPath}`);
  for (const [key, val] of Object.entries(req.query)) {
    if (key === "path") continue;
    if (typeof val === "string") url.searchParams.set(key, val);
  }

  try {
    const jiraRes = await fetch(url.toString(), {
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
