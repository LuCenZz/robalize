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

export function computeDisplayRows(allDisplayRows, { hasActiveFilters, filteredKeys, searchTerm }) {
  let rows = allDisplayRows;

  if (hasActiveFilters) {
    rows = rows.filter((r) => {
      if (r.type === "initiative") {
        const initiativeMatches = r.initiativeKey ? filteredKeys.has(r.initiativeKey) : false;
        const childMatches = r.children?.some((c) => filteredKeys.has(c.epicKey));
        return initiativeMatches || childMatches;
      }
      return filteredKeys.has(r.epic.epicKey);
    });
  }

  if (searchTerm.trim()) {
    const q = searchTerm.toLowerCase().trim();
    const matchingInitiativeKeys = new Set();
    rows = allDisplayRows.filter((row) => {
      if (row.type === "initiative") {
        const nameMatch = (row.initiativeName || "").toLowerCase().includes(q);
        const childMatch = row.children?.some(
          (c) => (c.epicKey || "").toLowerCase().includes(q) || (c.epicName || "").toLowerCase().includes(q)
        );
        const matches = nameMatch || childMatch;
        if (matches && row.initiativeKey) matchingInitiativeKeys.add(row.initiativeKey);
        return matches;
      }
      const epic = row.epic;
      const key = (epic.epicKey || "").toLowerCase();
      const name = (epic.epicName || "").toLowerCase();
      const parentMatches = row.initiativeKey ? matchingInitiativeKeys.has(row.initiativeKey) : false;
      return key.includes(q) || name.includes(q) || parentMatches;
    });
  }

  return rows;
}
