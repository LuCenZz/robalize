# OEM Projects Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React web portal that loads JIRA CSV/Excel exports and displays Epics in an interactive Gantt chart with dynamic filtering.

**Architecture:** Single-page React app (Vite + TypeScript). CSV/Excel files are parsed client-side with Papa Parse / SheetJS. DHTMLX Gantt renders one row per Epic with 5 colored phase segments. All columns from the CSV auto-generate filter dropdowns.

**Tech Stack:** React 18, TypeScript, Vite, DHTMLX Gantt (GPL), Papa Parse, SheetJS/xlsx

---

## File Structure

```
oem-projects-portal/
├── public/
├── src/
│   ├── components/
│   │   ├── App.tsx              # Main layout, state orchestrator
│   │   ├── TopBar.tsx           # Nextlane branded nav + upload button
│   │   ├── FilterBar.tsx        # Dynamic filter controls
│   │   ├── GanttChart.tsx       # DHTMLX Gantt wrapper
│   │   └── FileUploader.tsx     # Drag & drop modal
│   ├── utils/
│   │   ├── parseFile.ts         # CSV/Excel → array of row objects
│   │   ├── transformData.ts     # Row objects → DHTMLX Gantt tasks
│   │   └── filterEngine.ts      # Apply active filters to dataset
│   ├── types/
│   │   └── index.ts             # All TypeScript interfaces
│   ├── styles/
│   │   └── theme.ts             # Nextlane colors & constants
│   ├── App.css                  # Global styles
│   ├── main.tsx                 # Entry point
│   └── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `oem-projects-portal/package.json`
- Create: `oem-projects-portal/tsconfig.json`
- Create: `oem-projects-portal/vite.config.ts`
- Create: `oem-projects-portal/index.html`
- Create: `oem-projects-portal/src/main.tsx`
- Create: `oem-projects-portal/src/types/index.ts`
- Create: `oem-projects-portal/src/styles/theme.ts`

- [ ] **Step 1: Create the project with Vite**

```bash
cd "/Users/cedricr/OEM PROJECTS"
npm create vite@latest oem-projects-portal -- --template react-ts
```

- [ ] **Step 2: Install dependencies**

```bash
cd "/Users/cedricr/OEM PROJECTS/oem-projects-portal"
npm install dhtmlx-gantt papaparse xlsx
npm install -D @types/papaparse
```

- [ ] **Step 3: Create `src/types/index.ts`**

```typescript
export interface RawRow {
  [columnName: string]: string;
}

export interface PhaseSegment {
  id: string;
  phaseName: string;
  color: string;
  startDate: Date;
  endDate: Date;
}

export interface EpicTask {
  id: number;
  epicKey: string;
  epicName: string;
  status: string;
  phases: PhaseSegment[];
  rawData: RawRow;
}

export interface ActiveFilter {
  column: string;
  values: string[];
}

export const PHASE_CONFIG = [
  {
    name: "Analysis",
    color: "#ffd43b",
    startCol: "Custom field (Analysis Start Date)",
    endCol: "Custom field (Analysis End Date)",
  },
  {
    name: "Development",
    color: "#ff922b",
    startCol: "Custom field (Development Start Date)",
    endCol: "Custom field (Development End Date)",
  },
  {
    name: "QA / Test",
    color: "#51cf66",
    startCol: "Custom field (QA Start Date)",
    endCol: "Custom field (QA End Date)",
  },
  {
    name: "Customer UAT",
    color: "#339af0",
    startCol: "Custom field (Customer UAT Start Date)",
    endCol: "Custom field (Customer UAT End Date)",
  },
  {
    name: "Pilot",
    color: "#1864ab",
    startCol: "Custom field (Pilot Start Date)",
    endCol: "Custom field (Pilot End Date)",
  },
] as const;
```

- [ ] **Step 4: Create `src/styles/theme.ts`**

```typescript
export const theme = {
  primary: "#6B2CF5",
  background: "#ffffff",
  filterBarBg: "#f8f6ff",
  borderLight: "#e8e0ff",
  borderRow: "#ece8f8",
  rowAlt: "#fdfcff",
  textDark: "#1a1a2e",
  textMuted: "#8b7bb5",
  fontFamily: "system-ui, -apple-system, sans-serif",
} as const;
```

- [ ] **Step 5: Verify the app runs**

```bash
cd "/Users/cedricr/OEM PROJECTS/oem-projects-portal"
npm run dev
```

Expected: Vite dev server starts on `http://localhost:5173`, default React page loads.

- [ ] **Step 6: Commit**

```bash
cd "/Users/cedricr/OEM PROJECTS/oem-projects-portal"
git add -A
git commit -m "feat: scaffold project with Vite, add types and theme"
```

---

### Task 2: File Parsing (CSV & Excel)

**Files:**
- Create: `src/utils/parseFile.ts`
- Test: manual test with the real CSV file

- [ ] **Step 1: Create `src/utils/parseFile.ts`**

```typescript
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { RawRow } from "../types";

export function parseFile(file: File): Promise<RawRow[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    return parseCsv(file);
  } else if (extension === "xlsx" || extension === "xls") {
    return parseExcel(file);
  }

  throw new Error(`Unsupported file type: .${extension}`);
}

function parseCsv(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error: Error) => reject(error),
    });
  });
}

function parseExcel(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<RawRow>(firstSheet, {
          defval: "",
        });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/parseFile.ts
git commit -m "feat: add CSV and Excel file parsing"
```

---

### Task 3: Data Transformation (Rows → Gantt Tasks)

**Files:**
- Create: `src/utils/transformData.ts`

- [ ] **Step 1: Create `src/utils/transformData.ts`**

```typescript
import { RawRow, EpicTask, PhaseSegment, PHASE_CONFIG } from "../types";

/**
 * Parse a date string from JIRA CSV export.
 * Handles formats like "23 Mar 2026", "23/Mar/26", "2026-03-23", etc.
 */
function parseJiraDate(value: string): Date | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();

  // Try "DD Mon YYYY" format (e.g., "23 Mar 2026")
  const dmy = trimmed.match(
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i
  );
  if (dmy) {
    const parsed = new Date(`${dmy[2]} ${dmy[1]}, ${dmy[3]}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Try "DD/Mon/YY" format (e.g., "23/Mar/26")
  const slashed = trimmed.match(
    /^(\d{1,2})\/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\/(\d{2,4})$/i
  );
  if (slashed) {
    const year =
      slashed[3].length === 2 ? `20${slashed[3]}` : slashed[3];
    const parsed = new Date(`${slashed[2]} ${slashed[1]}, ${year}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Fallback: try native Date parsing
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) return fallback;

  return null;
}

export function transformToEpicTasks(rows: RawRow[]): EpicTask[] {
  return rows
    .map((row, index) => {
      const phases: PhaseSegment[] = [];

      for (const phase of PHASE_CONFIG) {
        const startDate = parseJiraDate(row[phase.startCol]);
        const endDate = parseJiraDate(row[phase.endCol]);

        if (startDate && endDate) {
          phases.push({
            id: `${index}-${phase.name}`,
            phaseName: phase.name,
            color: phase.color,
            startDate,
            endDate,
          });
        }
      }

      return {
        id: index + 1,
        epicKey: row["Issue key"] || `EPIC-${index + 1}`,
        epicName: row["Summary"] || "Unnamed Epic",
        status: row["Status"] || "",
        phases,
        rawData: row,
      };
    })
    .filter((epic) => epic.phases.length > 0);
}

/**
 * Extract all unique column names from the dataset.
 */
export function extractColumns(rows: RawRow[]): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).filter((col) => col.trim() !== "");
}

/**
 * Extract unique non-empty values for a given column.
 */
export function extractUniqueValues(
  rows: RawRow[],
  column: string
): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const val = row[column];
    if (val && val.trim()) {
      values.add(val.trim());
    }
  }
  return Array.from(values).sort();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/transformData.ts
git commit -m "feat: add data transformation from CSV rows to Gantt tasks"
```

---

### Task 4: Filter Engine

**Files:**
- Create: `src/utils/filterEngine.ts`

- [ ] **Step 1: Create `src/utils/filterEngine.ts`**

```typescript
import { RawRow, ActiveFilter } from "../types";

/**
 * Filter rows based on active filters.
 * A row passes if it matches ALL active filters (AND logic).
 * Within a single filter, the row passes if its value matches ANY selected value (OR logic).
 */
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
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/filterEngine.ts
git commit -m "feat: add filter engine with AND/OR logic"
```

---

### Task 5: TopBar Component

**Files:**
- Create: `src/components/TopBar.tsx`

- [ ] **Step 1: Create `src/components/TopBar.tsx`**

```tsx
import { theme } from "../styles/theme";

interface TopBarProps {
  projectCount: number;
  onUploadClick: () => void;
}

export function TopBar({ projectCount, onUploadClick }: TopBarProps) {
  return (
    <div
      style={{
        background: theme.primary,
        color: "white",
        padding: "14px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: theme.fontFamily,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }}
        >
          nextlane
        </span>
        <span style={{ opacity: 0.5, fontSize: 13, marginLeft: 8 }}>
          |
        </span>
        <span style={{ opacity: 0.9, fontSize: 14, marginLeft: 8 }}>
          OEM Projects
        </span>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        {projectCount > 0 && (
          <span style={{ opacity: 0.8, fontSize: 12 }}>
            {projectCount} projets chargés
          </span>
        )}
        <button
          onClick={onUploadClick}
          style={{
            background: "white",
            color: theme.primary,
            border: "none",
            padding: "7px 16px",
            borderRadius: 20,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          Charger CSV/Excel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TopBar.tsx
git commit -m "feat: add TopBar component with Nextlane branding"
```

---

### Task 6: FileUploader Component

**Files:**
- Create: `src/components/FileUploader.tsx`

- [ ] **Step 1: Create `src/components/FileUploader.tsx`**

```tsx
import { useRef, useState, DragEvent } from "react";
import { theme } from "../styles/theme";

interface FileUploaderProps {
  open: boolean;
  onClose: () => void;
  onFileSelected: (file: File) => void;
}

export function FileUploader({
  open,
  onClose,
  onFileSelected,
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (!open) return null;

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        fontFamily: theme.fontFamily,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: 40,
          maxWidth: 500,
          width: "90%",
          textAlign: "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ color: theme.textDark, margin: "0 0 8px 0" }}>
          Charger un fichier
        </h2>
        <p style={{ color: theme.textMuted, margin: "0 0 24px 0" }}>
          CSV ou Excel exporté depuis JIRA
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragging ? theme.primary : theme.borderLight}`,
            borderRadius: 8,
            padding: "40px 20px",
            background: dragging ? theme.filterBarBg : "white",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onClick={() => inputRef.current?.click()}
        >
          <p
            style={{
              color: theme.textDark,
              fontSize: 16,
              margin: "0 0 8px 0",
            }}
          >
            Glissez votre fichier ici
          </p>
          <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>
            ou cliquez pour parcourir
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FileUploader.tsx
git commit -m "feat: add FileUploader with drag & drop modal"
```

---

### Task 7: FilterBar Component

**Files:**
- Create: `src/components/FilterBar.tsx`

- [ ] **Step 1: Create `src/components/FilterBar.tsx`**

```tsx
import { useState } from "react";
import { ActiveFilter } from "../types";
import { theme } from "../styles/theme";

interface FilterBarProps {
  columns: string[];
  activeFilters: ActiveFilter[];
  getUniqueValues: (column: string) => string[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
}

export function FilterBar({
  columns,
  activeFilters,
  getUniqueValues,
  onFiltersChange,
}: FilterBarProps) {
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const activeColumnNames = activeFilters.map((f) => f.column);
  const availableColumns = columns.filter(
    (c) => !activeColumnNames.includes(c)
  );
  const filteredAvailable = availableColumns.filter((c) =>
    c.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function addFilter(column: string) {
    onFiltersChange([...activeFilters, { column, values: [] }]);
    setShowAddDropdown(false);
    setSearchTerm("");
  }

  function removeFilter(column: string) {
    onFiltersChange(activeFilters.filter((f) => f.column !== column));
  }

  function updateFilterValues(column: string, values: string[]) {
    onFiltersChange(
      activeFilters.map((f) =>
        f.column === column ? { ...f, values } : f
      )
    );
  }

  function resetAll() {
    onFiltersChange([]);
  }

  if (columns.length === 0) return null;

  return (
    <div
      style={{
        background: theme.filterBarBg,
        borderBottom: `2px solid ${theme.borderLight}`,
        padding: "10px 20px",
        fontFamily: theme.fontFamily,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color: theme.primary,
            fontSize: 12,
            marginRight: 4,
          }}
        >
          Filtres
        </span>

        {activeFilters.map((filter) => {
          const uniqueValues = getUniqueValues(filter.column);
          return (
            <div
              key={filter.column}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <select
                multiple
                value={filter.values}
                onChange={(e) => {
                  const selected = Array.from(
                    e.target.selectedOptions,
                    (o) => o.value
                  );
                  updateFilterValues(filter.column, selected);
                }}
                title={filter.column}
                style={{
                  padding: "5px 10px",
                  border: `1.5px solid #c9b8ff`,
                  borderRadius: 6,
                  fontSize: 12,
                  background: "white",
                  color: "#333",
                  minWidth: 120,
                  maxHeight: 28,
                  overflow: "hidden",
                }}
              >
                {uniqueValues.map((val) => (
                  <option key={val} value={val}>
                    {val}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeFilter(filter.column)}
                style={{
                  background: "none",
                  border: "none",
                  color: theme.primary,
                  cursor: "pointer",
                  fontSize: 14,
                  padding: "0 2px",
                }}
                title={`Supprimer filtre ${filter.column}`}
              >
                x
              </button>
            </div>
          );
        })}

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowAddDropdown(!showAddDropdown)}
            style={{
              background: theme.primary,
              border: "none",
              padding: "5px 14px",
              borderRadius: 6,
              fontSize: 12,
              cursor: "pointer",
              color: "white",
              fontWeight: 500,
            }}
          >
            + Ajouter filtre
          </button>
          {showAddDropdown && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                background: "white",
                border: `1px solid ${theme.borderLight}`,
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                zIndex: 100,
                width: 300,
                maxHeight: 400,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <input
                type="text"
                placeholder="Rechercher un champ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
                style={{
                  padding: "8px 12px",
                  border: "none",
                  borderBottom: `1px solid ${theme.borderLight}`,
                  outline: "none",
                  fontSize: 13,
                }}
              />
              <div style={{ overflowY: "auto", maxHeight: 350 }}>
                {filteredAvailable.map((col) => (
                  <div
                    key={col}
                    onClick={() => addFilter(col)}
                    style={{
                      padding: "8px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                      borderBottom: `1px solid ${theme.borderRow}`,
                      color: theme.textDark,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        theme.filterBarBg)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "white")
                    }
                  >
                    {col}
                  </div>
                ))}
                {filteredAvailable.length === 0 && (
                  <div
                    style={{
                      padding: "12px",
                      color: theme.textMuted,
                      fontSize: 12,
                      textAlign: "center",
                    }}
                  >
                    Aucun champ trouvé
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {activeFilters.length > 0 && (
          <button
            onClick={resetAll}
            style={{
              background: "white",
              border: `1.5px solid #c9b8ff`,
              padding: "5px 12px",
              borderRadius: 6,
              fontSize: 12,
              cursor: "pointer",
              color: theme.primary,
              marginLeft: "auto",
            }}
          >
            Réinitialiser
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FilterBar.tsx
git commit -m "feat: add FilterBar with dynamic column search and multi-select"
```

---

### Task 8: GanttChart Component

**Files:**
- Create: `src/components/GanttChart.tsx`

- [ ] **Step 1: Create `src/components/GanttChart.tsx`**

This is the core component. DHTMLX Gantt uses an imperative API, so we wrap it in a React component with `useEffect`.

```tsx
import { useEffect, useRef } from "react";
import { gantt } from "dhtmlx-gantt";
import "dhtmlx-gantt/codebase/dhtmlxgantt.css";
import { EpicTask } from "../types";
import { theme } from "../styles/theme";

interface GanttChartProps {
  tasks: EpicTask[];
}

export function GanttChart({ tasks }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!initialized.current) {
      // Configure Gantt
      gantt.config.readonly = true;
      gantt.config.date_format = "%Y-%m-%d";
      gantt.config.fit_tasks = true;
      gantt.config.show_progress = false;
      gantt.config.drag_move = false;
      gantt.config.drag_resize = false;
      gantt.config.drag_links = false;
      gantt.config.show_links = false;
      gantt.config.row_height = 40;
      gantt.config.bar_height = 22;
      gantt.config.scale_height = 40;

      // Left-side columns
      gantt.config.columns = [
        {
          name: "text",
          label: "Epic Name",
          tree: false,
          width: 250,
          resize: true,
        },
        {
          name: "status",
          label: "Status",
          align: "center",
          width: 100,
          resize: true,
          template: (task: any) => {
            if (!task.status) return "";
            return `<span style="
              font-size:10px;
              background:${theme.primary}22;
              color:${theme.primary};
              padding:3px 8px;
              border-radius:10px;
              font-weight:500;
            ">${task.status}</span>`;
          },
        },
      ];

      // Timeline scales
      gantt.config.scales = [
        { unit: "month", step: 1, format: "%M %Y" },
        { unit: "week", step: 1, format: "W%W" },
      ];

      // Custom task color based on phase
      gantt.templates.task_class = (start: Date, end: Date, task: any) => {
        return task.phaseClass || "";
      };

      // Tooltip
      gantt.templates.tooltip_text = (
        start: Date,
        end: Date,
        task: any
      ) => {
        const startStr = start.toLocaleDateString("fr-FR");
        const endStr = end.toLocaleDateString("fr-FR");
        return `<b>${task.phaseName || task.text}</b><br/>
                ${startStr} — ${endStr}`;
      };

      // Style: white headers
      gantt.templates.scale_cell_class = () => "gantt-white-header";

      // Row alternation
      gantt.templates.grid_row_class = (start: Date, end: Date, task: any) => {
        return task.$index % 2 === 0 ? "" : "gantt-row-alt";
      };
      gantt.templates.task_row_class = (start: Date, end: Date, task: any) => {
        return task.$index % 2 === 0 ? "" : "gantt-row-alt";
      };

      gantt.init(containerRef.current);
      initialized.current = true;
    }

    // Convert EpicTasks to DHTMLX format
    const ganttData: any[] = [];

    tasks.forEach((epic) => {
      // Parent project row (invisible bar, just groups phases)
      ganttData.push({
        id: epic.id,
        text: epic.epicName,
        status: epic.status,
        start_date: null,
        duration: 0,
        type: "project",
        open: true,
        render: "split",
      });

      // One child task per phase
      epic.phases.forEach((phase) => {
        ganttData.push({
          id: phase.id,
          text: "",
          phaseName: phase.name,
          start_date: formatDate(phase.startDate),
          end_date: formatDate(phase.endDate),
          parent: epic.id,
          color: phase.color,
          textColor: "transparent",
        });
      });
    });

    gantt.clearAll();
    gantt.parse({
      data: ganttData,
      links: [],
    });

    return () => {
      // Don't destroy on re-render, just clear data
    };
  }, [tasks]);

  return (
    <>
      <style>{`
        .gantt-white-header {
          background: white !important;
          color: ${theme.textDark} !important;
          font-weight: 700 !important;
          border-color: ${theme.borderLight} !important;
        }
        .gantt_grid_head_cell {
          background: white !important;
          color: ${theme.textDark} !important;
          font-weight: 700 !important;
          border-color: ${theme.borderLight} !important;
        }
        .gantt_scale_line {
          border-color: ${theme.borderLight} !important;
        }
        .gantt-row-alt {
          background: ${theme.rowAlt} !important;
        }
        .gantt_task_line {
          border-radius: 4px !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12) !important;
          border: none !important;
        }
        .gantt_grid_data .gantt_cell {
          border-color: ${theme.borderRow} !important;
          font-family: ${theme.fontFamily} !important;
          color: ${theme.textDark} !important;
        }
        .gantt_grid_head_cell {
          font-family: ${theme.fontFamily} !important;
        }
        .gantt_scale_cell {
          font-family: ${theme.fontFamily} !important;
        }
        .gantt_task_content {
          display: none !important;
        }
        .gantt_tree_icon {
          display: none !important;
        }
        .gantt_grid_data .gantt_row.gantt_project .gantt_cell {
          font-weight: 500 !important;
        }
      `}</style>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          width: "100%",
          fontFamily: theme.fontFamily,
        }}
      />
    </>
  );
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/GanttChart.tsx
git commit -m "feat: add GanttChart component with DHTMLX Gantt and Nextlane styling"
```

---

### Task 9: App Component (Orchestrator)

**Files:**
- Create: `src/components/App.tsx`
- Modify: `src/main.tsx`
- Create: `src/App.css`

- [ ] **Step 1: Create `src/App.css`**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  width: 100%;
  overflow: hidden;
}
```

- [ ] **Step 2: Create `src/components/App.tsx`**

```tsx
import { useState, useCallback, useMemo } from "react";
import { TopBar } from "./TopBar";
import { FileUploader } from "./FileUploader";
import { FilterBar } from "./FilterBar";
import { GanttChart } from "./GanttChart";
import { parseFile } from "../utils/parseFile";
import {
  transformToEpicTasks,
  extractColumns,
  extractUniqueValues,
} from "../utils/transformData";
import { applyFilters } from "../utils/filterEngine";
import { RawRow, ActiveFilter, EpicTask } from "../types";
import { theme } from "../styles/theme";

export function App() {
  const [rawData, setRawData] = useState<RawRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [uploaderOpen, setUploaderOpen] = useState(true);
  const [loading, setLoading] = useState(false);

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
      alert("Erreur lors du chargement du fichier. Vérifiez le format.");
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
          Chargement en cours...
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
            Chargez un fichier CSV ou Excel pour commencer
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
            Charger un fichier
          </button>
        </div>
      )}

      {!loading && rawData.length > 0 && <GanttChart tasks={epicTasks} />}

      <FileUploader
        open={uploaderOpen}
        onClose={() => setUploaderOpen(false)}
        onFileSelected={handleFileSelected}
      />
    </div>
  );
}
```

- [ ] **Step 3: Update `src/main.tsx`**

Replace the content of `src/main.tsx` with:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/App";
import "./App.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 4: Delete default Vite files**

Remove the default `src/App.tsx`, `src/App.css` (if Vite created one at root), `src/index.css`, and the `src/assets/` folder that Vite scaffolded.

```bash
rm -f src/App.tsx src/index.css
rm -rf src/assets
```

- [ ] **Step 5: Run the app and verify**

```bash
npm run dev
```

Expected: App loads at `http://localhost:5173` with the Nextlane purple header, "Charger CSV/Excel" button, and upload modal open. Upload the test CSV file `~/Downloads/iCar OEM PROJECTS (Jira).csv` — the Gantt should render with colored bars.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire up App with all components, file upload and Gantt rendering"
```

---

### Task 10: Zoom Controls

**Files:**
- Modify: `src/components/GanttChart.tsx`

- [ ] **Step 1: Add zoom buttons to `GanttChart.tsx`**

Add a zoom control bar above the Gantt container. Update the component to include zoom state and buttons:

At the top of the component function, add:

```tsx
const [zoomLevel, setZoomLevel] = useState<"day" | "week" | "month">("month");

function applyZoom(level: "day" | "week" | "month") {
  setZoomLevel(level);
  if (level === "day") {
    gantt.config.scales = [
      { unit: "month", step: 1, format: "%M %Y" },
      { unit: "day", step: 1, format: "%d" },
    ];
  } else if (level === "week") {
    gantt.config.scales = [
      { unit: "month", step: 1, format: "%M %Y" },
      { unit: "week", step: 1, format: "W%W" },
    ];
  } else {
    gantt.config.scales = [
      { unit: "year", step: 1, format: "%Y" },
      { unit: "month", step: 1, format: "%M" },
    ];
  }
  gantt.render();
}
```

Add `useState` to the import line. Then update the return JSX to include zoom buttons above the gantt container:

```tsx
return (
  <>
    <style>{`/* ... same CSS as before ... */`}</style>
    <div
      style={{
        padding: "8px 20px",
        display: "flex",
        gap: 8,
        alignItems: "center",
        borderBottom: `1px solid ${theme.borderLight}`,
        background: "white",
      }}
    >
      <span style={{ fontSize: 12, color: theme.textMuted, marginRight: 4 }}>
        Zoom :
      </span>
      {(["day", "week", "month"] as const).map((level) => (
        <button
          key={level}
          onClick={() => applyZoom(level)}
          style={{
            padding: "4px 12px",
            borderRadius: 6,
            border: `1px solid ${theme.borderLight}`,
            background: zoomLevel === level ? theme.primary : "white",
            color: zoomLevel === level ? "white" : theme.textDark,
            fontSize: 12,
            cursor: "pointer",
            fontWeight: zoomLevel === level ? 600 : 400,
          }}
        >
          {level === "day" ? "Jour" : level === "week" ? "Semaine" : "Mois"}
        </button>
      ))}
    </div>
    <div ref={containerRef} style={{ flex: 1, width: "100%" }} />
  </>
);
```

Wrap the return in a fragment or a parent div with `style={{ flex: 1, display: "flex", flexDirection: "column" }}`.

- [ ] **Step 2: Verify zoom works**

```bash
npm run dev
```

Expected: Three zoom buttons (Jour / Semaine / Mois) appear above the Gantt. Clicking them changes the timeline scale.

- [ ] **Step 3: Commit**

```bash
git add src/components/GanttChart.tsx
git commit -m "feat: add zoom controls (day/week/month) to Gantt chart"
```

---

### Task 11: Final Polish & Integration Test

**Files:**
- Modify: `index.html` (update title)

- [ ] **Step 1: Update page title**

In `index.html`, change the `<title>` tag:

```html
<title>OEM Projects Portal — Nextlane</title>
```

- [ ] **Step 2: Full integration test**

```bash
npm run dev
```

Test checklist:
1. App loads with upload modal open
2. Upload `~/Downloads/iCar OEM PROJECTS (Jira).csv`
3. Gantt displays with colored phase bars (yellow, orange, green, blue, dark blue)
4. TopBar shows project count
5. Click "+ Ajouter filtre" → search for "Status" → add it
6. Select a status value → Gantt updates in real-time
7. Click "Réinitialiser" → all filters cleared
8. Zoom buttons work (Jour / Semaine / Mois)
9. Hover on a bar → tooltip shows phase name and dates
10. Click "Charger CSV/Excel" again → re-upload a file

- [ ] **Step 3: Build for production**

```bash
npm run build
```

Expected: Build completes without errors in `dist/` folder.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: finalize OEM Projects Portal POC"
```
