import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { message, context } = req.body;

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
        system: "You are an AI assistant for Robalize, a Project Portfolio Management tool (automotive industry). You analyze project data from JIRA and provide insights. Answer in the same language as the user's question. Be concise and actionable. FORMATTING RULES: Use ONLY plain text. NO markdown at all — no #, no ##, no **, no *, no |, no tables. Use simple dashes (- ) for lists. Separate sections with blank lines. Write section titles on their own line followed by a colon. Keep answers short.",
        messages: [
          {
            role: "user",
            content: `Here is the current project data context:\n\n${context}\n\nUser question: ${message}`,
          },
        ],
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({ error: text });
    }

    const data = JSON.parse(text);
    return res.status(200).json({
      response: data.content?.[0]?.text || "No response",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return res.status(500).json({ error: message });
  }
}
