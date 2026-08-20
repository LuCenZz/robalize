import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPriorityRows, priorityRowKey, getPriorityCellValue, getPriorityColumnValues,
  applyPriorityColumnFilters, sortPriorityRows, applyPriorityOrder,
} from "../../public/lite/js/priority-logic.js";

function epicRow(epicKey, epicName, rawData = {}, initiativeKey) {
  return { type: "epic", epic: { epicKey, epicName, rawData }, initiativeKey };
}
function initiativeRow(initiativeKey, initiativeName, rawData = {}) {
  return {
    type: "initiative",
    initiativeKey,
    epic: { epicKey: initiativeKey, epicName: initiativeName, rawData },
  };
}

test("getPriorityRows: keeps initiatives and orphan epics, drops epics that belong to an initiative", () => {
  const rows = [
    initiativeRow("INIT-1", "Initiative One"),
    epicRow("A-1", "Alpha", {}, "INIT-1"),
    epicRow("B-1", "Orphan Epic", {}, undefined),
  ];
  const result = getPriorityRows(rows);
  assert.deepEqual(result.map((r) => priorityRowKey(r)), ["INIT-1", "B-1"]);
});

test("getPriorityCellValue: Issue key and Summary read from the epic identity, not raw data", () => {
  const row = initiativeRow("INIT-1", "Initiative One", { "Issue key": "A-1", "Summary": "Alpha" });
  assert.equal(getPriorityCellValue(row, "Issue key"), "INIT-1");
  assert.equal(getPriorityCellValue(row, "Summary"), "Initiative One");
});

test("getPriorityCellValue: any other column reads the trimmed raw field, or '' when absent", () => {
  const row = initiativeRow("INIT-1", "Initiative One", { "Status": "  In Progress  " });
  assert.equal(getPriorityCellValue(row, "Status"), "In Progress");
  assert.equal(getPriorityCellValue(row, "Custom field (Product)"), "");
});

test("getPriorityColumnValues: unique, sorted, empty values excluded", () => {
  const rows = [
    initiativeRow("INIT-1", "One", { "Status": "Done" }),
    initiativeRow("INIT-2", "Two", { "Status": "Backlog" }),
    initiativeRow("INIT-3", "Three", { "Status": "Done" }),
    initiativeRow("INIT-4", "Four", { "Status": "" }),
  ];
  assert.deepEqual(getPriorityColumnValues(rows, "Status"), ["Backlog", "Done"]);
});

test("applyPriorityColumnFilters: no active filters is a no-op", () => {
  const rows = [initiativeRow("INIT-1", "One", { "Status": "Done" })];
  assert.equal(applyPriorityColumnFilters(rows, {}).length, 1);
  assert.equal(applyPriorityColumnFilters(rows, { "Status": [] }).length, 1);
});

test("applyPriorityColumnFilters: combines filters on different columns with AND", () => {
  const rows = [
    initiativeRow("INIT-1", "One", { "Status": "Done", "Custom field (Product)": "Alpha" }),
    initiativeRow("INIT-2", "Two", { "Status": "Done", "Custom field (Product)": "Beta" }),
    initiativeRow("INIT-3", "Three", { "Status": "Backlog", "Custom field (Product)": "Alpha" }),
  ];
  const result = applyPriorityColumnFilters(rows, {
    "Status": ["Done"],
    "Custom field (Product)": ["Alpha"],
  });
  assert.deepEqual(result.map((r) => r.initiativeKey), ["INIT-1"]);
});

test("sortPriorityRows: no sort column returns the rows unchanged", () => {
  const rows = [initiativeRow("INIT-2", "Two"), initiativeRow("INIT-1", "One")];
  assert.deepEqual(sortPriorityRows(rows, null, null).map((r) => r.initiativeKey), ["INIT-2", "INIT-1"]);
});

test("sortPriorityRows: sorts by column text, ascending or descending", () => {
  const rows = [
    initiativeRow("INIT-1", "One", { "Status": "Backlog" }),
    initiativeRow("INIT-2", "Two", { "Status": "Done" }),
    initiativeRow("INIT-3", "Three", { "Status": "Analysis" }),
  ];
  assert.deepEqual(
    sortPriorityRows(rows, "Status", "asc").map((r) => r.initiativeKey),
    ["INIT-3", "INIT-1", "INIT-2"]
  );
  assert.deepEqual(
    sortPriorityRows(rows, "Status", "desc").map((r) => r.initiativeKey),
    ["INIT-2", "INIT-1", "INIT-3"]
  );
});

test("applyPriorityOrder: no stored order returns the rows unchanged", () => {
  const rows = [initiativeRow("INIT-2", "Two"), initiativeRow("INIT-1", "One")];
  assert.deepEqual(applyPriorityOrder(rows, []).map((r) => r.initiativeKey), ["INIT-2", "INIT-1"]);
});

test("applyPriorityOrder: arranges rows per the stored order and appends new rows at the end", () => {
  const rows = [
    initiativeRow("INIT-1", "One"),
    initiativeRow("INIT-2", "Two"),
    initiativeRow("INIT-3", "Three"),
  ];
  const result = applyPriorityOrder(rows, ["INIT-3", "INIT-1"]);
  assert.deepEqual(result.map((r) => r.initiativeKey), ["INIT-3", "INIT-1", "INIT-2"]);
});

test("applyPriorityOrder: stale keys no longer present in rows are dropped without error", () => {
  const rows = [initiativeRow("INIT-1", "One"), initiativeRow("INIT-2", "Two")];
  const result = applyPriorityOrder(rows, ["INIT-9", "INIT-2", "INIT-1"]);
  assert.deepEqual(result.map((r) => r.initiativeKey), ["INIT-2", "INIT-1"]);
});
