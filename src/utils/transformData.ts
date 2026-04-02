import type { RawRow, EpicTask, PhaseSegment, DisplayRow } from "../types";
import { PHASE_CONFIG } from "../types";

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

  // Try "DD/Mon/YY HH:MM AM/PM" format (e.g., "30/Mar/26 12:00 AM")
  const slashedWithTime = trimmed.match(
    /^(\d{1,2})\/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\/(\d{2,4})\s+/i
  );
  if (slashedWithTime) {
    const year =
      slashedWithTime[3].length === 2 ? `20${slashedWithTime[3]}` : slashedWithTime[3];
    const parsed = new Date(`${slashedWithTime[2]} ${slashedWithTime[1]}, ${year}`);
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
    .sort((a, b) => {
      // Epics with phases first, sorted by earliest start
      if (a.phases.length > 0 && b.phases.length > 0) {
        return getEarliestPhaseStart(a) - getEarliestPhaseStart(b);
      }
      if (a.phases.length > 0) return -1;
      if (b.phases.length > 0) return 1;
      // Both without phases: sort alphabetically
      return a.epicKey.localeCompare(b.epicKey);
    });
}

const PHASE_PRIORITY = ["Analysis", "Development", "QA / Test", "Customer UAT", "Pilot"];

/** Get the start date of the earliest phase in priority order */
function getEarliestPhaseStart(epic: EpicTask): number {
  for (const name of PHASE_PRIORITY) {
    const phase = epic.phases.find((p) => p.phaseName === name);
    if (phase) return phase.startDate.getTime();
  }
  return epic.phases[0].startDate.getTime();
}

export function buildDisplayRows(epicTasks: EpicTask[]): DisplayRow[] {
  const rows: DisplayRow[] = [];
  const grouped = new Map<string, { name: string; children: EpicTask[] }>();
  const orphans: EpicTask[] = [];

  for (const epic of epicTasks) {
    const parentKey = (epic.rawData["Parent key"] || "").trim();
    const parentName = (epic.rawData["Parent summary"] || "").trim();
    if (parentKey) {
      const group = grouped.get(parentKey) || { name: parentName, children: [] };
      group.children.push(epic);
      grouped.set(parentKey, group);
    } else {
      orphans.push(epic);
    }
  }

  // Build initiative rows with children
  for (const [key, group] of grouped) {
    // Create a synthetic initiative epic with phases spanning all children
    const allPhases: PhaseSegment[] = [];
    for (const child of group.children) {
      for (const phase of child.phases) {
        allPhases.push(phase);
      }
    }

    const initiativeEpic: EpicTask = {
      id: -Math.abs(hashCode(key)),
      epicKey: key,
      epicName: group.name || key,
      status: "",
      phases: allPhases,
      rawData: group.children[0]?.rawData || {},
    };

    rows.push({
      type: "initiative",
      epic: initiativeEpic,
      initiativeKey: key,
      initiativeName: group.name || key,
      children: group.children,
    });

    for (const child of group.children) {
      rows.push({ type: "epic", epic: child, initiativeKey: key });
    }
  }

  // Orphan epics (no parent)
  for (const epic of orphans) {
    rows.push({ type: "epic", epic });
  }

  return rows;
}

function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash;
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
