import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toDayValue, getWeekNumber, detectInconsistencies, detectAlerts,
  computeDateRange, makeDayOffset, buildTimelineHeaders, computeWeekLines,
  getCellText, applyGanttRowFilters, ZOOM_CONFIG, TIMELINE_MARGIN,
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

test("getCellText: initiative shows only name and progress columns", () => {
  const e = epic(1, [], "Done", { "Custom field (Product)": "P1", "Custom field (% of progress)": "42.4" });
  assert.equal(getCellText(e, "product", true), "");
  assert.equal(getCellText(e, "product", false), "P1");
  assert.equal(getCellText(e, "progress", false), "42");
  assert.equal(getCellText(e, "epicName", true), "Epic 1");
});
