import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseJiraDate, transformToEpicTasks, buildDisplayRows,
  extractColumns, extractUniqueValues, PHASE_CONFIG,
} from "../../public/lite/js/transform.js";

test("parseJiraDate handles all JIRA formats", () => {
  assert.deepEqual(parseJiraDate("23 Mar 2026"), new Date(2026, 2, 23));
  assert.deepEqual(parseJiraDate("30/Mar/26 12:00 AM"), new Date(2026, 2, 30));
  assert.deepEqual(parseJiraDate("23/Mar/26"), new Date(2026, 2, 23));
  // ISO fallback is normalized to local midnight (no UTC drift)
  assert.deepEqual(parseJiraDate("2026-03-23"), new Date(2026, 2, 23));
  assert.equal(parseJiraDate(""), null);
  assert.equal(parseJiraDate("not a date"), null);
});

function row(key, opts = {}) {
  return {
    "Issue key": key,
    "Summary": opts.summary || `Summary ${key}`,
    "Status": opts.status || "In Progress",
    "Custom field (Analysis Start Date)": opts.aStart || "",
    "Custom field (Analysis End Date)": opts.aEnd || "",
    "Parent key": opts.parentKey || "",
    "Parent summary": opts.parentSummary || "",
  };
}

test("transformToEpicTasks builds phases and sorts dated epics first", () => {
  const rows = [
    row("A-2"), // no phases
    row("A-1", { aStart: "01 Feb 2026", aEnd: "10 Feb 2026" }),
  ];
  const tasks = transformToEpicTasks(rows);
  assert.equal(tasks[0].epicKey, "A-1"); // dated first
  assert.equal(tasks[0].phases.length, 1);
  assert.equal(tasks[0].phases[0].phaseName, "Analysis");
  assert.equal(tasks[0].phases[0].color, PHASE_CONFIG[0].color);
  assert.deepEqual(tasks[0].phases[0].startDate, new Date(2026, 1, 1));
  assert.equal(tasks[1].epicKey, "A-2");
  assert.equal(tasks[1].phases.length, 0);
});

test("buildDisplayRows groups children under initiatives and drops initiative rows from orphans", () => {
  const rows = [
    row("INIT-1", { summary: "The initiative" }),
    row("A-1", { parentKey: "INIT-1", parentSummary: "The initiative", aStart: "01 Feb 2026", aEnd: "10 Feb 2026" }),
    row("A-2", { parentKey: "INIT-1", parentSummary: "The initiative" }),
    row("B-1"), // orphan
  ];
  const display = buildDisplayRows(transformToEpicTasks(rows));
  assert.equal(display[0].type, "initiative");
  assert.equal(display[0].initiativeKey, "INIT-1");
  assert.equal(display[0].children.length, 2);
  // initiative phases aggregate all children phases
  assert.equal(display[0].epic.phases.length, 1);
  const epicRows = display.filter((r) => r.type === "epic").map((r) => r.epic.epicKey);
  assert.ok(epicRows.includes("A-1") && epicRows.includes("A-2") && epicRows.includes("B-1"));
  // INIT-1 must NOT appear as a standalone epic row
  assert.ok(!epicRows.includes("INIT-1"));
});

test("extractColumns / extractUniqueValues", () => {
  const rows = [row("A-1", { status: "Done" }), row("A-2", { status: "Backlog" })];
  assert.ok(extractColumns(rows).includes("Status"));
  assert.deepEqual(extractUniqueValues(rows, "Status"), ["Backlog", "Done"]);
});
