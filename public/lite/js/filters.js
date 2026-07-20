// Port of src/utils/filterEngine.ts + the filteredKeys/displayRows
// derivations from src/components/App.tsx (debug logs removed).

export function applyFilters(rows, filters) {
  if (filters.length === 0) return rows;

  return rows.filter((row) =>
    filters.every((filter) => {
      if (filter.values.length === 0) return true;
      const cellValue = (row[filter.column] || "").trim();
      return filter.values.includes(cellValue);
    })
  );
}

export function computeFilteredKeys(filteredEpicTasks, filteredRows) {
  const keys = new Set(filteredEpicTasks.map((e) => e.epicKey));
  for (const row of filteredRows) {
    const key = row["Issue key"];
    if (key) keys.add(key);
  }
  return keys;
}

function matchesFilters(row, filteredKeys) {
  if (row.type === "initiative") {
    const initiativeMatches = row.initiativeKey ? filteredKeys.has(row.initiativeKey) : false;
    const childMatches = row.children?.some((c) => filteredKeys.has(c.epicKey));
    return initiativeMatches || childMatches;
  }
  return filteredKeys.has(row.epic.epicKey);
}

// Which initiatives match the search by name or by a child's key/name —
// computed once over the full, unfiltered row list so a child kept only
// because its sibling matched ("parentMatches") is judged consistently
// regardless of which rows the active filters have already excluded.
function computeMatchingInitiativeKeys(allDisplayRows, q) {
  const keys = new Set();
  for (const row of allDisplayRows) {
    if (row.type !== "initiative") continue;
    const nameMatch = (row.initiativeName || "").toLowerCase().includes(q);
    const childMatch = row.children?.some(
      (c) => (c.epicKey || "").toLowerCase().includes(q) || (c.epicName || "").toLowerCase().includes(q)
    );
    if ((nameMatch || childMatch) && row.initiativeKey) keys.add(row.initiativeKey);
  }
  return keys;
}

function matchesSearch(row, q, matchingInitiativeKeys) {
  if (row.type === "initiative") {
    const nameMatch = (row.initiativeName || "").toLowerCase().includes(q);
    const childMatch = row.children?.some(
      (c) => (c.epicKey || "").toLowerCase().includes(q) || (c.epicName || "").toLowerCase().includes(q)
    );
    return nameMatch || childMatch;
  }
  const epic = row.epic;
  const key = (epic.epicKey || "").toLowerCase();
  const name = (epic.epicName || "").toLowerCase();
  const parentMatches = row.initiativeKey ? matchingInitiativeKeys.has(row.initiativeKey) : false;
  return key.includes(q) || name.includes(q) || parentMatches;
}

export function computeDisplayRows(allDisplayRows, { hasActiveFilters, filteredKeys, searchTerm }) {
  const hasSearch = !!searchTerm.trim();
  if (!hasActiveFilters && !hasSearch) return allDisplayRows;

  const q = searchTerm.toLowerCase().trim();
  const matchingInitiativeKeys = hasSearch ? computeMatchingInitiativeKeys(allDisplayRows, q) : null;

  return allDisplayRows.filter((row) => {
    const passesFilters = !hasActiveFilters || matchesFilters(row, filteredKeys);
    const passesSearch = !hasSearch || matchesSearch(row, q, matchingInitiativeKeys);
    return passesFilters && passesSearch;
  });
}
