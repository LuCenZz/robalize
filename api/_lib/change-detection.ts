import type { SupabaseClient } from "@supabase/supabase-js";

interface ImportRow {
  [key: string]: string;
}

interface ImportResult {
  imported: number;
  changed: number;
  created: number;
}

export async function importWithChangeDetection(
  supabase: SupabaseClient,
  userId: string,
  rows: ImportRow[],
  source: "csv" | "jira"
): Promise<ImportResult> {
  const { data: existing } = await supabase
    .from("projects")
    .select("id, epic_key, data")
    .eq("user_id", userId);

  const existingMap = new Map(
    (existing || []).map((p: any) => [p.epic_key, p])
  );

  let changed = 0;
  let created = 0;

  for (const row of rows) {
    const epicKey = row["Issue key"] || "";
    if (!epicKey) continue;

    const prev = existingMap.get(epicKey);

    if (prev) {
      const changedFields = detectChangedFields(prev.data as ImportRow, row);
      if (changedFields.length > 0) {
        await supabase.from("snapshots").insert({
          project_id: prev.id,
          user_id: userId,
          data: prev.data,
          source,
          changed_fields: changedFields,
        });
        changed++;
      }
    } else {
      created++;
    }

    await supabase
      .from("projects")
      .upsert(
        {
          user_id: userId,
          epic_key: epicKey,
          data: row,
          source,
          imported_at: new Date().toISOString(),
        },
        { onConflict: "user_id,epic_key" }
      );
  }

  return { imported: rows.length, changed, created };
}

function detectChangedFields(oldData: ImportRow, newData: ImportRow): string[] {
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  for (const key of allKeys) {
    const oldVal = (oldData[key] || "").trim();
    const newVal = (newData[key] || "").trim();
    if (oldVal !== newVal) {
      changed.push(key);
    }
  }

  return changed;
}
