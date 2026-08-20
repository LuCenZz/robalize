// Pure logic behind the "Priority" view: which display rows count as a
// top-level "initiative" row, reading a cell's value for an arbitrary raw
// Jira column, and the filter/sort/manual-order transforms applied to
// that row list. No DOM here — see priority.js for rendering.

// Same row shape as buildDisplayRows() in transform.js: a "initiative" row,
// or a standalone "epic" row with no initiativeKey (an epic with no parent
// is its own one-row group here, same convention forecast.js uses).
export function getPriorityRows(displayRows) {
  return displayRows.filter((r) => r.type === "initiative" || !r.initiativeKey);
}

export function priorityRowKey(row) {
  return row.type === "initiative" ? row.initiativeKey : row.epic.epicKey;
}

// "Issue key"/"Summary" are read off the row's own identity (epicKey/
// epicName) rather than epic.rawData — an initiative with no Jira row of
// its own falls back to its first child's rawData (see buildDisplayRows),
// so rawData["Issue key"] there would be a child's key, not the
// initiative's.
export function getPriorityCellValue(row, column) {
  if (column === "Issue key") return row.epic.epicKey || "";
  if (column === "Summary") return row.epic.epicName || "";
  const v = row.epic.rawData[column];
  return v ? String(v).trim() : "";
}

export function getPriorityColumnValues(rows, column) {
  const values = new Set();
  for (const row of rows) {
    const v = getPriorityCellValue(row, column);
    if (v) values.add(v);
  }
  return Array.from(values).sort();
}

export function applyPriorityColumnFilters(rows, colFilters) {
  const active = Object.entries(colFilters).filter(([, values]) => values.length > 0);
  if (active.length === 0) return rows;
  return rows.filter((row) =>
    active.every(([col, values]) => values.includes(getPriorityCellValue(row, col)))
  );
}

export function sortPriorityRows(rows, sortCol, sortDir) {
  if (!sortCol || !sortDir) return rows;
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = getPriorityCellValue(a, sortCol).toLowerCase();
    const vb = getPriorityCellValue(b, sortCol).toLowerCase();
    return va < vb ? -dir : va > vb ? dir : 0;
  });
}

// Arranges rows per the user's manual drag order (an array of row keys);
// any row not listed — newly synced from JIRA, or not yet dragged —
// keeps its incoming relative order, appended after the ordered ones.
export function applyPriorityOrder(rows, order) {
  if (!order || order.length === 0) return rows;
  const byKey = new Map(rows.map((r) => [priorityRowKey(r), r]));
  const seen = new Set();
  const ordered = [];
  for (const key of order) {
    const row = byKey.get(key);
    if (row) {
      ordered.push(row);
      seen.add(key);
    }
  }
  for (const row of rows) {
    if (!seen.has(priorityRowKey(row))) ordered.push(row);
  }
  return ordered;
}
