// Pure computations extracted from src/components/GanttChart.tsx.
// Same behavior as the React source; `today`/`now` are injectable for tests.
import { parseJiraDate } from "./transform.js";

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

export const ROW_HEIGHT = 52;
export const BAR_HEIGHT = 24;
export const BAR_TOP = (ROW_HEIGHT - BAR_HEIGHT) / 2;
export const TIMELINE_MARGIN = 20;
export const HEADER_ROW_HEIGHT = 24;

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

/**
 * Flags epics whose Estimated Delivery Date falls before their Customer
 * UAT phase even starts — a scheduling inconsistency (delivery can't
 * reasonably precede the UAT that validates it). Epics with no EDD or no
 * scheduled UAT phase are skipped (nothing to compare).
 */
export function detectEddIssues(tasks) {
  const result = new Map();

  for (const epic of tasks) {
    const eddRaw = epic.rawData["Custom field (Estimated Delivery Date)"];
    const edd = eddRaw ? parseJiraDate(eddRaw) : null;
    if (!edd) continue;

    const uat = epic.phases.find((p) => p.phaseName === "Customer UAT");
    if (!uat) continue;

    if (toDayValue(edd) < toDayValue(uat.startDate)) {
      result.set(epic.id, {
        epicId: epic.id,
        details: [`Estimated delivery ${edd.toLocaleDateString("en-GB")} is before Customer UAT starts ${uat.startDate.toLocaleDateString("en-GB")}`],
      });
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
      // start/end are the true (unclipped) calendar month bounds — used for
      // the NRR forecast tooltip, which needs the whole period, not just
      // the visible slice.
      subs.push({ label: config.subFormat(cursor), left: ml, width: mr - ml, start: monthStart, end: monthEnd });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (zoom === "week") {
    const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cursor <= maxDate) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const ml = dayOffset(cursor < minDate ? minDate : cursor);
      const mr = dayOffset(monthEnd > maxDate ? maxDate : monthEnd);
      mains.push({ label: config.headerFormat(cursor), left: ml, width: mr - ml, start: monthStart, end: monthEnd });
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
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const ml = dayOffset(cursor < minDate ? minDate : cursor);
      const mr = dayOffset(monthEnd > maxDate ? maxDate : monthEnd);
      mains.push({ label: config.headerFormat(cursor), left: ml, width: mr - ml, start: monthStart, end: monthEnd });
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
    qtrs.push({
      label: `Q${Math.floor(qCursor.getMonth() / 3) + 1}`, left: ql, width: qr - ql,
      start: new Date(qCursor), end: qEnd,
    });
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

// Maps each timeline phase to the JIRA "Budget Hours <discipline>" field(s)
// that represent its share of the project's effort. "Budget Hours DOC" has
// no phase of its own, so it's folded into Pilot — the last phase in
// PHASE_ORDER — which guarantees the cumulative weight reaches exactly
// 100% once Pilot is accounted for.
const PHASE_BUDGET_FIELDS = {
  "Analysis": ["Custom field (Budget Hours CO)"],
  "Development": ["Custom field (Budget Hours DEV)"],
  "QA / Test": ["Custom field (Budget Hours Tester)"],
  "Customer UAT": ["Custom field (Budget Hours UAT)"],
  "Pilot": ["Custom field (Budget Hours Pilot)", "Custom field (Budget Hours DOC)"],
};

/** Sums each phase's mapped Budget Hours field(s). Returns null total <= 0. */
function computePhaseHours(epic) {
  const hoursByPhase = {};
  let total = 0;
  for (const [phaseName, fields] of Object.entries(PHASE_BUDGET_FIELDS)) {
    let hours = 0;
    for (const field of fields) {
      const raw = epic.rawData[field];
      const val = raw && raw.trim() ? parseFloat(raw) : NaN;
      if (!isNaN(val) && val > 0) hours += val;
    }
    if (hours > 0) {
      hoursByPhase[phaseName] = hours;
      total += hours;
    }
  }
  return { hoursByPhase, total };
}

/**
 * Project completion %, weighted by each phase's share of budgeted effort.
 * A finished phase (end date passed) counts fully toward its weight; the
 * phase currently underway counts pro-rata by elapsed days; future or
 * unscheduled phases count 0. Returns null when no budget hours are set.
 */
export function computeWeightedProgress(epic, today = new Date()) {
  const { hoursByPhase, total } = computePhaseHours(epic);
  if (total <= 0) return null;

  const todayVal = toDayValue(today);
  let progress = 0;
  for (const [phaseName, hours] of Object.entries(hoursByPhase)) {
    const weight = hours / total;
    const phase = epic.phases.find((p) => p.phaseName === phaseName);
    let fraction = 0;
    if (phase) {
      const startVal = toDayValue(phase.startDate);
      const endVal = toDayValue(phase.endDate);
      if (todayVal >= endVal) fraction = 1;
      else if (todayVal >= startVal) {
        const duration = endVal - startVal;
        fraction = duration > 0 ? (todayVal - startVal) / duration : 1;
      }
    }
    progress += weight * fraction;
  }
  return Math.round(progress * 100);
}

/**
 * Cumulative share of the project's total budgeted effort completed once
 * each phase, in turn, finishes: phase N's value = its own weight plus
 * every earlier phase's weight (in PHASE_ORDER). Unlike
 * computeWeightedProgress, this ignores dates entirely — it's a static
 * "how much of the project does finishing this step represent" figure.
 * Returns null when no budget hours are set anywhere on the epic.
 */
export function computePhaseCumulativeWeights(epic) {
  const { hoursByPhase, total } = computePhaseHours(epic);
  if (total <= 0) return null;

  const cumulative = {};
  let running = 0;
  for (const phaseName of PHASE_ORDER) {
    running += (hoursByPhase[phaseName] || 0) / total;
    cumulative[phaseName] = Math.round(running * 100);
  }
  return cumulative;
}

/**
 * A single phase's own share of the project's total budgeted effort —
 * not cumulative, not time-prorated. E.g. if Development is 40% of the
 * total budgeted hours, this returns 40 regardless of what came before
 * it or how far along it is. Returns null when no budget hours are set
 * anywhere on the epic.
 */
export function computePhaseWeight(epic, phaseName) {
  const { hoursByPhase, total } = computePhaseHours(epic);
  if (total <= 0) return null;
  return Math.round(((hoursByPhase[phaseName] || 0) / total) * 100);
}

/**
 * A single phase's own budgeted effort, in days (÷ 8h). Like
 * computePhaseWeight, this is per-step — not the epic's total workload
 * across all disciplines. Returns null when that phase has no budgeted
 * hours (whether or not other phases do).
 */
export function computePhaseWorkloadDays(epic, phaseName) {
  const { hoursByPhase } = computePhaseHours(epic);
  const hours = hoursByPhase[phaseName];
  if (!hours) return null;
  const days = hours / 8;
  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}

// Maps each timeline phase to the JIRA "Budget Price <discipline>" field
// that represents its own cost. DOC and PM have no phase of their own —
// unlike Budget Hours DOC, they are NOT folded into Pilot; see
// computePhasePrices, which splits them evenly across all 5 phases.
const PHASE_PRICE_FIELDS = {
  "Analysis": ["Custom field (Budget Price CO)"],
  "Development": ["Custom field (Budget Price DEV)"],
  "QA / Test": ["Custom field (Budget Price Tester)"],
  "Customer UAT": ["Custom field (Budget Price UAT)"],
  "Pilot": ["Custom field (Budget Price Pilot)"],
};

const DOC_PM_PRICE_FIELDS = ["Custom field (Budget Price DOC)", "Custom field (Budget Price PM)"];

/**
 * Sums each phase's own Budget Price field, then spreads Budget Price
 * DOC + PM evenly across all 5 phases (1/5 each) — they represent
 * project-wide overhead, not work tied to any single phase.
 */
function computePhasePrices(epic) {
  const priceByPhase = {};
  for (const [phaseName, fields] of Object.entries(PHASE_PRICE_FIELDS)) {
    let total = 0;
    let any = false;
    for (const field of fields) {
      const raw = epic.rawData[field];
      const val = raw && raw.trim() ? parseFloat(raw) : NaN;
      if (!isNaN(val) && val > 0) { total += val; any = true; }
    }
    if (any) priceByPhase[phaseName] = total;
  }

  let docPm = 0;
  for (const field of DOC_PM_PRICE_FIELDS) {
    const raw = epic.rawData[field];
    const val = raw && raw.trim() ? parseFloat(raw) : NaN;
    if (!isNaN(val) && val > 0) docPm += val;
  }
  if (docPm > 0) {
    const share = docPm / PHASE_ORDER.length;
    for (const name of PHASE_ORDER) {
      priceByPhase[name] = (priceByPhase[name] || 0) + share;
    }
  }

  return priceByPhase;
}

/**
 * A single phase's own budgeted cost, summed across its mapped Budget
 * Price field(s). Returns null when that phase has no budgeted price.
 */
export function computePhasePrice(epic, phaseName) {
  if (!PHASE_PRICE_FIELDS[phaseName]) return null;
  const priceByPhase = computePhasePrices(epic);
  return priceByPhase[phaseName] ?? null;
}

/**
 * Cumulative budgeted cost through PHASE_ORDER, keyed by phase name: each
 * phase's value is its own price plus every earlier phase's price — the
 * running total once that phase finishes. Mirrors
 * computePhaseCumulativeWeights but in € rather than %. Returns null when
 * no phase has a budgeted price anywhere.
 */
export function computePhasePriceCumulative(epic) {
  const priceByPhase = computePhasePrices(epic);
  if (Object.keys(priceByPhase).length === 0) return null;

  const cumulative = {};
  let running = 0;
  for (const name of PHASE_ORDER) {
    running += priceByPhase[name] || 0;
    cumulative[name] = running;
  }
  return cumulative;
}

/**
 * NRR forecast for a calendar period (a month or a quarter): the sum,
 * across every non-initiative row, of each phase's own Budget Price
 * pro-rated by how much of that phase's own duration falls inside the
 * period. A phase entirely outside the period contributes 0; one fully
 * inside contributes its whole price; one straddling the boundary
 * contributes a fraction (overlapping days ÷ the phase's total days).
 * periodEnd is exclusive (e.g. the 1st of the next month).
 */
export function computePeriodForecast(rows, periodStart, periodEnd) {
  const periodStartDay = toDayValue(periodStart);
  const periodEndDay = toDayValue(periodEnd);
  let total = 0;
  for (const row of rows) {
    if (row.type === "initiative") continue;
    const epic = row.epic;
    for (const phase of epic.phases) {
      const price = computePhasePrice(epic, phase.phaseName);
      if (price === null) continue;
      const phaseStartDay = toDayValue(phase.startDate);
      const phaseEndDay = toDayValue(phase.endDate) + 1; // exclusive
      const overlap = Math.min(phaseEndDay, periodEndDay) - Math.max(phaseStartDay, periodStartDay);
      if (overlap <= 0) continue;
      const totalDays = phaseEndDay - phaseStartDay;
      total += price * (overlap / totalDays);
    }
  }
  return total;
}

/**
 * Prefer JIRA's own "% of progress" field (the team's actual reported
 * completion) over the charge-weighted, date-based estimate — the
 * schedule can say a phase "should" be 93% done while the real reported
 * progress is 60%. Fall back to the weighted estimate only when the epic
 * has no raw progress value at all.
 */
export function getDisplayProgress(epic, today = new Date()) {
  const raw = epic.rawData["Custom field (% of progress)"];
  if (raw && raw.trim()) {
    const val = Math.round(parseFloat(raw));
    if (!isNaN(val)) return val;
  }
  return computeWeightedProgress(epic, today);
}

export function getCellText(epic, col, isInitiative) {
  if (isInitiative && col !== "epicName" && col !== "progress") return "";
  switch (col) {
    case "product": return epic.rawData["Custom field (Product)"] || "";
    case "acto": return epic.epicKey || "";
    case "epicName": return epic.epicName || "";
    case "status": return epic.status || "";
    case "progress": {
      if (isInitiative) return "";
      const val = getDisplayProgress(epic);
      return val === null ? "" : String(val);
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
  showInconsistencies, showAlerts, showEddIssues, phaseFilter, colFilters,
  sortCol, sortDir, inconsistencies, alerts, eddIssues, today = new Date(),
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
  if (showEddIssues) {
    rows = rows.filter((r) => {
      if (r.type === "initiative") {
        return r.children?.some((c) => eddIssues.has(c.id));
      }
      return eddIssues.has(r.epic.id);
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
