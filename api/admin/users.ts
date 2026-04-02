import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validateAuth } from "../_lib/auth.js";
import { createAdminClient } from "../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await validateAuth(req.headers.authorization as string);

    if (user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const supabase = createAdminClient();

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, display_name, role, avatar_url, created_at")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === "PUT") {
      const { userId, role } = req.body;
      if (!userId || !["admin", "viewer", "pending"].includes(role)) {
        return res.status(400).json({ error: "Invalid userId or role" });
      }

      const { error } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", userId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    return res.status(err.message.includes("Admin") ? 403 : 500).json({
      error: err.message || "Server error",
    });
  }
}
