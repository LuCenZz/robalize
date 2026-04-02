import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validateAuth } from "./_lib/auth.js";
import { createAdminClient } from "./_lib/supabase-admin.js";
import { importWithChangeDetection } from "./_lib/change-detection.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await validateAuth(req.headers.authorization as string);
    const { rows, source = "csv" } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows provided" });
    }

    const supabase = createAdminClient();
    const result = await importWithChangeDetection(supabase, user.id, rows, source);

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("Import error:", err);
    return res.status(err.message.includes("token") || err.message.includes("Authorization") ? 401 : 500).json({
      error: err.message || "Import failed",
    });
  }
}
