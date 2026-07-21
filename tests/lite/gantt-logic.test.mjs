import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toDayValue, getWeekNumber, detectInconsistencies, detectAlerts, detectEddIssues,
  computeDateRange, makeDayOffset, buildTimelineHeaders, computeWeekLines,
  getCellText, applyGanttRowFilters, computeWeightedProgress, getDisplayProgress,
  computePhaseCumulativeWeights, computePhaseWeight, computePhaseWorkloadDays,
  computePhasePrice, computePhasePriceCumulative, computePeriodForecast,
  computeStoryMetrics, resolvePhaseRenderBounds, computeProjectedProgress,
  computePhaseThisMonth,
  ZOOM_CONFIG, TIMELINE_MARGIN,
} from "../../public/lite/js/gantt-logic.js";

function epic(id, phases, status = "In Progress", raw = {}) {
  return { id, epicKey: `E-${id}`, epicName: `Epic ${id}`, status, phases, rawData: raw };
}
function phase(name, start, end, id = name) {
  return { id, phaseName: name, color: "#000", startDate: start, endDate: end };
}

// Local Y-M-D, not toISOString() — that converts to UTC first and can land
// on the wrong calendar day depending on the machine's timezone offset.
function localYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function storyRow({
  type, parentKey, points, status = "To Do",
  start, due, originalEstimate, timeSpent,
} = {}) {
  return {
    "Issue Type": type,
    "Parent key": parentKey,
    "Status": status,
    "Custom field (Story Points)": points !== undefined ? String(points) : "",
    "Custom field (Start date)": start ? localYmd(start) : "",
    "Due date": due ? localYmd(due) : "",
    "Original estimate": originalEstimate !== undefined ? String(originalEstimate) : "",
    "Time Spent": timeSpent !== undefined ? String(timeSpent) : "",
  };
}

test("getWeekNumber: ISO week", () => {
  assert.equal(getWeekNumber(new Date(2026, 0, 1)), 1);   // Thu 1 Jan 2026 → W1
  assert.equal(getWeekNumber(new Date(2026, 11, 31)), 53); // Thu 31 Dec 2026 → W53
});

test("detectInconsistencies flags overlapping ordered phases", () => {
  const bad = epic(1, [
    phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 20)),
    phase("Development", new Date(2026, 0, 10), new Date(2026, 1, 1)), // starts before Analysis ends
  ]);
  const ok = epic(2, [
    phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 10)),
    phase("Development", new Date(2026, 0, 10), new Date(2026, 1, 1)), // same-day handoff is OK
  ]);
  const result = detectInconsistencies([bad, ok]);
  assert.ok(result.has(1));
  assert.ok(result.get(1).conflictingPhases.has("Analysis"));
  assert.ok(result.get(1).conflictingPhases.has("Development"));
  assert.ok(!result.has(2));
});

test("detectAlerts: analysis ended but status still Backlog", () => {
  const today = new Date(2026, 5, 1);
  const late = epic(1, [phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 31))], "Backlog");
  const fine = epic(2, [phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 31))], "In Progress");
  const result = detectAlerts([late, fine], today);
  assert.ok(result.has(1));
  assert.ok(!result.has(2));
});

test("detectEddIssues: EDD before Customer UAT start is flagged", () => {
  const e = epic(1, [phase("Customer UAT", new Date(2026, 5, 1), new Date(2026, 5, 15))], "In Progress", {
    "Custom field (Estimated Delivery Date)": "01 May 2026",
  });
  const result = detectEddIssues([e]);
  assert.ok(result.has(1));
  assert.match(result.get(1).details[0], /Estimated delivery/);
});

test("detectEddIssues: EDD on or after Customer UAT start is not flagged", () => {
  const onStart = epic(1, [phase("Customer UAT", new Date(2026, 5, 1), new Date(2026, 5, 15))], "In Progress", {
    "Custom field (Estimated Delivery Date)": "01 Jun 2026",
  });
  const after = epic(2, [phase("Customer UAT", new Date(2026, 5, 1), new Date(2026, 5, 15))], "In Progress", {
    "Custom field (Estimated Delivery Date)": "20 Jun 2026",
  });
  const result = detectEddIssues([onStart, after]);
  assert.equal(result.size, 0);
});

test("detectEddIssues: skipped when EDD or the UAT phase is missing", () => {
  const noEdd = epic(1, [phase("Customer UAT", new Date(2026, 5, 1), new Date(2026, 5, 15))]);
  const noUat = epic(2, [phase("Development", new Date(2026, 0, 1), new Date(2026, 0, 15))], "In Progress", {
    "Custom field (Estimated Delivery Date)": "01 Jan 2026",
  });
  assert.equal(detectEddIssues([noEdd, noUat]).size, 0);
});

test("computeDateRange always covers current year with 14-day padding", () => {
  const now = new Date(2026, 6, 15);
  const { minDate, maxDate } = computeDateRange([], now);
  assert.ok(minDate <= new Date(2026, 0, 1));
  assert.ok(maxDate >= new Date(2026, 11, 31));
});

test("makeDayOffset is DST-safe (uses UTC day arithmetic)", () => {
  const minDate = new Date(2026, 2, 1); // March — crosses EU DST on Mar 29
  const off = makeDayOffset(minDate, 10);
  assert.equal(off(new Date(2026, 2, 1)), TIMELINE_MARGIN);
  assert.equal(off(new Date(2026, 3, 1)), TIMELINE_MARGIN + 31 * 10); // exactly 31 days
});

test("buildTimelineHeaders month zoom: one sub header per month, year headers on top", () => {
  const minDate = new Date(2026, 0, 1);
  const maxDate = new Date(2026, 11, 31);
  const dayOffset = makeDayOffset(minDate, ZOOM_CONFIG.month.dayWidth);
  const h = buildTimelineHeaders({ minDate, maxDate, zoom: "month", dayOffset });
  assert.equal(h.yearHeaders.length, 1);
  assert.equal(h.quarterHeaders.length, 4);
  assert.equal(h.subHeaders.length, 12);
  assert.equal(h.mainHeaders.length, 0);
});

test("computeWeekLines: one line per Monday in range", () => {
  const minDate = new Date(2026, 0, 1); // Thu
  const maxDate = new Date(2026, 0, 31);
  const dayOffset = makeDayOffset(minDate, 10);
  const lines = computeWeekLines(minDate, maxDate, dayOffset);
  // Mondays in Jan 2026: 5, 12, 19, 26
  assert.equal(lines.length, 4);
  assert.equal(lines[0], dayOffset(new Date(2026, 0, 5)));
});

test("applyGanttRowFilters: sort keeps initiative groups together", () => {
  const i1 = epic(-1, [], "", { "Custom field (Product)": "" });
  const c1 = epic(1, [], "", { "Custom field (Product)": "Zeta" });
  const s1 = epic(2, [], "", { "Custom field (Product)": "Alpha" });
  const rows = [
    { type: "initiative", epic: { ...i1, epicName: "Zzz init" }, initiativeKey: "I-1", initiativeName: "Zzz init", children: [c1] },
    { type: "epic", epic: c1, initiativeKey: "I-1" },
    { type: "epic", epic: s1 },
  ];
  const sorted = applyGanttRowFilters(rows, {
    showInconsistencies: false, showAlerts: false, phaseFilter: null,
    colFilters: {}, sortCol: "epicName", sortDir: "asc",
    inconsistencies: new Map(), alerts: new Map(),
  });
  // "Epic 2" < "Zzz init" so the standalone epic comes first, group stays intact
  assert.equal(sorted[0].epic.id, 2);
  assert.equal(sorted[1].type, "initiative");
  assert.equal(sorted[2].epic.id, 1);
});

test("applyGanttRowFilters: phase filter keeps epics currently in phase", () => {
  const today = new Date(2026, 5, 15);
  const inPhase = epic(1, [phase("Development", new Date(2026, 5, 1), new Date(2026, 6, 1))]);
  const outPhase = epic(2, [phase("Development", new Date(2026, 0, 1), new Date(2026, 1, 1))]);
  const rows = [
    { type: "epic", epic: inPhase },
    { type: "epic", epic: outPhase },
  ];
  const filtered = applyGanttRowFilters(rows, {
    showInconsistencies: false, showAlerts: false, phaseFilter: "Development",
    colFilters: {}, sortCol: null, sortDir: null,
    inconsistencies: new Map(), alerts: new Map(), today,
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].epic.id, 1);
});

test("applyGanttRowFilters: showEddIssues keeps only flagged epics (and their initiative)", () => {
  const flagged = epic(1, [], "In Progress", {});
  const fine = epic(2, [], "In Progress", {});
  const eddIssues = new Map([[1, { epicId: 1, details: ["bad"] }]]);
  const rows = [
    { type: "initiative", epic: epic(-1, []), initiativeKey: "I-1", children: [flagged, fine] },
    { type: "epic", epic: flagged, initiativeKey: "I-1" },
    { type: "epic", epic: fine, initiativeKey: "I-1" },
  ];
  const filtered = applyGanttRowFilters(rows, {
    showInconsistencies: false, showAlerts: false, showEddIssues: true, phaseFilter: null,
    colFilters: {}, sortCol: null, sortDir: null,
    inconsistencies: new Map(), alerts: new Map(), eddIssues,
  });
  assert.equal(filtered.length, 2); // initiative (has a flagged child) + the flagged epic itself
  assert.ok(filtered.some((r) => r.type === "initiative"));
  assert.ok(filtered.some((r) => r.epic.id === 1));
  assert.ok(!filtered.some((r) => r.epic.id === 2));
});

test("getCellText: initiative shows only name and progress columns", () => {
  const e = epic(1, [], "Done", { "Custom field (Product)": "P1", "Custom field (% of progress)": "42.4" });
  assert.equal(getCellText(e, "product", true), "");
  assert.equal(getCellText(e, "product", false), "P1");
  assert.equal(getCellText(e, "progress", false), "42");
  assert.equal(getCellText(e, "epicName", true), "Epic 1");
});

test("computeWeightedProgress: null when no budget hours are set", () => {
  const e = epic(1, [phase("Development", new Date(2026, 0, 1), new Date(2026, 1, 1))]);
  assert.equal(computeWeightedProgress(e, new Date(2026, 5, 1)), null);
});

test("computeWeightedProgress: finished phases count fully, future phases count 0", () => {
  const today = new Date(2026, 3, 1); // 1 Apr 2026
  const e = epic(1, [
    phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 31)),   // finished
    phase("Development", new Date(2026, 5, 1), new Date(2026, 6, 1)), // hasn't started
  ], "In Progress", {
    "Custom field (Budget Hours CO)": "40",   // Analysis: half the total weight
    "Custom field (Budget Hours DEV)": "40",  // Development: half the total weight
  });
  // Analysis (50% weight, done) + Development (50% weight, not started) = 50%
  assert.equal(computeWeightedProgress(e, today), 50);
});

test("computeWeightedProgress: current phase counts pro-rata by elapsed days", () => {
  const today = new Date(2026, 0, 11); // 10 days into a 20-day phase
  const e = epic(1, [
    phase("Development", new Date(2026, 0, 1), new Date(2026, 0, 21)),
  ], "In Progress", {
    "Custom field (Budget Hours DEV)": "100",
  });
  // Single phase = 100% of weight, 10/20 days elapsed = 50% of that phase done
  assert.equal(computeWeightedProgress(e, today), 50);
});

test("computeWeightedProgress: Budget Hours DOC folds into Pilot's weight", () => {
  const today = new Date(2026, 5, 1);
  const e = epic(1, [
    phase("Development", new Date(2026, 0, 1), new Date(2026, 0, 31)), // finished
    phase("Pilot", new Date(2026, 5, 1), new Date(2026, 5, 30)),        // starts today, 0 elapsed
  ], "In Progress", {
    "Custom field (Budget Hours DEV)": "50",
    "Custom field (Budget Hours Pilot)": "10",
    "Custom field (Budget Hours DOC)": "40", // folded into Pilot's bucket (10+40=50)
  });
  // total = 50 (Dev) + 50 (Pilot incl. DOC) = 100 → Dev is exactly half the
  // project; without DOC folded in, Dev would instead be 50/60 = 83%.
  assert.equal(computeWeightedProgress(e, today), 50);
});

test("computeWeightedProgress: a budgeted phase with no scheduled dates counts as not started", () => {
  const today = new Date(2026, 5, 1);
  const e = epic(1, [
    phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 31)), // finished
    // Development has budget hours but no dates in epic.phases
  ], "In Progress", {
    "Custom field (Budget Hours CO)": "50",
    "Custom field (Budget Hours DEV)": "50",
  });
  assert.equal(computeWeightedProgress(e, today), 50);
});

test("getDisplayProgress: prefers JIRA's raw % of progress over the weighted date-based estimate", () => {
  const e = epic(1, [], "In Progress", {
    "Custom field (Budget Hours DEV)": "100",
    "Custom field (% of progress)": "60",
  });
  assert.equal(getDisplayProgress(e), 60);
});

test("getDisplayProgress: falls back to the weighted estimate when no raw % is set", () => {
  const today = new Date(2026, 5, 1);
  const e = epic(1, [
    phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 31)),
  ], "In Progress", { "Custom field (Budget Hours CO)": "50" });
  assert.equal(getDisplayProgress(e, today), 100);
});

test("computePhaseCumulativeWeights: running total through phase order", () => {
  const e = epic(1, [
    phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 10)),
    phase("Development", new Date(2026, 0, 10), new Date(2026, 1, 10)),
    phase("QA / Test", new Date(2026, 1, 10), new Date(2026, 1, 20)),
  ], "In Progress", {
    "Custom field (Budget Hours CO)": "20",
    "Custom field (Budget Hours DEV)": "40",
    "Custom field (Budget Hours Tester)": "15",
    "Custom field (Budget Hours UAT)": "15",
    "Custom field (Budget Hours Pilot)": "10",
  });
  const cum = computePhaseCumulativeWeights(e);
  assert.equal(cum["Analysis"], 20);
  assert.equal(cum["Development"], 60);
  assert.equal(cum["QA / Test"], 75);
  assert.equal(cum["Customer UAT"], 90);
  assert.equal(cum["Pilot"], 100);
});

test("computePhaseCumulativeWeights: Budget Hours DOC folds into Pilot, reaching exactly 100%", () => {
  const e = epic(1, [
    phase("Development", new Date(2026, 0, 1), new Date(2026, 0, 31)),
    phase("Pilot", new Date(2026, 5, 1), new Date(2026, 5, 30)),
  ], "In Progress", {
    "Custom field (Budget Hours DEV)": "50",
    "Custom field (Budget Hours Pilot)": "10",
    "Custom field (Budget Hours DOC)": "40",
  });
  const cum = computePhaseCumulativeWeights(e);
  assert.equal(cum["Development"], 50);
  assert.equal(cum["Pilot"], 100);
});

test("computePhaseCumulativeWeights: null when no budget hours are set", () => {
  const e = epic(1, [phase("Development", new Date(2026, 0, 1), new Date(2026, 0, 10))]);
  assert.equal(computePhaseCumulativeWeights(e), null);
});

test("computePhaseWeight: a single step's own share, not the running total", () => {
  const e = epic(1, [], "In Progress", {
    "Custom field (Budget Hours CO)": "20",
    "Custom field (Budget Hours DEV)": "40",
    "Custom field (Budget Hours Tester)": "15",
    "Custom field (Budget Hours UAT)": "15",
    "Custom field (Budget Hours Pilot)": "10",
  });
  assert.equal(computePhaseWeight(e, "Analysis"), 20);
  assert.equal(computePhaseWeight(e, "Development"), 40); // not 60 (the cumulative value)
  assert.equal(computePhaseWeight(e, "Pilot"), 10);
});

test("computePhaseWeight: 0 for an unbudgeted phase, null when nothing is budgeted", () => {
  const e = epic(1, [], "In Progress", { "Custom field (Budget Hours DEV)": "40" });
  assert.equal(computePhaseWeight(e, "Analysis"), 0);
  assert.equal(computePhaseWeight(epic(2, []), "Development"), null);
});

test("computePhaseWorkloadDays: a single phase's own hours ÷ 8, not the epic total", () => {
  const e = epic(1, [], "In Progress", {
    "Custom field (Budget Hours CO)": "16",
    "Custom field (Budget Hours DEV)": "48",
  });
  assert.equal(computePhaseWorkloadDays(e, "Analysis"), "2");
  assert.equal(computePhaseWorkloadDays(e, "Development"), "6");
});

test("computePhaseWorkloadDays: DOC folds into Pilot's own workload", () => {
  const e = epic(1, [], "In Progress", {
    "Custom field (Budget Hours Pilot)": "8",
    "Custom field (Budget Hours DOC)": "4",
  });
  assert.equal(computePhaseWorkloadDays(e, "Pilot"), "1.5"); // (8+4)/8
});

test("computePhaseWorkloadDays: null for an unbudgeted phase", () => {
  const e = epic(1, [], "In Progress", { "Custom field (Budget Hours DEV)": "48" });
  assert.equal(computePhaseWorkloadDays(e, "Analysis"), null);
});

test("computePhasePrice: a single phase's own cost", () => {
  const e = epic(1, [], "In Progress", {
    "Custom field (Budget Price CO)": "1046.48",
    "Custom field (Budget Price DEV)": "3138.93",
  });
  assert.equal(computePhasePrice(e, "Analysis"), 1046.48);
  assert.equal(computePhasePrice(e, "Development"), 3138.93);
});

test("computePhasePrice: DOC and PM are split evenly across all 5 phases, not folded into Pilot", () => {
  const e = epic(1, [], "In Progress", {
    "Custom field (Budget Price CO)": "100",
    "Custom field (Budget Price Pilot)": "50",
    "Custom field (Budget Price DOC)": "200",
    "Custom field (Budget Price PM)": "300",
  });
  const share = (200 + 300) / 5; // 100
  assert.equal(computePhasePrice(e, "Analysis"), 100 + share);
  assert.equal(computePhasePrice(e, "Pilot"), 50 + share);
  // QA / Test has no budget of its own but still gets its share of DOC+PM.
  assert.equal(computePhasePrice(e, "QA / Test"), share);
});

test("computePhasePrice: null for an unbudgeted phase", () => {
  const e = epic(1, [], "In Progress", { "Custom field (Budget Price DEV)": "3138.93" });
  assert.equal(computePhasePrice(e, "Analysis"), null);
});

test("computePhasePriceCumulative: running total through phase order", () => {
  const e = epic(1, [], "In Progress", {
    "Custom field (Budget Price CO)": "100",
    "Custom field (Budget Price DEV)": "200",
    "Custom field (Budget Price Pilot)": "50",
  });
  const cum = computePhasePriceCumulative(e);
  assert.equal(cum["Analysis"], 100);
  assert.equal(cum["Development"], 300);
  assert.equal(cum["QA / Test"], 300); // unbudgeted phase carries the running total forward
  assert.equal(cum["Pilot"], 350);
});

test("computePhasePriceCumulative: DOC and PM are split evenly, reaching the same grand total at Pilot", () => {
  const e = epic(1, [], "In Progress", {
    "Custom field (Budget Price CO)": "100",
    "Custom field (Budget Price Pilot)": "50",
    "Custom field (Budget Price DOC)": "174.39",
    "Custom field (Budget Price PM)": "669.6",
  });
  const cum = computePhasePriceCumulative(e);
  // The grand total is unchanged by the redistribution (100 + 50 + DOC + PM).
  assert.equal(Math.round(cum["Pilot"] * 100) / 100, 100 + 50 + 174.39 + 669.6);
});

test("computePhasePriceCumulative: null when no phase has a budgeted price", () => {
  assert.equal(computePhasePriceCumulative(epic(1, [])), null);
});

test("computePeriodForecast: a phase fully inside the period counts in full", () => {
  const e = epic(1, [phase("Development", new Date(2026, 0, 10), new Date(2026, 0, 19))], "In Progress", {
    "Custom field (Budget Price DEV)": "1000",
  });
  const total = computePeriodForecast(
    [{ type: "epic", epic: e }], new Date(2026, 0, 1), new Date(2026, 1, 1)
  );
  assert.equal(total, 1000);
});

test("computePeriodForecast: a phase fully outside the period contributes 0", () => {
  const e = epic(1, [phase("Development", new Date(2026, 0, 10), new Date(2026, 0, 19))], "In Progress", {
    "Custom field (Budget Price DEV)": "1000",
  });
  const total = computePeriodForecast(
    [{ type: "epic", epic: e }], new Date(2026, 1, 1), new Date(2026, 2, 1)
  );
  assert.equal(total, 0);
});

test("computePeriodForecast: a phase straddling the boundary is pro-rated by overlapping days", () => {
  // 10-day phase (Jan 26 - Feb 4 inclusive), 6 days in January, 4 in February.
  const e = epic(1, [phase("Development", new Date(2026, 0, 26), new Date(2026, 1, 4))], "In Progress", {
    "Custom field (Budget Price DEV)": "1000",
  });
  const jan = computePeriodForecast([{ type: "epic", epic: e }], new Date(2026, 0, 1), new Date(2026, 1, 1));
  const feb = computePeriodForecast([{ type: "epic", epic: e }], new Date(2026, 1, 1), new Date(2026, 2, 1));
  assert.equal(jan, 600);
  assert.equal(feb, 400);
});

test("computePeriodForecast: sums across epics and skips initiative rows", () => {
  const e1 = epic(1, [phase("Development", new Date(2026, 0, 5), new Date(2026, 0, 10))], "In Progress", {
    "Custom field (Budget Price DEV)": "500",
  });
  const e2 = epic(2, [phase("Development", new Date(2026, 0, 5), new Date(2026, 0, 10))], "In Progress", {
    "Custom field (Budget Price DEV)": "300",
  });
  const initiative = epic(3, [phase("Development", new Date(2026, 0, 5), new Date(2026, 0, 10))], "", {
    "Custom field (Budget Price DEV)": "9999",
  });
  const total = computePeriodForecast(
    [{ type: "epic", epic: e1 }, { type: "epic", epic: e2 }, { type: "initiative", epic: initiative }],
    new Date(2026, 0, 1), new Date(2026, 1, 1)
  );
  assert.equal(total, 800);
});

test("computePeriodForecast: Development with real progress only forecasts the unrecognized remainder", () => {
  // 1000 budgeted, 50% already really done per Story Points → only 500
  // left to forecast, spread over the remaining days of the phase.
  const e = epic(1, [phase("Development", new Date(2026, 0, 10), new Date(2026, 0, 20))], "In Progress", {
    "Custom field (Budget Price DEV)": "1000",
  });
  const storyMetrics = { dev: new Map([["E-1", { pct: 50, done: 0, total: 0, timeSpentSeconds: 0 }]]), qa: new Map() };
  const total = computePeriodForecast(
    [{ type: "epic", epic: e }], new Date(2026, 0, 1), new Date(2026, 1, 1), storyMetrics, new Date(2026, 0, 10)
  );
  assert.equal(total, 500);
});

test("computePeriodForecast: Development real progress remainder is spread from today, not the original phase start", () => {
  const e = epic(1, [phase("Development", new Date(2026, 0, 1), new Date(2026, 0, 20))], "In Progress", {
    "Custom field (Budget Price DEV)": "1000",
  });
  const storyMetrics = { dev: new Map([["E-1", { pct: 50, done: 0, total: 0, timeSpentSeconds: 0 }]]), qa: new Map() };
  // Remaining 500 spans today (Jan 15) through Jan 20 (6 days) — none of
  // it should land earlier in the month, even though the phase itself
  // started Jan 1.
  const firstHalf = computePeriodForecast(
    [{ type: "epic", epic: e }], new Date(2026, 0, 1), new Date(2026, 0, 15), storyMetrics, new Date(2026, 0, 15)
  );
  const total = computePeriodForecast(
    [{ type: "epic", epic: e }], new Date(2026, 0, 1), new Date(2026, 1, 1), storyMetrics, new Date(2026, 0, 15)
  );
  assert.equal(firstHalf, 0);
  assert.equal(total, 500);
});

test("computePeriodForecast: overdue Development (real % < 100 past its end date) is outstanding as of today", () => {
  const e = epic(1, [phase("Development", new Date(2025, 11, 1), new Date(2025, 11, 31))], "In Progress", {
    "Custom field (Budget Price DEV)": "1000",
  });
  const storyMetrics = { dev: new Map([["E-1", { pct: 60, done: 0, total: 0, timeSpentSeconds: 0 }]]), qa: new Map() };
  const today = new Date(2026, 0, 10); // three weeks past the scheduled end
  const decemberForecast = computePeriodForecast(
    [{ type: "epic", epic: e }], new Date(2025, 11, 1), new Date(2026, 0, 1), storyMetrics, today
  );
  const januaryForecast = computePeriodForecast(
    [{ type: "epic", epic: e }], new Date(2026, 0, 1), new Date(2026, 1, 1), storyMetrics, today
  );
  assert.equal(decemberForecast, 0); // nothing left in the month it was scheduled for
  assert.equal(januaryForecast, 400); // the unrecognized 40% (1000 * 0.4) lands in today's month instead
});

test("computePeriodForecast: QA / Test gets the same real-progress treatment as Development", () => {
  const e = epic(1, [phase("QA / Test", new Date(2026, 0, 10), new Date(2026, 0, 20))], "In Progress", {
    "Custom field (Budget Price Tester)": "800",
  });
  const storyMetrics = { dev: new Map(), qa: new Map([["E-1", { pct: 25, done: 0, total: 0, timeSpentSeconds: 0 }]]) };
  const total = computePeriodForecast(
    [{ type: "epic", epic: e }], new Date(2026, 0, 1), new Date(2026, 1, 1), storyMetrics, new Date(2026, 0, 10)
  );
  assert.equal(total, 600); // 800 * (1 - 0.25)
});

test("computePeriodForecast: phases other than Development/QA ignore storyMetrics entirely", () => {
  const e = epic(1, [phase("Analysis", new Date(2026, 0, 10), new Date(2026, 0, 19))], "In Progress", {
    "Custom field (Budget Price CO)": "1000",
  });
  const storyMetrics = { dev: new Map([["E-1", { pct: 90, done: 0, total: 0, timeSpentSeconds: 0 }]]), qa: new Map() };
  const total = computePeriodForecast(
    [{ type: "epic", epic: e }], new Date(2026, 0, 1), new Date(2026, 1, 1), storyMetrics, new Date(2026, 0, 10)
  );
  assert.equal(total, 1000); // unaffected — Analysis has no real-progress signal
});

test("computePeriodForecast: without storyMetrics, Development still uses the plain schedule pro-ration", () => {
  const e = epic(1, [phase("Development", new Date(2026, 0, 10), new Date(2026, 0, 19))], "In Progress", {
    "Custom field (Budget Price DEV)": "1000",
  });
  const total = computePeriodForecast([{ type: "epic", epic: e }], new Date(2026, 0, 1), new Date(2026, 1, 1));
  assert.equal(total, 1000);
});

test("computePhaseThisMonth: days/pct/NRR all derive from the same ratio", () => {
  // 800€, 16 budgeted workload-days, phase spans the whole month (Jan
  // 1-31), no real progress data → plain calendar pro-ration for however
  // much of the phase falls in "this month" (all of it, so full amounts).
  const e = epic(1, [phase("Development", new Date(2026, 0, 1), new Date(2026, 0, 31))], "In Progress", {
    "Custom field (Budget Price DEV)": "800",
    "Custom field (Budget Hours DEV)": "128", // 128 / 8 = 16 days
  });
  const result = computePhaseThisMonth(e, e.phases[0], null, new Date(2026, 0, 15));
  assert.equal(result.nrr, 800);
  assert.equal(result.pct, 100);
  assert.equal(result.days, 16);
});

test("computePhaseThisMonth: with real progress, only the unrecognized remainder counts", () => {
  const e = epic(1, [phase("Development", new Date(2026, 0, 1), new Date(2026, 0, 31))], "In Progress", {
    "Custom field (Budget Price DEV)": "1000",
    "Custom field (Budget Hours DEV)": "80", // 10 days
  });
  const storyMetrics = { dev: new Map([["E-1", { pct: 40, done: 0, total: 0, timeSpentSeconds: 0 }]]), qa: new Map() };
  // Remaining 60% (600€, 6 days) spread from "today" (Jan 15) to Jan 31.
  const result = computePhaseThisMonth(e, e.phases[0], storyMetrics, new Date(2026, 0, 15));
  assert.equal(result.nrr, 600);
  assert.equal(result.pct, 60);
  assert.equal(result.days, 6);
});

test("computePhaseThisMonth: null when the phase doesn't reach into the current month", () => {
  const e = epic(1, [phase("Development", new Date(2025, 0, 1), new Date(2025, 0, 31))], "Done", {
    "Custom field (Budget Price DEV)": "1000",
  });
  assert.equal(computePhaseThisMonth(e, e.phases[0], null, new Date(2026, 0, 15)), null);
});

test("computePhaseThisMonth: null when the phase has no budgeted price", () => {
  const e = epic(1, [phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 31))], "In Progress", {});
  assert.equal(computePhaseThisMonth(e, e.phases[0], null, new Date(2026, 0, 15)), null);
});

test("computeStoryMetrics: Done counts fully regardless of dates", () => {
  const rows = [storyRow({ type: "Story", parentKey: "E-1", points: 5, status: "Done" })];
  const { dev } = computeStoryMetrics(rows, new Date(2026, 0, 1));
  assert.deepEqual(dev.get("E-1"), { pct: 100, done: 5, total: 5, timeSpentSeconds: 0 });
});

test("computeStoryMetrics: To Do with no dates counts as 0%, still adds to the total", () => {
  const rows = [
    storyRow({ type: "Story", parentKey: "E-1", points: 5, status: "Done" }),
    storyRow({ type: "Story", parentKey: "E-1", points: 5, status: "To Do" }),
  ];
  const { dev } = computeStoryMetrics(rows, new Date(2026, 0, 1));
  assert.deepEqual(dev.get("E-1"), { pct: 50, done: 5, total: 10, timeSpentSeconds: 0 }); // 5 of 10 points done
});

test("computeStoryMetrics: In Progress with no time tracking is pro-rated by elapsed days", () => {
  const rows = [storyRow({
    type: "Story", parentKey: "E-1", points: 10, status: "In Progress",
    start: new Date(2026, 0, 1), due: new Date(2026, 0, 11),
  })];
  const { dev } = computeStoryMetrics(rows, new Date(2026, 0, 6)); // 5 of 10 days elapsed
  assert.equal(dev.get("E-1").pct, 50);
});

test("computeStoryMetrics: logged time is trusted when it's close to the date-based estimate", () => {
  const rows = [storyRow({
    type: "Story", parentKey: "E-1", points: 10, status: "In Progress",
    start: new Date(2026, 0, 1), due: new Date(2026, 0, 11),
    originalEstimate: 100, timeSpent: 55, // 55% vs. 50% date-based — within 30%
  })];
  const { dev } = computeStoryMetrics(rows, new Date(2026, 0, 6));
  assert.equal(dev.get("E-1").pct, 55);
});

test("computeStoryMetrics: sums logged time across an epic's Story/Testing children", () => {
  const rows = [
    storyRow({ type: "Story", parentKey: "E-1", points: 3, status: "Done", timeSpent: 3600 }),
    storyRow({ type: "Story", parentKey: "E-1", points: 2, status: "To Do", timeSpent: 1800 }),
    storyRow({ type: "Testing", parentKey: "E-1", points: 1, status: "To Do" }), // no time logged
  ];
  const { dev, qa } = computeStoryMetrics(rows, new Date(2026, 0, 1));
  assert.equal(dev.get("E-1").timeSpentSeconds, 5400);
  assert.equal(qa.get("E-1").timeSpentSeconds, 0);
});

test("computeStoryMetrics: falls back to date-based when logged time deviates more than 30%", () => {
  const rows = [storyRow({
    type: "Story", parentKey: "E-1", points: 10, status: "In Progress",
    start: new Date(2026, 0, 1), due: new Date(2026, 0, 11),
    originalEstimate: 100, timeSpent: 10, // 10% vs. 50% date-based — way off, nobody's logging
  })];
  const { dev } = computeStoryMetrics(rows, new Date(2026, 0, 6));
  assert.equal(dev.get("E-1").pct, 50);
});

test("computeStoryMetrics: Ceased issues are excluded entirely", () => {
  const rows = [
    storyRow({ type: "Story", parentKey: "E-1", points: 5, status: "Done" }),
    storyRow({ type: "Story", parentKey: "E-1", points: 100, status: "Ceased" }),
  ];
  const { dev } = computeStoryMetrics(rows, new Date(2026, 0, 1));
  assert.deepEqual(dev.get("E-1"), { pct: 100, done: 5, total: 5, timeSpentSeconds: 0 }); // the Ceased 100-pointer doesn't drag the total down
});

test("computeStoryMetrics: issues without Story Points don't count", () => {
  const rows = [storyRow({ type: "Story", parentKey: "E-1", status: "To Do" })]; // no points
  const { dev } = computeStoryMetrics(rows, new Date(2026, 0, 1));
  assert.equal(dev.has("E-1"), false);
});

test("computeStoryMetrics: Ready for testing counts as 100% for dev, regardless of dates", () => {
  const rows = [storyRow({ type: "Story", parentKey: "E-1", points: 5, status: "Ready for testing" })];
  const { dev } = computeStoryMetrics(rows, new Date(2026, 0, 1));
  assert.deepEqual(dev.get("E-1"), { pct: 100, done: 5, total: 5, timeSpentSeconds: 0 });
});

test("computeStoryMetrics: Ready for testing has no special meaning for qa (Testing issues)", () => {
  const rows = [storyRow({ type: "Testing", parentKey: "E-1", points: 5, status: "Ready for testing" })];
  const { qa } = computeStoryMetrics(rows, new Date(2026, 0, 1));
  assert.equal(qa.get("E-1").pct, 0); // no dates → pro-rated to 0, same as any other non-Done status
});

test("computeStoryMetrics: Story feeds dev, Testing feeds qa, kept separate per epic", () => {
  const rows = [
    storyRow({ type: "Story", parentKey: "E-1", points: 10, status: "Done" }),
    storyRow({ type: "Testing", parentKey: "E-1", points: 10, status: "To Do" }),
  ];
  const { dev, qa } = computeStoryMetrics(rows, new Date(2026, 0, 1));
  assert.equal(dev.get("E-1").pct, 100);
  assert.equal(qa.get("E-1").pct, 0);
});

test("resolvePhaseRenderBounds: non-overlapping phases are left untouched", () => {
  const phases = [
    phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 10)),
    phase("Development", new Date(2026, 0, 10), new Date(2026, 0, 20)),
  ];
  const bounds = resolvePhaseRenderBounds(phases);
  assert.equal(bounds[0].startDate.getTime(), phases[0].startDate.getTime());
  assert.equal(bounds[0].endDate.getTime(), phases[0].endDate.getTime());
  assert.equal(bounds[1].startDate.getTime(), phases[1].startDate.getTime());
  assert.equal(bounds[1].endDate.getTime(), phases[1].endDate.getTime());
});

test("resolvePhaseRenderBounds: identical dates split exactly in half", () => {
  const phases = [
    phase("Development", new Date(2026, 7, 3), new Date(2026, 7, 29)), // Aug 3 -> Aug 29, 26 days
    phase("QA / Test", new Date(2026, 7, 3), new Date(2026, 7, 29)),
  ];
  const bounds = resolvePhaseRenderBounds(phases);
  const mid = new Date(2026, 7, 16); // midpoint of Aug 3 - Aug 29
  assert.equal(bounds[0].startDate.getTime(), new Date(2026, 7, 3).getTime());
  assert.equal(bounds[0].endDate.getTime(), mid.getTime());
  assert.equal(bounds[1].startDate.getTime(), mid.getTime());
  assert.equal(bounds[1].endDate.getTime(), new Date(2026, 7, 29).getTime());
});

test("resolvePhaseRenderBounds: partial overlap only splits the shared window", () => {
  const phases = [
    phase("Development", new Date(2026, 0, 1), new Date(2026, 0, 21)), // Jan 1 -> Jan 21
    phase("QA / Test", new Date(2026, 0, 11), new Date(2026, 0, 31)), // Jan 11 -> Jan 31, overlap Jan 11-21
  ];
  const bounds = resolvePhaseRenderBounds(phases);
  const mid = new Date(2026, 0, 16); // midpoint of the Jan 11-21 overlap
  assert.equal(bounds[0].startDate.getTime(), new Date(2026, 0, 1).getTime()); // Dev's own start, untouched
  assert.equal(bounds[0].endDate.getTime(), mid.getTime());
  assert.equal(bounds[1].startDate.getTime(), mid.getTime());
  assert.equal(bounds[1].endDate.getTime(), new Date(2026, 0, 31).getTime()); // QA's own end, untouched
});

test("resolvePhaseRenderBounds: keeps the original phase object reference (real dates untouched)", () => {
  const phases = [
    phase("Development", new Date(2026, 7, 3), new Date(2026, 7, 29)),
    phase("QA / Test", new Date(2026, 7, 3), new Date(2026, 7, 29)),
  ];
  const bounds = resolvePhaseRenderBounds(phases);
  assert.equal(bounds[0].phase, phases[0]);
  assert.equal(phases[0].endDate.getTime(), new Date(2026, 7, 29).getTime()); // real date unchanged
});

test("computeProjectedProgress: never regresses below today's real reported %", () => {
  // Reported 80% today, but the schedule alone would only reach 24% by the target date.
  const e = epic(1, [
    phase("Development", new Date(2026, 6, 1), new Date(2026, 9, 1)),
  ], "In Progress", {
    "Custom field (Budget Hours DEV)": "100",
    "Custom field (% of progress)": "80",
  });
  const today = new Date(2026, 6, 21);
  const target = new Date(2026, 6, 31);
  assert.equal(computeProjectedProgress(e, target, today), 80);
});

test("computeProjectedProgress: uses the schedule when it's ahead of today's reported %", () => {
  // Reported 26% today, schedule already implies more progress by the target date.
  const e = epic(1, [
    phase("Development", new Date(2026, 0, 1), new Date(2026, 0, 11)),
  ], "In Progress", {
    "Custom field (Budget Hours DEV)": "100",
    "Custom field (% of progress)": "26",
  });
  const today = new Date(2026, 0, 1);
  const target = new Date(2026, 0, 11); // fully elapsed by target -> schedule says 100%
  assert.equal(computeProjectedProgress(e, target, today), 100);
});

test("computeProjectedProgress: null when neither a raw % nor a budget-based schedule exists", () => {
  const e = epic(1, [phase("Development", new Date(2026, 0, 1), new Date(2026, 0, 11))]);
  assert.equal(computeProjectedProgress(e, new Date(2026, 0, 11)), null);
});

