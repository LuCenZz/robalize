import type { VercelRequest, VercelResponse } from "@vercel/node";

// Server-managed defaults for the lite app — lets the org-wide default JQL
// be changed via a Vercel env var without a code deploy. Each visitor can
// still override it locally (saved to their own browser's localStorage).
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    jql: process.env.JIRA_DEFAULT_JQL || null,
  });
}
