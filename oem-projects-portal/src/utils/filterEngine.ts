import { RawRow, ActiveFilter } from "../types";

export function applyFilters(
  rows: RawRow[],
  filters: ActiveFilter[]
): RawRow[] {
  if (filters.length === 0) return rows;

  return rows.filter((row) =>
    filters.every((filter) => {
      if (filter.values.length === 0) return true;
      const cellValue = (row[filter.column] || "").trim();
      return filter.values.includes(cellValue);
    })
  );
}
