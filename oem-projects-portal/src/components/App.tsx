import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { TopBar } from "./TopBar";
import { FileUploader } from "./FileUploader";
import { FilterBar } from "./FilterBar";
import { parseFile } from "../utils/parseFile";

const GanttChart = lazy(() =>
  import("./GanttChart").then((m) => ({ default: m.GanttChart }))
);
import {
  transformToEpicTasks,
  buildDisplayRows,
  extractColumns,
  extractUniqueValues,
} from "../utils/transformData";
import { applyFilters } from "../utils/filterEngine";
import { generatePptx } from "../utils/generatePptx";
import type { RawRow, ActiveFilter, EpicTask } from "../types";
import { theme } from "../styles/theme";

export function App() {
  const [rawData, setRawData] = useState<RawRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [uploaderOpen, setUploaderOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const handleFileSelected = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const rows = await parseFile(file);
      setRawData(rows);
      setColumns(extractColumns(rows));
      setActiveFilters([]);
      setUploaderOpen(false);
    } catch (err) {
      console.error("Error parsing file:", err);
      alert("Error loading file. Please check the format.");
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredRows = useMemo(
    () => applyFilters(rawData, activeFilters),
    [rawData, activeFilters]
  );

  const epicTasks: EpicTask[] = useMemo(
    () => transformToEpicTasks(filteredRows),
    [filteredRows]
  );

  const allDisplayRows = useMemo(
    () => buildDisplayRows(epicTasks),
    [epicTasks]
  );

  const displayRows = useMemo(() => {
    if (!searchTerm.trim()) return allDisplayRows;
    const q = searchTerm.toLowerCase().trim();
    return allDisplayRows.filter((row) => {
      const epic = row.epic;
      const key = (epic.epicKey || "").toLowerCase();
      const name = (epic.epicName || "").toLowerCase();
      if (key.includes(q) || name.includes(q)) return true;
      // For initiatives, also match if any child matches
      if (row.children) {
        return row.children.some(
          (c) => c.epicKey.toLowerCase().includes(q) || c.epicName.toLowerCase().includes(q)
        );
      }
      return false;
    });
  }, [allDisplayRows, searchTerm]);

  const getUniqueValues = useCallback(
    (column: string) => extractUniqueValues(rawData, column),
    [rawData]
  );

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: theme.fontFamily,
        background: theme.background,
      }}
    >
      <TopBar
        projectCount={epicTasks.length}
        onUploadClick={() => setUploaderOpen(true)}
        onGeneratePptx={() => generatePptx(epicTasks)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      <FilterBar
        columns={columns}
        activeFilters={activeFilters}
        getUniqueValues={getUniqueValues}
        onFiltersChange={setActiveFilters}
      />

      {loading && (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.textMuted,
          }}
        >
          Loading...
        </div>
      )}

      {!loading && rawData.length === 0 && (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 12,
            color: theme.textMuted,
          }}
        >
          <p style={{ fontSize: 18 }}>
            Load a CSV or Excel file to get started
          </p>
          <button
            onClick={() => setUploaderOpen(true)}
            style={{
              background: theme.primary,
              color: "white",
              border: "none",
              padding: "10px 24px",
              borderRadius: 20,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Load a file
          </button>
        </div>
      )}

      {!loading && rawData.length > 0 && (
        <Suspense fallback={<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: theme.textMuted }}>Loading Gantt...</div>}>
          <GanttChart tasks={epicTasks} displayRows={displayRows} />
        </Suspense>
      )}

      <FileUploader
        open={uploaderOpen}
        onClose={() => setUploaderOpen(false)}
        onFileSelected={handleFileSelected}
      />
    </div>
  );
}
