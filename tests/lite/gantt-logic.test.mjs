import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toDayValue, getWeekNumber, detectInconsistencies, detectAlerts, detectEddIssues,
  computeDateRange, makeDayOffset, buildTimelineHeaders, computeWeekLines,
  getCellText, applyGanttRowFilters, computeWeightedProgress,
  computePhaseCumulativeWeights, computePhaseWeight, computePhaseWorkloadDays,
  ZOOM_CONFIG, TIMELINE_MARGIN,
} from "../../public/lite/js/gantt-logic.js";

function epic(id, phases, status = "In Progress", raw = {}) {
  return { id, epicKey: `E-${id}`, epicName: `Epic ${id}`, status, phases, rawData: raw };
}
function phase(name, start, end, id = name) {
  return { id, phaseName: name, color: "#000", startDate: start, endDate: end };
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
