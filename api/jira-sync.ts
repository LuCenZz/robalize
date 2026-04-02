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
    const { jql, maxRows = 1000 } = req.body;

    if (!jql) {
      return res.status(400).json({ error: "JQL query required" });
    }

    const supabase = createAdminClient();

    const { data: setting } = await supabase
      .from("settings")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", "jira_config")
      .single();

    if (!setting?.value) {
      return res.status(400).json({ error: "JIRA not configured. Save your JIRA config first." });
    }

    const config = setting.value as { email: string; apiToken: string };
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");

    // Fetch fields metadata
    const fieldsRes = await fetch(
      `https://imawebgroup.atlassian.net/rest/api/3/field`,
      { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } }
    );
    if (!fieldsRes.ok) throw new Error("Failed to fetch JIRA fields");
    const fields = await fieldsRes.json();
    const fieldMap = new Map<string, string>();
    for (const f of fields as any[]) {
      fieldMap.set(f.id, f.name);
    }

    // Fetch issues
    const allRows: Record<string, string>[] = [];
    let startAt = 0;
    const pageSize = 100;

    while (allRows.length < maxRows) {
      const searchRes = await fetch(
        `https://imawebgroup.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${Math.min(pageSize, maxRows - allRows.length)}&expand=names`,
        { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } }
      );
      if (!searchRes.ok) throw new Error("JIRA search failed");
      const searchData = await searchRes.json() as any;

      for (const issue of searchData.issues || []) {
        const row: Record<string, string> = {
          "Summary": issue.fields?.summary || "",
          "Issue key": issue.key || "",
          "Issue id": String(issue.id || ""),
          "Issue Type": issue.fields?.issuetype?.name || "",
          "Status": issue.fields?.status?.name || "",
          "Priority": issue.fields?.priority?.name || "",
          "Assignee": issue.fields?.assignee?.displayName || "",
          "Reporter": issue.fields?.reporter?.displayName || "",
          "Created": issue.fields?.created || "",
          "Updated": issue.fields?.updated || "",
          "Project key": issue.fields?.project?.key || "",
          "Project name": issue.fields?.project?.name || "",
          "Parent key": issue.fields?.parent?.key || "",
          "Parent summary": issue.fields?.parent?.fields?.summary || "",
          "Status Category": issue.fields?.status?.statusCategory?.name || "",
        };

        for (const [fieldId, value] of Object.entries(issue.fields || {})) {
          if (fieldId.startsWith("customfield_") && value != null) {
            const name = fieldMap.get(fieldId) || fieldId;
            const colName = `Custom field (${name})`;
            if (typeof value === "string") {
              row[colName] = value;
            } else if (typeof value === "number") {
              row[colName] = String(value);
            } else if (typeof value === "object" && value !== null) {
              const v = value as any;
              if ("value" in v) row[colName] = String(v.value);
              else if ("name" in v) row[colName] = String(v.name);
              else if (Array.isArray(v)) row[colName] = v.map((x: any) => x?.name || x?.value || String(x)).join(", ");
            }
          }
        }

        allRows.push(row);
      }

      if ((searchData.issues || []).length < pageSize || allRows.length >= searchData.total) break;
      startAt += pageSize;
    }

    const result = await importWithChangeDetection(supabase, user.id, allRows, "jira");
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("JIRA sync error:", err);
    return res.status(err.message.includes("token") || err.message.includes("Authorization") ? 401 : 500).json({
      error: err.message || "Sync failed",
    });
  }
}
