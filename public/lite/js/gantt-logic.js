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

// Statuses that mean an epic has definitively moved past both Development
// and QA / Test (into Pilot, or fully closed). "Pending Customer/Internal
// UAT" are adjacent-to-QA statuses, not clearly past it, so excluded.
const PAST_DEV_QA_STATUSES = new Set(["in pilot", "done", "ceased"]);

export function toDayValue(d) {
  return Math.floor(d.getTime() / 86400000);
}

export function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Render bounds for a row's phase bars: when two consecutive phases (in
 * array/workflow order) overlap, the shared window is split down the
 * middle — the earlier phase's bar is clipped to end at the midpoint, the
 * later phase's bar starts there — so both colors stay visible instead of
 * the later phase's box painting fully over the earlier one. Only the
 * returned {startDate, endDate} are adjusted; the underlying `phase`
 * objects (and their real dates, used everywhere else — tooltips, %
 * calcs) are untouched.
 */
export function resolvePhaseRenderBounds(phases) {
  const bounds = phases.map((p) => ({ start: p.startDate, end: p.endDate }));
  for (let i = 0; i < phases.length - 1; i++) {
    const a = bounds[i];
    const b = bounds[i + 1];
    if (a.end > b.start) {
      const overlapEnd = a.end < b.end ? a.end : b.end;
      const mid = new Date((b.start.getTime() + overlapEnd.getTime()) / 2);
      a.end = mid;
      b.start = mid;
    }
  }
  return phases.map((phase, i) => ({ phase, startDate: bounds[i].start, endDate: bounds[i].end }));
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

    // The reverse mismatch: status already says we're past Dev/QA, but the
    // phase's own dates haven't closed out — see isPhaseForecastUnreliable.
    for (const phase of epic.phases) {
      if (isPhaseForecastUnreliable(epic, phase, today)) {
        details.push(
          `${phase.phaseName} runs through ${phase.endDate.toLocaleDateString("en-GB")} but status is already "${status}" — NRR forecast excluded, check manually`
        );
      }
    }

    if (details.length > 0) {
      result.set(epic.id, { epicId: epic.id, details });
    }
  }

  return result;
}

/**
 * True when a Development/QA phase's own dates can't be trusted for NRR
 * forecasting: the epic's status already says work moved past both
 * Development and QA (In Pilot, Done, Ceased), yet this phase hasn't
 * "closed out" as of today (its end date is still today or later) — a
 * sign the phase's dates are stale (never updated) rather than a real,
 * ongoing rebuild of already-finished work. Whatever story-point real %
 * exists for it can't be trusted to compute NRR in that case (see
 * computePeriodForecast, which excludes these phases entirely).
 */
export function isPhaseForecastUnreliable(epic, phase, today = new Date()) {
  if (phase.phaseName !== "Development" && phase.phaseName !== "QA / Test") return false;
  const status = (epic.status || "").trim().toLowerCase();
  if (!PAST_DEV_QA_STATUSES.has(status)) return false;
  return toDayValue(phase.endDate) >= toDayValue(today);
}

/**
 * Flags epics whose Estimated Delivery Date doesn't exactly match their
 * Customer UAT phase's start date — the two are supposed to be the same
 * date, so any difference (EDD earlier OR later than UAT start) is a
 * scheduling inconsistency worth surfacing. Epics with no EDD or no
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

    if (toDayValue(edd) !== toDayValue(uat.startDate)) {
      result.set(epic.id, {
        epicId: epic.id,
        details: [`Estimated delivery ${edd.toLocaleDateString("en-GB")} does not match Customer UAT start ${uat.startDate.toLocaleDateString("en-GB")}`],
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
 *
 * Development and QA / Test are the two phases with a real, reported
 * completion % (from Story/Testing Story Points — see
 * computeStoryMetrics). When storyMetrics is supplied, those two phases
 * stop pro-rating their *full* price across their *full* scheduled span.
 * Instead, for whichever period contains "today" (the current month or
 * quarter — past periods and future periods are untouched), the
 * contribution is the sum of:
 *   (a) real, already-recognized progress that — assuming a constant pace
 *       since the phase started — falls within that period (so if the
 *       phase itself started this period, all of the progress made so far
 *       counts), and
 *   (b) the still-unrecognized remainder (price × (1 − real%)), spread
 *       across the remaining days (today through the phase's end — or,
 *       if the phase is already overdue against that real %, treated as
 *       fully outstanding right now).
 * A period entirely before today only ever sees (b)'s forecast (which is
 * always 0 there, since it starts at today); a period entirely after
 * today only ever sees (b) too (nothing has been "recognized" there yet).
 * Other phases (Analysis, Customer UAT, Pilot) have no such real-progress
 * signal and keep the plain date pro-ration.
 *
 * Development/QA phases flagged by isPhaseForecastUnreliable (status
 * already past both Dev and QA, but this phase's own dates haven't closed
 * out) are excluded entirely — contribute 0, rather than let a stale date
 * range attribute a large, unreliable amount to the wrong period. Those
 * phases' NRR has to be checked manually (see the epic-card tooltip and
 * detectAlerts, which surface a warning for them instead).
 *
 * Analysis/Customer UAT/Pilot have no real-progress signal of their own at
 * all (no linked Story/Testing children), so their plain date pro-ration
 * can't tell whether the epic's overall progress has already moved past
 * what a phase's calendar dates alone would suggest — e.g. a 4-day Pilot
 * phase carrying 70% of the epic's price would otherwise forecast that
 * whole 70% for whichever month it falls in, even when a PM has manually
 * reported the epic as mostly done already, with much less than 70% of
 * its budget actually left. When the epic has a manually-entered "% of
 * progress" (getRawProgressPct — a PM's own figure, an independent signal
 * worth trusting on its own, unlike the schedule-derived fallback
 * computeWeightedProgress falls back to otherwise), each epic's total
 * contribution for this call is capped at its remaining backlog (Order
 * Value × (1 − that %)) — a forecast can never exceed what's actually left
 * to recognize. Epics with no manual % (using the schedule-derived
 * fallback instead) aren't capped this way, since that fallback is itself
 * just another schedule heuristic, no more authoritative than the
 * pro-ration above it.
 */
export function computePeriodForecast(rows, periodStart, periodEnd, storyMetrics = null, today = new Date()) {
  const periodStartDay = toDayValue(periodStart);
  const periodEndDay = toDayValue(periodEnd);
  const todayDay = toDayValue(today);
  let total = 0;
  for (const row of rows) {
    if (row.type === "initiative") continue;
    const epic = row.epic;
    let epicTotal = 0;
    for (const phase of epic.phases) {
      const price = computePhasePrice(epic, phase.phaseName);
      if (price === null) continue;
      if (isPhaseForecastUnreliable(epic, phase, today)) continue;

      const realPct = phase.phaseName === "Development" ? storyMetrics?.dev.get(epic.epicKey)?.pct
        : phase.phaseName === "QA / Test" ? storyMetrics?.qa.get(epic.epicKey)?.pct
        : undefined;

      if (realPct === undefined) {
        const phaseStartDay = toDayValue(phase.startDate);
        const phaseEndDay = toDayValue(phase.endDate) + 1; // exclusive
        const overlap = Math.min(phaseEndDay, periodEndDay) - Math.max(phaseStartDay, periodStartDay);
        if (overlap <= 0) continue;
        const totalDays = phaseEndDay - phaseStartDay;
        epicTotal += price * (overlap / totalDays);
        continue;
      }

      const phaseStartDay = toDayValue(phase.startDate);

      // (a) Already-recognized progress attributable to this period,
      // assuming a constant pace since the phase started. Only non-zero
      // when the period overlaps the [phaseStart, today) window.
      const elapsedSincePhaseStart = todayDay - phaseStartDay;
      if (elapsedSincePhaseStart > 0) {
        const recognizedEndDay = Math.min(todayDay, periodEndDay);
        const recognizedStartDay = Math.max(phaseStartDay, periodStartDay);
        const recognizedOverlap = recognizedEndDay - recognizedStartDay;
        if (recognizedOverlap > 0) {
          epicTotal += price * (realPct / 100) * (recognizedOverlap / elapsedSincePhaseStart);
        }
      }

      // (b) The still-unrecognized remainder, forecast across the
      // remaining days (today through the phase's end).
      const remainder = price * (1 - realPct / 100);
      if (remainder <= 0) continue;
      let remainderStartDay = Math.max(phaseStartDay, todayDay);
      let phaseEndDay = toDayValue(phase.endDate) + 1; // exclusive
      if (phaseEndDay <= remainderStartDay) phaseEndDay = remainderStartDay + 1; // overdue: outstanding as of today
      const overlap = Math.min(phaseEndDay, periodEndDay) - Math.max(remainderStartDay, periodStartDay);
      if (overlap <= 0) continue;
      const totalDays = phaseEndDay - remainderStartDay;
      epicTotal += remainder * (overlap / totalDays);
    }

    if (epicTotal > 0) {
      const rawPct = getRawProgressPct(epic);
      if (rawPct !== null) {
        const cumPrices = computePhasePriceCumulative(epic);
        const orderValue = cumPrices ? cumPrices["Pilot"] : null;
        if (orderValue !== null) {
          const remainingBacklog = Math.max(0, orderValue * (1 - rawPct / 100));
          epicTotal = Math.min(epicTotal, remainingBacklog);
        }
      }
    }
    total += epicTotal;
  }
  return total;
}

/**
 * "This month" breakdown for a single phase, for the epic-card tooltip:
 * how many of its budgeted workload days fall in the current month, what
 * fraction of the phase's own budget that represents, and the € it's
 * worth — all three sharing one ratio so they can never disagree. Just a
 * single-phase, current-month call to computePeriodForecast (which already
 * blends already-recognized progress with the forecast remainder for
 * whichever period contains "today" — see its own doc comment). Returns
 * null when there's nothing to show (no price/workload data, or the phase
 * doesn't reach into this month at all).
 */
export function computePhaseThisMonth(epic, phase, storyMetrics, today = new Date()) {
  const price = computePhasePrice(epic, phase.phaseName);
  if (price === null || price === 0) return null;

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEndExclusive = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nrr = computePeriodForecast(
    [{ type: "epic", epic: { ...epic, phases: [phase] } }], monthStart, monthEndExclusive, storyMetrics, today
  );
  if (nrr <= 0) return null;

  const ratio = nrr / price;
  const workloadDaysRaw = computePhaseWorkloadDays(epic, phase.phaseName);
  const workloadDays = workloadDaysRaw !== null ? parseFloat(workloadDaysRaw) : null;
  return {
    nrr,
    pct: Math.round(ratio * 100),
    days: workloadDays !== null ? Math.round(workloadDays * ratio * 10) / 10 : null,
  };
}

/**
 * Month-by-month NRR forecast for a single phase, for the epic-card
 * tooltip: one entry per calendar month from the current month through
 * the phase's end date (capped at 24 months as a safety bound), each a
 * single-phase call to computePeriodForecast. Months where the phase
 * contributes nothing (0 or negative) are omitted. Returns [] when the
 * phase has no budgeted price.
 */
export function computePhaseMonthlyForecast(epic, phase, storyMetrics, today = new Date()) {
  const price = computePhasePrice(epic, phase.phaseName);
  if (price === null || price === 0) return [];

  const workloadDaysRaw = computePhaseWorkloadDays(epic, phase.phaseName);
  const workloadDays = workloadDaysRaw !== null ? parseFloat(workloadDaysRaw) : null;
  const phaseEndDay = toDayValue(phase.endDate);

  const months = [];
  let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
  for (let i = 0; i < 24 && toDayValue(cursor) <= phaseEndDay; i++) {
    const monthEndExclusive = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const nrr = computePeriodForecast(
      [{ type: "epic", epic: { ...epic, phases: [phase] } }], cursor, monthEndExclusive, storyMetrics, today
    );
    if (nrr > 0) {
      const ratio = nrr / price;
      months.push({
        monthStart: new Date(cursor),
        nrr,
        pct: Math.round(ratio * 100),
        days: workloadDays !== null ? Math.round(workloadDays * ratio * 10) / 10 : null,
      });
    }
    cursor = monthEndExclusive;
  }
  return months;
}

/**
 * Projected completion % at a future checkpoint date: the epic's own
 * displayed % (real reported progress, today) can already be ahead of
 * what the schedule alone would predict for that same date — an epic
 * doesn't regress just because we're asking about the future, so this is
 * the larger of "where we are today" and "where the schedule says we'd
 * be by targetDate". Returns null when neither figure is available.
 */
export function computeProjectedProgress(epic, targetDate, today = new Date()) {
  const current = getDisplayProgress(epic, today);
  const scheduled = computeWeightedProgress(epic, targetDate);
  if (current === null && scheduled === null) return null;
  return Math.max(current ?? 0, scheduled ?? 0);
}

// Real-progress forecast, computed from an epic's Story (Dev) and Testing
// (QA) children instead of the up-front Budget schedule — story/testing
// work is created after the budget is set and can diverge from it.
const STORY_POINTS_FIELD = "Custom field (Story Points)";
const STORY_DONE_STATUSES = new Set(["done", "ready to be released"]);
// Once a Story hands off to QA, dev work on it is finished — counts as
// 100% for the Dev bucket even though the ticket itself isn't Done yet.
const STORY_DEV_HANDOFF_STATUSES = new Set(["ready for testing"]);
const STORY_EXCLUDED_STATUSES = new Set(["ceased"]);
// If logged time disagrees with the date-based estimate by more than this,
// assume the team isn't logging time reliably and trust the dates instead.
const STORY_TIME_DEVIATION_THRESHOLD = 0.3;

/**
 * A single Story/Testing issue's completion fraction (0–1):
 * - Done / Ready to be Released → 1
 * - Ready for testing on a Story (Dev) issue → 1 (dev work is done, it's
 *   just waiting on QA); has no special meaning for Testing issues
 * - No start+due date on the issue → 0 (nothing to pro-rate against)
 * - Otherwise, pro-rated by elapsed days between start and due date; if
 *   JIRA's own "Original estimate" is set, cross-check against logged
 *   "Time Spent" and prefer that instead — unless the two disagree by more
 *   than STORY_TIME_DEVIATION_THRESHOLD, in which case the date-based
 *   figure wins (the team likely isn't logging time).
 */
function computeStoryIssueProgress(row, today, isDev) {
  const status = (row["Status"] || "").trim().toLowerCase();
  if (STORY_DONE_STATUSES.has(status)) return 1;
  if (isDev && STORY_DEV_HANDOFF_STATUSES.has(status)) return 1;

  const start = row["Custom field (Start date)"] ? parseJiraDate(row["Custom field (Start date)"]) : null;
  const due = row["Due date"] ? parseJiraDate(row["Due date"]) : null;
  if (!start || !due) return 0;

  const startDay = toDayValue(start);
  const dueDay = toDayValue(due);
  const todayDay = toDayValue(today);
  const totalDays = dueDay - startDay;
  const dateProgress = totalDays > 0
    ? Math.min(1, Math.max(0, (todayDay - startDay) / totalDays))
    : (todayDay >= startDay ? 1 : 0);

  const originalEstimate = parseFloat(row["Original estimate"]);
  const timeSpent = parseFloat(row["Time Spent"]);
  if (!isNaN(originalEstimate) && originalEstimate > 0 && !isNaN(timeSpent)) {
    const timeProgress = Math.min(1, Math.max(0, timeSpent / originalEstimate));
    if (Math.abs(timeProgress - dateProgress) <= STORY_TIME_DEVIATION_THRESHOLD) return timeProgress;
  }
  return dateProgress;
}

/**
 * Real Dev/QA completion, keyed by epic key, from Story Points weighted by
 * each issue's own progress (see computeStoryIssueProgress) — actual
 * reported status/dates, not a forecast. Each entry is
 * { pct, done, total, timeSpentSeconds } so callers can show "X of Y
 * points" as well as the %; total is also how many points actually exist
 * under Story/Testing, which can be more (or less) than what the Budget
 * tab assumed up front. timeSpentSeconds is JIRA's own logged time summed
 * across the same issues (0 when nobody's logging).
 * Only issues with a Story Points value count toward a phase's total — an
 * un-pointed issue carries no signal either way. Ceased issues are
 * excluded entirely (cancelled work, not remaining or done).
 */
export function computeStoryMetrics(rows, today = new Date()) {
  const devPoints = new Map(); // epicKey -> { total, done, timeSpentSeconds }
  const qaPoints = new Map();

  for (const row of rows) {
    const status = (row["Status"] || "").trim().toLowerCase();
    if (STORY_EXCLUDED_STATUSES.has(status)) continue;

    const parentKey = row["Parent key"];
    if (!parentKey) continue;

    const pointsRaw = row[STORY_POINTS_FIELD];
    const points = pointsRaw && pointsRaw.trim() ? parseFloat(pointsRaw) : NaN;
    if (isNaN(points) || points <= 0) continue;

    const type = (row["Issue Type"] || "").trim();
    const bucket = type === "Story" ? devPoints : type === "Testing" ? qaPoints : null;
    if (!bucket) continue;

    const progress = computeStoryIssueProgress(row, today, type === "Story");
    const timeSpent = parseFloat(row["Time Spent"]);
    const entry = bucket.get(parentKey) || { total: 0, done: 0, timeSpentSeconds: 0 };
    entry.total += points;
    entry.done += points * progress;
    if (!isNaN(timeSpent) && timeSpent > 0) entry.timeSpentSeconds += timeSpent;
    bucket.set(parentKey, entry);
  }

  const toMetricsMap = (points) => {
    const map = new Map();
    for (const [key, { total, done, timeSpentSeconds }] of points) {
      map.set(key, { pct: total > 0 ? Math.round((done / total) * 100) : 0, done, total, timeSpentSeconds });
    }
    return map;
  };

  return { dev: toMetricsMap(devPoints), qa: toMetricsMap(qaPoints) };
}

/**
 * Prefer JIRA's own "% of progress" field (the team's actual reported
 * completion) over the charge-weighted, date-based estimate — the
 * schedule can say a phase "should" be 93% done while the real reported
 * progress is 60%. Fall back to the weighted estimate only when the epic
 * has no raw progress value at all.
 */
// The raw, manually-entered progress % (a PM's own reported figure), when
// present — distinct from the schedule-derived fallback below, since it's
// an independent signal worth trusting on its own (e.g. to cap a forecast
// against it), not just another heuristic layered on top of one.
function getRawProgressPct(epic) {
  const raw = epic.rawData["Custom field (% of progress)"];
  if (raw && raw.trim()) {
    const val = Math.round(parseFloat(raw));
    if (!isNaN(val)) return val;
  }
  return null;
}

export function getDisplayProgress(epic, today = new Date()) {
  const raw = getRawProgressPct(epic);
  return raw !== null ? raw : computeWeightedProgress(epic, today);
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
