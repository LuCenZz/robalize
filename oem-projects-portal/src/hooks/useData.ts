import { useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { RawRow } from "../types";

export function useData(userId: string | undefined) {
  const loadProjects = useCallback(async (): Promise<RawRow[]> => {
    if (!supabase || !userId) return [];
    const { data, error } = await supabase
      .from("projects")
      .select("rows")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) return [];
    return (data.rows as RawRow[]) || [];
  }, [userId]);

  const saveProjects = useCallback(async (rows: RawRow[], source: string) => {
    if (!supabase || !userId) return;
    await supabase.from("projects").upsert(
      { user_id: userId, rows, source, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
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

  const jiraSync = useCallback(async (rows: RawRow[]) => {
    await saveProjects(rows, "jira");
  }, [saveProjects]);

  return { loadProjects, saveProjects, loadSetting, saveSetting, jiraSync };
}
