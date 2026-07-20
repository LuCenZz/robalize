import type { VercelRequest, VercelResponse } from "@vercel/node";

// Env var UIs (Vercel's dashboard included) store the value as typed —
// unlike a .env file, they don't strip a wrapping '...' or "..." pair.
// Real JQL never starts and ends with the same quote character, so
// stripping one accidental matching pair is always safe.
function stripWrappingQuotes(value: string): string {
  const first = value[0];
  const last = value[value.length - 1];
  if (value.length >= 2 && (first === "'" || first === '"') && first === last) {
    return value.slice(1, -1);
  }
  return value;
}

// Server-managed defaults for the lite app — lets the org-wide default JQL
// be changed via a Vercel env var without a code deploy. Each visitor can
// still override it locally (saved to their own browser's localStorage).
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const raw = process.env.JIRA_DEFAULT_JQL;
  res.status(200).json({
    jql: raw ? stripWrappingQuotes(raw) : null,
  });
}
