import { RawRow, EpicTask, PhaseSegment, PHASE_CONFIG } from "../types";

function parseJiraDate(value: string): Date | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();

  // Try "DD Mon YYYY" format (e.g., "23 Mar 2026")
  const dmy = trimmed.match(
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i
  );
  if (dmy) {
    const parsed = new Date(`${dmy[2]} ${dmy[1]}, ${dmy[3]}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Try "DD/Mon/YY" format (e.g., "23/Mar/26")
  const slashed = trimmed.match(
    /^(\d{1,2})\/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\/(\d{2,4})$/i
  );
  if (slashed) {
    const year =
      slashed[3].length === 2 ? `20${slashed[3]}` : slashed[3];
    const parsed = new Date(`${slashed[2]} ${slashed[1]}, ${year}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Fallback: try native Date parsing
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) return fallback;

  return null;
}

export function transformToEpicTasks(rows: RawRow[]): EpicTask[] {
  return rows
    .map((row, index) => {
      const phases: PhaseSegment[] = [];

      for (const phase of PHASE_CONFIG) {
        const startDate = parseJiraDate(row[phase.startCol]);
        const endDate = parseJiraDate(row[phase.endCol]);

        if (startDate && endDate) {
          phases.push({
            id: `${index}-${phase.name}`,
            phaseName: phase.name,
            color: phase.color,
            startDate,
            endDate,
          });
        }
      }

      return {
        id: index + 1,
        epicKey: row["Issue key"] || `EPIC-${index + 1}`,
        epicName: row["Summary"] || "Unnamed Epic",
        status: row["Status"] || "",
        phases,
        rawData: row,
      };
    })
    .filter((epic) => epic.phases.length > 0);
}

export function extractColumns(rows: RawRow[]): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).filter((col) => col.trim() !== "");
}

export function extractUniqueValues(
  rows: RawRow[],
  column: string
): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const val = row[column];
    if (val && val.trim()) {
      values.add(val.trim());
    }
  }
  return Array.from(values).sort();
}
