import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFilters, computeFilteredKeys, computeDisplayRows } from "../../public/lite/js/filters.js";
import { transformToEpicTasks, buildDisplayRows } from "../../public/lite/js/transform.js";

const rows = [
  { "Issue key": "INIT-1", "Summary": "Initiative one", "Status": "", "Parent key": "", "Parent summary": "" },
  { "Issue key": "A-1", "Summary": "Alpha", "Status": "Done", "Parent key": "INIT-1", "Parent summary": "Initiative one" },
  { "Issue key": "A-2", "Summary": "Beta", "Status": "Backlog", "Parent key": "INIT-1", "Parent summary": "Initiative one" },
  { "Issue key": "B-1", "Summary": "Gamma", "Status": "Done", "Parent key": "", "Parent summary": "" },
];

test("applyFilters: empty filters return rows; values must match trimmed cell", () => {
  assert.equal(applyFilters(rows, []).length, 4);
  const done = applyFilters(rows, [{ column: "Status", values: ["Done"] }]);
  assert.deepEqual(done.map((r) => r["Issue key"]), ["A-1", "B-1"]);
  // filter with no values selected is a no-op
  assert.equal(applyFilters(rows, [{ column: "Status", values: [] }]).length, 4);
});

test("computeDisplayRows: filters keep initiative when a child matches", () => {
  const all = buildDisplayRows(transformToEpicTasks(rows));
  const filteredRows = applyFilters(rows, [{ column: "Status", values: ["Done"] }]);
  const filteredKeys = computeFilteredKeys(transformToEpicTasks(filteredRows), filteredRows);
  const display = computeDisplayRows(all, { hasActiveFilters: true, filteredKeys, searchTerm: "" });
  const keys = display.map((r) => r.epic.epicKey);
  assert.ok(keys.includes("INIT-1"), "initiative kept because child A-1 matches");
  assert.ok(keys.includes("B-1"));
});

test("computeDisplayRows: search matches initiative name and keeps all its children", () => {
  const all = buildDisplayRows(transformToEpicTasks(rows));
  const display = computeDisplayRows(all, { hasActiveFilters: false, filteredKeys: new Set(), searchTerm: "initiative one" });
  const keys = display.map((r) => r.epic.epicKey);
  assert.ok(keys.includes("INIT-1"));
  assert.ok(keys.includes("A-1") && keys.includes("A-2"), "children of matching initiative are kept");
  assert.ok(!keys.includes("B-1"));
});

test("computeDisplayRows: search intersects with active filters (does not bypass them)", () => {
  const all = buildDisplayRows(transformToEpicTasks(rows));
  const filteredRows = applyFilters(rows, [{ column: "Status", values: ["Done"] }]);
  const filteredKeys = computeFilteredKeys(transformToEpicTasks(filteredRows), filteredRows);
  const display = computeDisplayRows(all, { hasActiveFilters: true, filteredKeys, searchTerm: "initiative" });
  const keys = display.map((r) => r.epic.epicKey);
  assert.ok(keys.includes("INIT-1"), "initiative still shown (matches search and has a matching child)");
  assert.ok(keys.includes("A-1"), "A-1 matches both the Done filter and the search");
  assert.ok(!keys.includes("A-2"), "A-2 matches the search only via its parent — the Done filter still excludes it");
});
