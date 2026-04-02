import { useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { RawRow } from "../types";

export function useData(userId: string | undefined) {
  const loadProjects = useCallback(async (): Promise<RawRow[]> => {
    if (!supabase || !userId) return [];
    const { data, error } = await supabase
      .from("projects")
      .select("data")
      .eq("user_id", userId)
      .order("imported_at", { ascending: true });

    if (error) {
      console.error("loadProjects error:", error.message, "userId:", userId);
      return [];
    }
    if (!data || data.length === 0) {
      console.log("loadProjects: no data found for userId:", userId);
      return [];
    }
    console.log("loadProjects: loaded", data.length, "projects from Supabase");
    return data.map((row) => row.data as RawRow);
  }, [userId]);

  const saveProjects = useCallback(async (rows: RawRow[], source: "csv" | "jira") => {
    if (!supabase || !userId || rows.length === 0) return;

    // Load existing projects to detect changes
    const { data: existing } = await supabase
      .from("projects")
      .select("id, epic_key, data")
      .eq("user_id", userId);

    const existingMap = new Map(
      (existing || []).map((p: { id: string; epic_key: string; data: unknown }) => [p.epic_key, p])
    );

    // Process in batches of 50
    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const upserts: { user_id: string; epic_key: string; data: RawRow; source: string; imported_at: string }[] = [];
      const snapshots: { project_id: string; user_id: string; data: unknown; source: string; changed_fields: string[] }[] = [];

      for (const row of batch) {
        const epicKey = row["Issue key"] || "";
        if (!epicKey) continue;

        const prev = existingMap.get(epicKey);

        // Detect changed fields for snapshot
        if (prev) {
          const oldData = prev.data as RawRow;
          const changedFields: string[] = [];
          const allKeys = new Set([...Object.keys(oldData), ...Object.keys(row)]);
          for (const key of allKeys) {
            if ((oldData[key] || "").trim() !== (row[key] || "").trim()) {
              changedFields.push(key);
            }
          }
          if (changedFields.length > 0) {
            snapshots.push({
              project_id: prev.id,
              user_id: userId,
              data: oldData,
              source,
              changed_fields: changedFields,
            });
          }
        }

        upserts.push({
          user_id: userId,
          epic_key: epicKey,
          data: row,
          source,
          imported_at: new Date().toISOString(),
        });
      }

      // Insert snapshots
      if (snapshots.length > 0) {
        await supabase.from("snapshots").insert(snapshots);
      }

      // Upsert projects
      if (upserts.length > 0) {
        const { error } = await supabase
          .from("projects")
          .upsert(upserts, { onConflict: "user_id,epic_key" });
        if (error) {
          console.error("saveProjects upsert error:", error.message);
        } else {
          console.log("saveProjects: saved batch of", upserts.length, "projects");
        }
      }
    }
  }, [userId]);

  const loadSetting = useCallback(async (key: string): Promise<unknown> => {
    if (!supabase || !userId) return null;
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", key)
      .single();
    return data?.value ?? null;
  }, [userId]);

  const saveSetting = useCallback(async (key: string, value: unknown) => {
    if (!supabase || !userId) return;
    await supabase.from("settings").upsert(
      { user_id: userId, key, value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
  }, [userId]);

  const loadAdminJiraConfig = useCallback(async () => {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("get_shared_jira_config");
    if (error || !data) return null;
    return data as { email: string; apiToken: string; jql: string; maxRows: number; refreshInterval: number };
  }, []);

  return { loadProjects, saveProjects, loadSetting, saveSetting, loadAdminJiraConfig };
}
