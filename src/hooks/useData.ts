import { useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { RawRow } from "../types";

export function useData(userId: string | undefined) {
  const loadProjects = useCallback(async (): Promise<RawRow[]> => {
    if (!userId || !supabase) return [];
    const { data, error } = await supabase
      .from("projects")
      .select("epic_key, data")
      .eq("user_id", userId)
      .order("imported_at", { ascending: true });

    if (error) {
      console.error("Failed to load projects:", error);
      return [];
    }
    return (data || []).map((row) => row.data as RawRow);
  }, [userId]);

  const saveProjects = useCallback(async (rows: RawRow[], source: "csv" | "jira"): Promise<{ imported: number; changed: number }> => {
    if (!userId || !supabase) return { imported: 0, changed: 0 };

    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) throw new Error("Not authenticated");

    const res = await fetch("/api/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ rows, source }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Import failed" }));
      throw new Error(err.error || "Import failed");
    }

    return res.json();
  }, [userId]);

  const loadSetting = useCallback(async <T>(key: string, fallback: T): Promise<T> => {
    if (!userId || !supabase) return fallback;
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", key)
      .single();

    if (error || !data) return fallback;
    return data.value as T;
  }, [userId]);

  const saveSetting = useCallback(async (key: string, value: unknown): Promise<void> => {
    if (!userId || !supabase) return;
    await supabase
      .from("settings")
      .upsert(
        { user_id: userId, key, value },
        { onConflict: "user_id,key" }
      );
  }, [userId]);

  const jiraSync = useCallback(async (jql: string, maxRows: number): Promise<{ imported: number; changed: number }> => {
    if (!userId || !supabase) return { imported: 0, changed: 0 };

    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) throw new Error("Not authenticated");

    const res = await fetch("/api/jira-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jql, maxRows }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Sync failed" }));
      throw new Error(err.error || "Sync failed");
    }

    return res.json();
  }, [userId]);

  return { loadProjects, saveProjects, loadSetting, saveSetting, jiraSync };
}
