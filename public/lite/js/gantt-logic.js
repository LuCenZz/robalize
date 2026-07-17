// Pure computations extracted from src/components/GanttChart.tsx.
// Same behavior as the React source; `today`/`now` are injectable for tests.

export const ZOOM_CONFIG = {
  day: {
    dayWidth: 30,
    headerFormat: (d) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
    subFormat: (d) => String(d.getDate()),
    subUnit: "day",
  },
  week: {
    dayWidth: 8,
    headerFormat: (d) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
    subFormat: (d) => `W${getWeekNumber(d)}`,
    subUnit: "week",
  },
  month: {
    dayWidth: 3,
    headerFormat: (d) => String(d.getFullYear()),
    subFormat: (d) => d.toLocaleDateString("en-GB", { month: "short" }),
    subUnit: "day",
  },
  quarter: {
    dayWidth: 1.2,
    headerFormat: (d) => String(d.getFullYear()),
    subFormat: (d) => d.toLocaleDateString("en-GB", { month: "short" }),
    subUnit: "day",
  },
};

export const ROW_HEIGHT = 40;
export const BAR_HEIGHT = 20;
export const BAR_TOP = (ROW_HEIGHT - BAR_HEIGHT) / 2;
export const TIMELINE_MARGIN = 20;

// Expected phase order: each phase must start after the previous one starts,
// and must start after the previous one ends.
const PHASE_ORDER = ["Analysis", "Development", "QA / Test", "Customer UAT", "Pilot"];

export function toDayValue(d) {
  return Math.floor(d.getTime() / 86400000);
}

export function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function detectInconsistencies(tasks) {
  const result = new Map();

  for (const epic of tasks) {
    const phaseMap = new Map(epic.phases.map((p) => [p.phaseName, p]));
    const presentPhases = PHASE_ORDER.filter((name) => phaseMap.has(name));
    const conflicts = new Set();
    const details = [];

    for (let i = 0; i < presentPhases.length - 1; i++) {
      const current = phaseMap.get(presentPhases[i]);
      const next = phaseMap.get(presentPhases[i + 1]);

      const curStart = toDayValue(current.startDate);
      const curEnd = toDayValue(current.endDate);
      const nextStart = toDayValue(next.startDate);

      // Rule 1: next phase starts before current phase starts
      if (nextStart < curStart) {
        conflicts.add(current.phaseName);
        conflicts.add(next.phaseName);
        details.push(`${next.phaseName} starts before ${current.phaseName} starts`);
      }

      // Rule 2: next phase starts strictly before current phase ends (same day is OK)
      if (nextStart < curEnd) {
        conflicts.add(current.phaseName);
        conflicts.add(next.phaseName);
        details.push(`${next.phaseName} starts before ${current.phaseName} ends`);
      }
    }

    if (conflicts.size > 0) {
      result.set(epic.id, { epicId: epic.id, conflictingPhases: conflicts, details });
    }
  }

  return result;
}

/**
 * Detect status/date mismatches based on today's date.
 * Same rules as GanttChart.tsx detectAlerts.
 */
export function detectAlerts(tasks, today = new Date()) {
  const result = new Map();
  const todayVal = toDayValue(today);

  const PRE_ANALYSIS = ["Backlog", "Scoping RFC", "In definition", "To Do"];
  const PRE_DEV = ["Backlog", "Scoping RFC", "In definition", "To Do"];
  const PRE_UAT = ["Backlog", "Scoping RFC", "In definition", "To Do", "In Progress"];

  for (const epic of tasks) {
    const phaseMap = new Map(epic.phases.map((p) => [p.phaseName, p]));
    const status = epic.status.trim();
    const details = [];

    const analysis = phaseMap.get("Analysis");
    if (analysis && toDayValue(analysis.endDate) < todayVal && PRE_ANALYSIS.includes(status)) {
      details.push(`Analysis ended ${analysis.endDate.toLocaleDateString("en-GB")} but status is still "${status}"`);
    }

    const dev = phaseMap.get("Development");
    if (dev && toDayValue(dev.startDate) < todayVal && PRE_DEV.includes(status)) {
      details.push(`Development started ${dev.startDate.toLocaleDateString("en-GB")} but status is still "${status}"`);
    }

    const qa = phaseMap.get("QA / Test");
    if (qa && toDayValue(qa.startDate) < todayVal && PRE_DEV.includes(status)) {
      details.push(`QA started ${qa.startDate.toLocaleDateString("en-GB")} but status is still "${status}"`);
    }

    const uat = phaseMap.get("Customer UAT");
    if (uat && toDayValue(uat.startDate) < todayVal && PRE_UAT.includes(status)) {
      details.push(`Customer UAT started ${uat.startDate.toLocaleDateString("en-GB")} but status is still "${status}"`);
    }

    const pilot = phaseMap.get("Pilot");
    if (pilot && toDayValue(pilot.startDate) < todayVal && PRE_UAT.includes(status)) {
      details.push(`Pilot started ${pilot.startDate.toLocaleDateString("en-GB")} but status is still "${status}"`);
    }

    if (details.length > 0) {
      result.set(epic.id, { epicId: epic.id, details });
    }
  }

  return result;
}

// Global date range — clamped to reasonable bounds, always covering the
// current year, padded by 14 days on each side.
export function computeDateRange(tasks, now = new Date()) {
  const lowerBound = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const upperBound = new Date(now.getFullYear() + 2, now.getMonth(), 1);

  let min = null;
  let max = null;
  for (const task of tasks) {
    for (const phase of task.phases) {
      const s = phase.startDate < lowerBound ? lowerBound : phase.startDate;
      const e = phase.endDate > upperBound ? upperBound : phase.endDate;
      if (!min || s < min) min = s;
      if (!max || e > max) max = e;
    }
  }
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  if (!min || yearStart < min) min = yearStart;
  if (!max || yearEnd > max) max = yearEnd;

  const pad = 14;
  const minD = new Date(min.getFullYear(), min.getMonth(), min.getDate() - pad);
  const maxD = new Date(max.getFullYear(), max.getMonth(), max.getDate() + pad);
  return { minDate: minD, maxDate: maxD };
}

// UTC-based day arithmetic keeps positions DST-safe.
export function makeDayOffset(minDate, dayWidth) {
  const utc0 = Date.UTC(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
  return function dayOffset(date) {
    const utc1 = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return TIMELINE_MARGIN + ((utc1 - utc0) / 86400000) * dayWidth;
  };
}

export function buildTimelineHeaders({ minDate, maxDate, zoom, dayOffset }) {
  const config = ZOOM_CONFIG[zoom];
  const mains = [];
  const subs = [];

  if (zoom === "quarter") {
    // Quarter view: no main/sub headers beyond Year+Quarter
  } else if (zoom === "month") {
    const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cursor <= maxDate) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const ml = dayOffset(monthStart < minDate ? minDate : monthStart);
      const mr = dayOffset(monthEnd > maxDate ? maxDate : monthEnd);
      subs.push({ label: config.subFormat(cursor), left: ml, width: mr - ml });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (zoom === "week") {
    const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cursor <= maxDate) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const ml = dayOffset(cursor < minDate ? minDate : cursor);
      const mr = dayOffset(monthEnd > maxDate ? maxDate : monthEnd);
      mains.push({ label: config.headerFormat(cursor), left: ml, width: mr - ml });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const weekCursor = new Date(minDate);
    weekCursor.setDate(weekCursor.getDate() - weekCursor.getDay() + 1);
    while (weekCursor <= maxDate) {
      const weekEnd = new Date(weekCursor);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const wl = dayOffset(weekCursor < minDate ? minDate : weekCursor);
      const wr = dayOffset(weekEnd > maxDate ? maxDate : weekEnd);
      subs.push({ label: `W${getWeekNumber(weekCursor)}`, left: wl, width: wr - wl });
      weekCursor.setDate(weekCursor.getDate() + 7);
    }
  } else {
    // Day: Main: months, Sub: days
    const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cursor <= maxDate) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const ml = dayOffset(cursor < minDate ? minDate : cursor);
      const mr = dayOffset(monthEnd > maxDate ? maxDate : monthEnd);
      mains.push({ label: config.headerFormat(cursor), left: ml, width: mr - ml });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const dayCursor = new Date(minDate);
    while (dayCursor <= maxDate) {
      const dl = dayOffset(dayCursor);
      subs.push({ label: String(dayCursor.getDate()), left: dl, width: config.dayWidth });
      dayCursor.setDate(dayCursor.getDate() + 1);
    }
  }

  // Year headers (always top row)
  const yrs = [];
  const yCursor = new Date(minDate.getFullYear(), 0, 1);
  while (yCursor <= maxDate) {
    const yearStart = new Date(yCursor.getFullYear(), 0, 1);
    const yearEnd = new Date(yCursor.getFullYear() + 1, 0, 1);
    const yl = dayOffset(yearStart < minDate ? minDate : yearStart);
    const yr = dayOffset(yearEnd > maxDate ? maxDate : yearEnd);
    yrs.push({ label: String(yCursor.getFullYear()), left: yl, width: yr - yl });
    yCursor.setFullYear(yCursor.getFullYear() + 1);
  }

  // Quarter headers (always second row, just Q1/Q2/Q3/Q4)
  const qtrs = [];
  const qCursor = new Date(minDate.getFullYear(), Math.floor(minDate.getMonth() / 3) * 3, 1);
  while (qCursor <= maxDate) {
    const qEnd = new Date(qCursor.getFullYear(), qCursor.getMonth() + 3, 1);
    const ql = dayOffset(qCursor < minDate ? minDate : qCursor);
    const qr = dayOffset(qEnd > maxDate ? maxDate : qEnd);
    qtrs.push({ label: `Q${Math.floor(qCursor.getMonth() / 3) + 1}`, left: ql, width: qr - ql });
    qCursor.setMonth(qCursor.getMonth() + 3);
  }

  return { yearHeaders: yrs, quarterHeaders: qtrs, mainHeaders: mains, subHeaders: subs };
}

export function computeWeekLines(minDate, maxDate, dayOffset) {
  const lines = [];
  const cursor = new Date(minDate);
  // Advance to next Monday
  cursor.setDate(cursor.getDate() + ((8 - cursor.getDay()) % 7));
  while (cursor <= maxDate) {
    lines.push(dayOffset(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return lines;
}

export function getCellText(epic, col, isInitiative) {
  if (isInitiative && col !== "epicName" && col !== "progress") return "";
  switch (col) {
    case "product": return epic.rawData["Custom field (Product)"] || "";
    case "acto": return epic.epicKey || "";
    case "epicName": return epic.epicName || "";
    case "status": return epic.status || "";
    case "progress": {
      const raw = epic.rawData["Custom field (% of progress)"];
      if (!raw || !raw.trim()) return "";
      const val = Math.round(parseFloat(raw));
      return isNaN(val) ? "" : String(val);
    }
    default: return "";
  }
}

function isInPhaseToday(epic, phaseName, today) {
  const phase = epic.phases.find((p) => p.phaseName === phaseName);
  if (!phase) return false;
  return today >= phase.startDate && today <= phase.endDate;
}

export function applyGanttRowFilters(displayRows, {
  showInconsistencies, showAlerts, phaseFilter, colFilters,
  sortCol, sortDir, inconsistencies, alerts, today = new Date(),
}) {
  let rows = displayRows;

  if (showInconsistencies) {
    rows = rows.filter((r) => {
      if (r.type === "initiative") {
        return r.children?.some((c) => inconsistencies.has(c.id));
      }
      return inconsistencies.has(r.epic.id);
    });
  }
  if (showAlerts) {
    rows = rows.filter((r) => {
      if (r.type === "initiative") {
        return r.children?.some((c) => alerts.has(c.id));
      }
      return alerts.has(r.epic.id);
    });
  }
  if (phaseFilter) {
    rows = rows.filter((r) => {
      if (r.type === "initiative") {
        return r.children?.some((c) => isInPhaseToday(c, phaseFilter, today));
      }
      return isInPhaseToday(r.epic, phaseFilter, today);
    });
  }

  // Apply column quick filters
  for (const [col, values] of Object.entries(colFilters)) {
    if (values.size === 0) continue;
    rows = rows.filter((r) => {
      if (r.type === "initiative") {
        return r.children?.some((c) => values.has(getCellText(c, col, false)));
      }
      return values.has(getCellText(r.epic, col, false));
    });
  }

  // Apply sort — keep initiative + children groups together
  if (sortCol && sortDir) {
    const col = sortCol;
    const dir = sortDir === "asc" ? 1 : -1;

    const groups = [];
    let i = 0;
    while (i < rows.length) {
      if (rows[i].type === "initiative") {
        const group = [rows[i]];
        const initKey = rows[i].initiativeKey;
        i++;
        while (i < rows.length && rows[i].type === "epic" && rows[i].initiativeKey === initKey) {
          group.push(rows[i]);
          i++;
        }
        groups.push(group);
      } else {
        groups.push([rows[i]]);
        i++;
      }
    }

    groups.sort((ga, gb) => {
      const a = ga[0];
      const b = gb[0];
      const ta = getCellText(a.epic, col, a.type === "initiative").toLowerCase();
      const tb = getCellText(b.epic, col, b.type === "initiative").toLowerCase();
      if (col === "progress") {
        const na = parseFloat(ta) || 0;
        const nb = parseFloat(tb) || 0;
        return (na - nb) * dir;
      }
      return ta < tb ? -dir : ta > tb ? dir : 0;
    });

    rows = groups.flat();
  }

  return rows;
}
