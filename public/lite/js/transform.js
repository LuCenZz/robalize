// Port of src/utils/transformData.ts + PHASE_CONFIG from src/types/index.ts.
// Logic must stay identical to the TypeScript source.

// Phase hues match the original app but are recalibrated to a harmonized,
// professional ramp (aligned saturation/lightness).
export const PHASE_CONFIG = [
  { name: "Analysis", color: "#E3B23C", startCol: "Custom field (Analysis Start Date)", endCol: "Custom field (Analysis End Date)" },
  { name: "Development", color: "#E2854B", startCol: "Custom field (Development Start Date)", endCol: "Custom field (Development End Date)" },
  { name: "QA / Test", color: "#55A46F", startCol: "Custom field (QA Start Date)", endCol: "Custom field (QA End Date)" },
  { name: "Customer UAT", color: "#4A8ED6", startCol: "Custom field (Customer UAT Start Date)", endCol: "Custom field (Customer UAT End Date)" },
  { name: "Pilot", color: "#3A5C96", startCol: "Custom field (Pilot Start Date)", endCol: "Custom field (Pilot End Date)" },
];

const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parseJiraDate(value) {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();

  const dmy = trimmed.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i);
  if (dmy) {
    const month = MONTH_INDEX[dmy[2].toLowerCase().substring(0, 3)];
    if (month !== undefined) return new Date(parseInt(dmy[3]), month, parseInt(dmy[1]));
  }

  const slashedWithTime = trimmed.match(/^(\d{1,2})\/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\/(\d{2,4})\s+/i);
  if (slashedWithTime) {
    const year = slashedWithTime[3].length === 2 ? 2000 + parseInt(slashedWithTime[3]) : parseInt(slashedWithTime[3]);
    const month = MONTH_INDEX[slashedWithTime[2].toLowerCase().substring(0, 3)];
    if (month !== undefined) return new Date(year, month, parseInt(slashedWithTime[1]));
  }

  const slashed = trimmed.match(/^(\d{1,2})\/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\/(\d{2,4})$/i);
  if (slashed) {
    const year = slashed[3].length === 2 ? 2000 + parseInt(slashed[3]) : parseInt(slashed[3]);
    const month = MONTH_INDEX[slashed[2].toLowerCase().substring(0, 3)];
    if (month !== undefined) return new Date(year, month, parseInt(slashed[1]));
  }

  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime()))
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());

  return null;
}

export function transformToEpicTasks(rows) {
  return rows
    .map((row, index) => {
      const phases = [];
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
      if (a.phases.length > 0 && b.phases.length > 0) {
        return getEarliestPhaseStart(a) - getEarliestPhaseStart(b);
      }
      if (a.phases.length > 0) return -1;
      if (b.phases.length > 0) return 1;
      return a.epicKey.localeCompare(b.epicKey);
    });
}

const PHASE_PRIORITY = ["Analysis", "Development", "QA / Test", "Customer UAT", "Pilot"];

function getEarliestPhaseStart(epic) {
  for (const name of PHASE_PRIORITY) {
    const phase = epic.phases.find((p) => p.phaseName === name);
    if (phase) return phase.startDate.getTime();
  }
  return epic.phases[0].startDate.getTime();
}

export function buildDisplayRows(epicTasks) {
  const rows = [];
  const grouped = new Map();
  const orphans = [];

  const byKey = new Map();
  for (const epic of epicTasks) {
    byKey.set(epic.epicKey, epic);
  }

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

  const initiativeKeys = new Set();

  for (const [key, group] of grouped) {
    initiativeKeys.add(key);

    const allPhases = [];
    for (const child of group.children) {
      for (const phase of child.phases) {
        allPhases.push(phase);
      }
    }

    const initiativeRow = byKey.get(key);
    const rawData = initiativeRow?.rawData || group.children[0]?.rawData || {};

    const initiativeEpic = {
      id: -Math.abs(hashCode(key)),
      epicKey: key,
      epicName: group.name || key,
      status: initiativeRow?.status || "",
      phases: allPhases,
      rawData,
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

  for (const epic of orphans) {
    if (!initiativeKeys.has(epic.epicKey)) {
      rows.push({ type: "epic", epic });
    }
  }

  return rows;
}

function hashCode(s) {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash;
}

export function extractColumns(rows) {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).filter((col) => col.trim() !== "");
}

export function extractUniqueValues(rows, column) {
  const values = new Set();
  for (const row of rows) {
    const val = row[column];
    if (val && val.trim()) {
      values.add(val.trim());
    }
  }
  return Array.from(values).sort();
}
