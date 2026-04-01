import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { TopBar } from "./TopBar";
import { FileUploader } from "./FileUploader";
import { JiraConnector } from "./JiraConnector";
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

const SESSION_KEY = "oem-session-data";

function saveSession(data: RawRow[]) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota errors
  }
}

function loadSession(): RawRow[] | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function App() {
  const [rawData, setRawData] = useState<RawRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [jiraOpen, setJiraOpen] = useState(false);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [resetKey, setResetKey] = useState(0);

  // Restore session on mount
  useEffect(() => {
    const saved = loadSession();
    if (saved && saved.length > 0) {
      setRawData(saved);
      setColumns(extractColumns(saved));
    }
  }, []);

  const loadData = useCallback((rows: RawRow[]) => {
    setRawData(rows);
    setColumns(extractColumns(rows));
    setActiveFilters([]);
    setSearchTerm("");
    saveSession(rows);
  }, []);

  const handleFileSelected = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const rows = await parseFile(file);
      loadData(rows);
      setUploaderOpen(false);
    } catch (err) {
      console.error("Error parsing file:", err);
      alert("Error loading file. Please check the format.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Build all epics from ALL data (unfiltered) so initiatives are always available
  const allEpicTasks: EpicTask[] = useMemo(
    () => transformToEpicTasks(rawData),
    [rawData]
  );

  const allDisplayRows = useMemo(
    () => buildDisplayRows(allEpicTasks),
    [allEpicTasks]
  );

  // Filtered epic IDs (based on active filters)
  const filteredRows = useMemo(
    () => applyFilters(rawData, activeFilters),
    [rawData, activeFilters]
  );

  const filteredEpicTasks: EpicTask[] = useMemo(
    () => transformToEpicTasks(filteredRows),
    [filteredRows]
  );

  const filteredEpicKeys = useMemo(
    () => new Set(filteredEpicTasks.map((e) => e.epicKey)),
    [filteredEpicTasks]
  );

  const hasActiveFilters = activeFilters.some((f) => f.values.length > 0);

  const displayRows = useMemo(() => {
    let rows = allDisplayRows;

    // When filters are active, keep only epics that match + initiatives that have matching children
    if (hasActiveFilters) {
      rows = rows.filter((r) => {
        if (r.type === "initiative") {
          return r.children?.some((c) => filteredEpicKeys.has(c.epicKey));
        }
        return filteredEpicKeys.has(r.epic.epicKey);
      });
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      rows = rows.filter((row) => {
        if (row.type === "initiative") {
          // Keep initiative if its name or any child matches
          const nameMatch = (row.initiativeName || "").toLowerCase().includes(q);
          const childMatch = row.children?.some((c) =>
            (c.epicKey || "").toLowerCase().includes(q) || (c.epicName || "").toLowerCase().includes(q)
          );
          return nameMatch || childMatch;
        }
        const epic = row.epic;
        const key = (epic.epicKey || "").toLowerCase();
        const name = (epic.epicName || "").toLowerCase();
        return key.includes(q) || name.includes(q);
      });
    }

    return rows;
  }, [allDisplayRows, searchTerm, hasActiveFilters, filteredEpicKeys]);

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
        projectCount={filteredEpicTasks.length}
        onUploadClick={() => setUploaderOpen(true)}
        onJiraClick={() => setJiraOpen(true)}
        jiraConnected={jiraConnected}
        onGeneratePptx={() => generatePptx(filteredEpicTasks)}
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
            gap: 24,
            color: theme.textMuted,
          }}
        >
          <p style={{ fontSize: 20, fontWeight: 600, color: theme.textDark, margin: 0 }}>
            Get started
          </p>
          <div style={{ display: "flex", gap: 24 }}>
            {/* Jira option */}
            <div
              onClick={() => { setUploaderOpen(false); setJiraOpen(true); }}
              style={{
                width: 200,
                padding: "28px 20px",
                borderRadius: 14,
                border: `2px solid ${theme.borderLight}`,
                background: "white",
                cursor: "pointer",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.primary; e.currentTarget.style.boxShadow = `0 4px 16px ${theme.primary}22`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.borderLight; e.currentTarget.style.boxShadow = "none"; }}
            >
              <span style={{ fontSize: 32 }}>🔗</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: theme.textDark }}>Connect to Jira</span>
              <span style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.4 }}>
                Import directly via JQL query
              </span>
            </div>
            {/* CSV option */}
            <div
              onClick={() => { setJiraOpen(false); setUploaderOpen(true); }}
              style={{
                width: 200,
                padding: "28px 20px",
                borderRadius: 14,
                border: `2px solid ${theme.borderLight}`,
                background: "white",
                cursor: "pointer",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.primary; e.currentTarget.style.boxShadow = `0 4px 16px ${theme.primary}22`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.borderLight; e.currentTarget.style.boxShadow = "none"; }}
            >
              <span style={{ fontSize: 32 }}>📄</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: theme.textDark }}>Load CSV / Excel</span>
              <span style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.4 }}>
                Upload a file exported from Jira
              </span>
            </div>
          </div>
        </div>
      )}

      {!loading && rawData.length > 0 && (
        <Suspense fallback={<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: theme.textMuted }}>Loading Gantt...</div>}>
          <GanttChart tasks={filteredEpicTasks} displayRows={displayRows} resetKey={resetKey} />
        </Suspense>
      )}

      <FileUploader
        open={uploaderOpen}
        onClose={() => setUploaderOpen(false)}
        onFileSelected={handleFileSelected}
      />

      <JiraConnector
        open={jiraOpen}
        onClose={() => setJiraOpen(false)}
        onDataLoaded={loadData}
        connected={jiraConnected}
        onConnectionChange={setJiraConnected}
      />
    </div>
  );
}
