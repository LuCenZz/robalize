# Robalize Lite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `public/lite/` — a vanilla HTML/JS duplicate of Robalize (JIRA → Gantt → filters → AI) with no login, no Supabase, no build step, served at `/lite/` on the same Vercel deployment.

**Architecture:** Native ES modules under `public/lite/js/`, no bundler, no npm client dependency. Pure logic (transform, filters, gantt math) is ported 1:1 from the TypeScript sources and unit-tested with `node --test`. UI modules render DOM from a single mutable `state` object with full re-render per region. Backend (`api/jira-proxy.ts`, `api/ai.ts`) is reused unchanged.

**Tech Stack:** HTML5, CSS (custom properties), vanilla ES2022 modules, `node --test` for pure-logic tests. Spec: `docs/superpowers/specs/2026-07-17-lite-html-migration-design.md`.

## Global Constraints

- Nothing in the existing app may be modified or deleted. Only allowed change outside `public/lite/` and `tests/lite/`: adding rewrites to `vercel.json`.
- No client-side npm dependencies, no build step. `public/lite/` files must run as-is in the browser.
- localStorage keys are shared with the existing app, verbatim: `oem-jira-config`, `oem-session-data`, `oem-prefs-<email>:<name>`.
- JIRA calls go through `/api/jira-proxy`, AI calls through `/api/ai` — unchanged endpoints.
- Ported logic must be behavior-identical to the TS sources (debug `console.log` calls are dropped). Source files are the reference: `src/utils/transformData.ts`, `src/utils/filterEngine.ts`, `src/utils/jiraFetch.ts`, `src/utils/userPrefs.ts`, `src/components/GanttChart.tsx`, `src/components/App.tsx`.
- Visual identity mirrors the existing app: same theme values as `src/styles/theme.ts`, same phase colors, same layout. When a step says "transcribe styles from `<file>:<lines>`", copy the exact CSS values from those lines.
- Tests live in `tests/lite/*.test.mjs`, run with `node --test tests/lite/`. Only pure modules get tests (no DOM emulation).
- All UI copy is in English (same as the existing app).
- Commit after every task.

---

### Task 1: Scaffold `public/lite/` + Vercel rewrite

**Files:**
- Create: `public/lite/index.html`
- Create: `public/lite/style.css`
- Create: `public/lite/js/main.js` (placeholder that proves module loading)
- Modify: `vercel.json` (add `/lite` rewrites BEFORE the SPA catch-all)

**Interfaces:**
- Produces: DOM anchors used by every later task: `#topbar`, `#error-banner`, `#filterbar`, `#gantt`, `#connector-root`, `#ai-root`, `#loading`.

- [ ] **Step 1: Write `public/lite/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Robalize Lite</title>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <div id="app">
    <header id="topbar"></header>
    <div id="error-banner" class="hidden"></div>
    <div id="filterbar"></div>
    <div id="loading" class="hidden">
      <div class="loading-label">Loading<span class="loading-dots"></span></div>
    </div>
    <main id="gantt"></main>
  </div>
  <div id="connector-root"></div>
  <div id="ai-root"></div>
  <script type="module" src="./js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `public/lite/style.css` (base layer)**

Theme values are copied verbatim from `src/styles/theme.ts`.

```css
:root {
  --primary: #6B2CF5;
  --primary-dark: #5520C8;
  --primary-light: #8B5CF6;
  --accent: #A78BFA;
  --background: #FAFAFE;
  --surface: #ffffff;
  --filterbar-bg: rgba(248, 246, 255, 0.85);
  --border-light: #E2D9F3;
  --border-row: #EEEAF5;
  --row-alt: #FCFBFE;
  --text-dark: #1B1340;
  --text-secondary: #4A3F6B;
  --text-muted: #9B8EC4;
  --gradient-primary: linear-gradient(135deg, #7C3AED 0%, #6B2CF5 50%, #5B21B6 100%);
  --shadow-sm: 0 1px 3px rgba(107, 44, 245, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 14px rgba(107, 44, 245, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 10px 40px rgba(107, 44, 245, 0.12), 0 4px 12px rgba(0, 0, 0, 0.05);
  --font: 'Aptos', 'Aptos Display', Calibri, sans-serif;
}

* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font-family: var(--font);
  background: var(--background);
  color: var(--text-dark);
  overflow: hidden;
}
button, input, textarea, select { font-family: var(--font); }

#app { height: 100vh; display: flex; flex-direction: column; }
#gantt { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.hidden { display: none !important; }

#error-banner {
  background: #fff0f0;
  border-bottom: 1px solid #ffc9c9;
  color: #e03131;
  font-size: 12px;
  padding: 8px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
#error-banner button {
  background: none; border: none; color: #e03131;
  cursor: pointer; font-size: 14px; padding: 0 4px;
}

#loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.loading-label {
  font-size: 14px; font-weight: 600; letter-spacing: 1.5px;
  text-transform: uppercase; color: var(--text-muted);
}
@keyframes loading-dots {
  0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; }
}
.loading-dots::after { content: ''; animation: loading-dots 1.4s steps(1, end) infinite; }
```

- [ ] **Step 3: Write placeholder `public/lite/js/main.js`**

```js
document.getElementById("topbar").textContent = "Robalize Lite — module loaded";
```

- [ ] **Step 4: Modify `vercel.json`**

Replace the `rewrites` array (currently at `vercel.json:5-8`) with — note the two new `/lite` lines come before the catch-all:

```json
  "rewrites": [
    { "source": "/api/jira-proxy/:path*", "destination": "/api/jira-proxy" },
    { "source": "/lite", "destination": "/lite/index.html" },
    { "source": "/lite/", "destination": "/lite/index.html" },
    { "source": "/((?!api/|lite/).*)", "destination": "/index.html" }
  ]
```

The catch-all gains `lite/` in its negative lookahead so `/lite/js/main.js` is never rewritten to the React app's `index.html`.

- [ ] **Step 5: Verify in dev**

Run: `npm run dev` (background), open `http://localhost:5173/lite/index.html`.
Expected: page shows "Robalize Lite — module loaded", no console errors.

- [ ] **Step 6: Verify the existing app still builds**

Run: `npm run build`
Expected: exit 0; `dist/lite/index.html` exists (Vite copies `public/` verbatim).

- [ ] **Step 7: Commit**

```bash
git add public/lite vercel.json
git commit -m "feat(lite): scaffold vanilla HTML shell served at /lite/"
```

---

### Task 2: `transform.js` — pure data transformation port

**Files:**
- Create: `public/lite/js/transform.js`
- Test: `tests/lite/transform.test.mjs`

**Interfaces:**
- Produces (all exported):
  - `PHASE_CONFIG: Array<{name, color, startCol, endCol}>` — same 5 entries as `src/types/index.ts:35-66`.
  - `parseJiraDate(value: string): Date | null`
  - `transformToEpicTasks(rows: RawRow[]): EpicTask[]` — `EpicTask = {id, epicKey, epicName, status, phases: PhaseSegment[], rawData}`; `PhaseSegment = {id, phaseName, color, startDate: Date, endDate: Date}`
  - `buildDisplayRows(epicTasks): DisplayRow[]` — `DisplayRow = {type: "initiative"|"epic", epic, initiativeKey?, initiativeName?, children?}`
  - `extractColumns(rows): string[]`
  - `extractUniqueValues(rows, column): string[]`

- [ ] **Step 1: Write the failing test `tests/lite/transform.test.mjs`**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lite/`
Expected: FAIL — `Cannot find module .../public/lite/js/transform.js`

- [ ] **Step 3: Write `public/lite/js/transform.js`**

Port of `src/utils/transformData.ts` + `PHASE_CONFIG` from `src/types/index.ts`. Mechanical rules: strip all type annotations/`import type`, drop the `console.log("[INITIATIVE]"...)` debug at `transformData.ts:146`, export `parseJiraDate` (private in TS) for tests. Full content:

```js
// Port of src/utils/transformData.ts + PHASE_CONFIG from src/types/index.ts.
// Logic must stay identical to the TypeScript source.

export const PHASE_CONFIG = [
  { name: "Analysis", color: "#ffd43b", startCol: "Custom field (Analysis Start Date)", endCol: "Custom field (Analysis End Date)" },
  { name: "Development", color: "#ff922b", startCol: "Custom field (Development Start Date)", endCol: "Custom field (Development End Date)" },
  { name: "QA / Test", color: "#51cf66", startCol: "Custom field (QA Start Date)", endCol: "Custom field (QA End Date)" },
  { name: "Customer UAT", color: "#339af0", startCol: "Custom field (Customer UAT Start Date)", endCol: "Custom field (Customer UAT End Date)" },
  { name: "Pilot", color: "#1864ab", startCol: "Custom field (Pilot Start Date)", endCol: "Custom field (Pilot End Date)" },
];

const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parseJiraDate(value) {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();

  const dmy = trimmed.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i);
  if (dmy) {
    const month = MONTH_INDEX[dmy[2].toLowerCase().substring(0, 3)];
    if (month !== undefined) return new Date(parseInt(dmy[3]), month, parseInt(dmy[1]));
  }

  const slashedWithTime = trimmed.match(/^(\d{1,2})\/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\/(\d{2,4})\s+/i);
  if (slashedWithTime) {
    const year = slashedWithTime[3].length === 2 ? 2000 + parseInt(slashedWithTime[3]) : parseInt(slashedWithTime[3]);
    const month = MONTH_INDEX[slashedWithTime[2].toLowerCase().substring(0, 3)];
    if (month !== undefined) return new Date(year, month, parseInt(slashedWithTime[1]));
  }

  const slashed = trimmed.match(/^(\d{1,2})\/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\/(\d{2,4})$/i);
  if (slashed) {
    const year = slashed[3].length === 2 ? 2000 + parseInt(slashed[3]) : parseInt(slashed[3]);
    const month = MONTH_INDEX[slashed[2].toLowerCase().substring(0, 3)];
    if (month !== undefined) return new Date(year, month, parseInt(slashed[1]));
  }

  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime()))
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());

  return null;
}

export function transformToEpicTasks(rows) {
  return rows
    .map((row, index) => {
      const phases = [];
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
    .sort((a, b) => {
      if (a.phases.length > 0 && b.phases.length > 0) {
        return getEarliestPhaseStart(a) - getEarliestPhaseStart(b);
      }
      if (a.phases.length > 0) return -1;
      if (b.phases.length > 0) return 1;
      return a.epicKey.localeCompare(b.epicKey);
    });
}

const PHASE_PRIORITY = ["Analysis", "Development", "QA / Test", "Customer UAT", "Pilot"];

function getEarliestPhaseStart(epic) {
  for (const name of PHASE_PRIORITY) {
    const phase = epic.phases.find((p) => p.phaseName === name);
    if (phase) return phase.startDate.getTime();
  }
  return epic.phases[0].startDate.getTime();
}

export function buildDisplayRows(epicTasks) {
  const rows = [];
  const grouped = new Map();
  const orphans = [];

  const byKey = new Map();
  for (const epic of epicTasks) {
    byKey.set(epic.epicKey, epic);
  }

  for (const epic of epicTasks) {
    const parentKey = (epic.rawData["Parent key"] || "").trim();
    const parentName = (epic.rawData["Parent summary"] || "").trim();
    if (parentKey) {
      const group = grouped.get(parentKey) || { name: parentName, children: [] };
      group.children.push(epic);
      grouped.set(parentKey, group);
    } else {
      orphans.push(epic);
    }
  }

  const initiativeKeys = new Set();

  for (const [key, group] of grouped) {
    initiativeKeys.add(key);

    const allPhases = [];
    for (const child of group.children) {
      for (const phase of child.phases) {
        allPhases.push(phase);
      }
    }

    const initiativeRow = byKey.get(key);
    const rawData = initiativeRow?.rawData || group.children[0]?.rawData || {};

    const initiativeEpic = {
      id: -Math.abs(hashCode(key)),
      epicKey: key,
      epicName: group.name || key,
      status: initiativeRow?.status || "",
      phases: allPhases,
      rawData,
    };

    rows.push({
      type: "initiative",
      epic: initiativeEpic,
      initiativeKey: key,
      initiativeName: group.name || key,
      children: group.children,
    });

    for (const child of group.children) {
      rows.push({ type: "epic", epic: child, initiativeKey: key });
    }
  }

  for (const epic of orphans) {
    if (!initiativeKeys.has(epic.epicKey)) {
      rows.push({ type: "epic", epic });
    }
  }

  return rows;
}

function hashCode(s) {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash;
}

export function extractColumns(rows) {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).filter((col) => col.trim() !== "");
}

export function extractUniqueValues(rows, column) {
  const values = new Set();
  for (const row of rows) {
    const val = row[column];
    if (val && val.trim()) {
      values.add(val.trim());
    }
  }
  return Array.from(values).sort();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lite/`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add public/lite/js/transform.js tests/lite/transform.test.mjs
git commit -m "feat(lite): port data transformation logic with tests"
```

---

### Task 3: `filters.js` — filter + search pipeline port

**Files:**
- Create: `public/lite/js/filters.js`
- Test: `tests/lite/filters.test.mjs`

**Interfaces:**
- Consumes: `DisplayRow`/`EpicTask` shapes from Task 2.
- Produces (all exported):
  - `applyFilters(rows: RawRow[], filters: ActiveFilter[]): RawRow[]` — `ActiveFilter = {column, values: string[]}`
  - `computeFilteredKeys(filteredEpicTasks, filteredRows): Set<string>`
  - `computeDisplayRows(allDisplayRows, {hasActiveFilters, filteredKeys, searchTerm}): DisplayRow[]`

- [ ] **Step 1: Write the failing test `tests/lite/filters.test.mjs`**

```js
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

test("computeDisplayRows: search ignores active filters (searches all rows)", () => {
  const all = buildDisplayRows(transformToEpicTasks(rows));
  const display = computeDisplayRows(all, { hasActiveFilters: true, filteredKeys: new Set(["B-1"]), searchTerm: "beta" });
  const keys = display.map((r) => r.epic.epicKey);
  assert.ok(keys.includes("A-2"), "search bypasses filters");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lite/`
Expected: FAIL — `Cannot find module .../filters.js`

- [ ] **Step 3: Write `public/lite/js/filters.js`**

Port of `src/utils/filterEngine.ts` plus the derived-rows logic from `src/components/App.tsx:203-262` (the `filteredKeys` and `displayRows` useMemos), with the two `[SEARCH DEBUG]` console.log blocks dropped. Full content:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lite/`
Expected: PASS (all tests, Tasks 2+3)

- [ ] **Step 5: Commit**

```bash
git add public/lite/js/filters.js tests/lite/filters.test.mjs
git commit -m "feat(lite): port filter engine and search pipeline with tests"
```

---

### Task 4: `jira.js` — JIRA config + fetch port

**Files:**
- Create: `public/lite/js/jira.js`
- Test: `tests/lite/jira.test.mjs`

**Interfaces:**
- Produces (all exported):
  - `loadJiraConfig(): JiraConfig | null` / `saveJiraConfig(config)` — `JiraConfig = {email, apiToken, jql, maxRows, refreshInterval}`, localStorage key `oem-jira-config`
  - `formatFieldValue(value: unknown): string`
  - `fetchJiraData(config, onProgress?): Promise<RawRow[]>` — calls `/api/jira-proxy/...`

- [ ] **Step 1: Write the failing test `tests/lite/jira.test.mjs`**

`formatFieldValue` is the only Node-testable part (`loadJiraConfig`/`fetchJiraData` need `localStorage`/`fetch`+server; they are exercised in the browser in Task 6).

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatFieldValue } from "../../public/lite/js/jira.js";

test("formatFieldValue flattens JIRA field shapes like the CSV export", () => {
  assert.equal(formatFieldValue(null), "");
  assert.equal(formatFieldValue(undefined), "");
  assert.equal(formatFieldValue("plain"), "plain");
  assert.equal(formatFieldValue(42), "42");
  assert.equal(formatFieldValue(true), "true");
  assert.equal(formatFieldValue({ name: "Status name" }), "Status name");
  assert.equal(formatFieldValue({ displayName: "Jane" }), "Jane");
  assert.equal(formatFieldValue({ value: "Option A" }), "Option A");
  assert.equal(formatFieldValue({ emailAddress: "a@b.c" }), "a@b.c");
  assert.equal(formatFieldValue({ key: "ACTO-1" }), "ACTO-1");
  assert.equal(formatFieldValue([{ name: "X" }, "", { name: "Y" }]), "X, Y");
  assert.equal(formatFieldValue({ other: 1 }), '{"other":1}');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lite/`
Expected: FAIL — `Cannot find module .../jira.js`

- [ ] **Step 3: Write `public/lite/js/jira.js`**

Port of `src/utils/jiraFetch.ts` with: types stripped, `formatFieldValue` exported, the `console.log("JIRA response", ...)` at `jiraFetch.ts:105` dropped. Guard `localStorage` access so importing the module in Node does not throw (module-level access is fine — it is only touched inside functions). Full content:

```js
// Port of src/utils/jiraFetch.ts. Same localStorage key and proxy endpoints
// as the existing app so both versions share config and cache.

const JIRA_STORAGE_KEY = "oem-jira-config";

export function loadJiraConfig() {
  try {
    const stored = localStorage.getItem(JIRA_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function saveJiraConfig(config) {
  localStorage.setItem(JIRA_STORAGE_KEY, JSON.stringify(config));
}

export function formatFieldValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => formatFieldValue(v)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const obj = value;
    if ("name" in obj && typeof obj.name === "string") return obj.name;
    if ("displayName" in obj && typeof obj.displayName === "string") return obj.displayName;
    if ("value" in obj && typeof obj.value === "string") return obj.value;
    if ("emailAddress" in obj && typeof obj.emailAddress === "string") return obj.emailAddress;
    if ("key" in obj && typeof obj.key === "string") return obj.key;
    return JSON.stringify(value);
  }
  return String(value);
}

export async function fetchJiraData(config, onProgress) {
  const auth = btoa(`${config.email}:${config.apiToken}`);

  async function jiraCall(path, method = "GET", body) {
    const url = `/api/jira-proxy${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Authorization": `Basic ${auth}`,
        "Accept": "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`JIRA ${method} ${path} failed: ${res.status} - ${err}`);
    }
    return res.json();
  }

  const fields = await jiraCall("/rest/api/3/field");
  const fieldMap = new Map();
  for (const f of fields) {
    const name = f.custom ? `Custom field (${f.name})` : f.name;
    fieldMap.set(f.id, name);
  }

  const allRows = [];
  let nextPageToken;

  while (allRows.length < config.maxRows) {
    const maxR = Math.min(100, config.maxRows - allRows.length);
    const params = new URLSearchParams({
      jql: config.jql,
      maxResults: String(maxR),
      fields: "*all",
    });
    if (nextPageToken) params.set("nextPageToken", nextPageToken);

    const data = await jiraCall(`/rest/api/3/search/jql?${params}`);

    const issues = data.issues ?? [];
    for (const issue of issues) {
      const row = {};
      row["Issue key"] = issue.key;

      const rawFields = issue.fields || {};
      for (const [fieldId, value] of Object.entries(rawFields)) {
        const fieldName = fieldMap.get(fieldId) || fieldId;
        row[fieldName] = formatFieldValue(value);
      }

      row["Summary"] = formatFieldValue(rawFields.summary);
      row["Status"] = formatFieldValue(rawFields.status);
      row["Issue Type"] = formatFieldValue(rawFields.issuetype);

      const parent = rawFields.parent;
      if (parent) {
        row["Parent key"] = formatFieldValue(parent.key);
        row["Parent summary"] = formatFieldValue(parent.fields?.summary);
      }

      allRows.push(row);
    }

    nextPageToken = data.nextPageToken;
    const isLastPage = data.isLast !== false;
    const estimatedTotal = isLastPage ? allRows.length : allRows.length + 100;
    onProgress?.(allRows.length, estimatedTotal);

    if (issues.length === 0 || isLastPage) break;
  }

  return allRows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lite/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/lite/js/jira.js tests/lite/jira.test.mjs
git commit -m "feat(lite): port JIRA config and fetch client"
```

---

### Task 5: `prefs.js` — user preferences port

**Files:**
- Create: `public/lite/js/prefs.js`
- Test: `tests/lite/prefs.test.mjs`

**Interfaces:**
- Consumes: `loadJiraConfig` semantics (prefs are namespaced by the JIRA email, key format `oem-prefs-<email>:<name>` — same as `src/utils/userPrefs.ts`).
- Produces (all exported): `saveUserPref(name, value, email?)`, `loadUserPref(name, fallback, email?)`, `saveFilters(filters, email?)`, `loadFilters(email?)`, `saveFavorites(favorites, email?)`, `loadFavorites(email?)`, `saveSearchTerm(term, email?)`, `loadSearchTerm(email?)`.

- [ ] **Step 1: Write the failing test `tests/lite/prefs.test.mjs`**

Node has no `localStorage`; stub it on `globalThis` before importing.

```js
import { test } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { saveFavorites, loadFavorites, loadUserPref } = await import("../../public/lite/js/prefs.js");

test("prefs round-trip, namespaced by JIRA config email", () => {
  store.set("oem-jira-config", JSON.stringify({ email: "me@corp.com" }));
  saveFavorites(["Status", "Custom field (Product)"]);
  assert.ok(store.has("oem-prefs-me@corp.com:favorites"));
  assert.deepEqual(loadFavorites(), ["Status", "Custom field (Product)"]);
});

test("loadUserPref falls back when key is absent or JSON is broken", () => {
  assert.deepEqual(loadUserPref("nope", []), []);
  store.set("oem-prefs-me@corp.com:bad", "{not json");
  assert.equal(loadUserPref("bad", "fallback"), "fallback");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lite/`
Expected: FAIL — `Cannot find module .../prefs.js`

- [ ] **Step 3: Write `public/lite/js/prefs.js`**

Straight port of `src/utils/userPrefs.ts` with types stripped — identical logic, identical key format:

```js
// Port of src/utils/userPrefs.ts. Keys are shared with the existing app.

const PREFIX = "oem-prefs-";

function key(email, name) {
  return `${PREFIX}${email}:${name}`;
}

function getCurrentEmail() {
  try {
    const config = localStorage.getItem("oem-jira-config");
    if (config) return JSON.parse(config).email || "local";
  } catch { /* ignore */ }
  return "local";
}

export function saveUserPref(name, value, email) {
  const e = email || getCurrentEmail();
  try {
    localStorage.setItem(key(e, name), JSON.stringify(value));
  } catch { /* quota */ }
}

export function loadUserPref(name, fallback, email) {
  const e = email || getCurrentEmail();
  try {
    const stored = localStorage.getItem(key(e, name));
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

export function saveFilters(filters, email) { saveUserPref("filters", filters, email); }
export function loadFilters(email) { return loadUserPref("filters", [], email); }
export function saveFavorites(favorites, email) { saveUserPref("favorites", favorites, email); }
export function loadFavorites(email) { return loadUserPref("favorites", [], email); }
export function saveSearchTerm(term, email) { saveUserPref("search", term, email); }
export function loadSearchTerm(email) { return loadUserPref("search", "", email); }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lite/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/lite/js/prefs.js tests/lite/prefs.test.mjs
git commit -m "feat(lite): port user preferences storage"
```

---

### Task 6: `gantt-logic.js` — pure Gantt computations

**Files:**
- Create: `public/lite/js/gantt-logic.js`
- Test: `tests/lite/gantt-logic.test.mjs`

All functions here are extracted from `src/components/GanttChart.tsx` — same behavior, but free of React/DOM so they are testable. Injectable `today` parameters (default `new Date()`) replace direct `new Date()` calls so tests are deterministic.

**Interfaces:**
- Consumes: `EpicTask`/`DisplayRow` from Task 2.
- Produces (all exported):
  - `ZOOM_CONFIG` — `{day|week|month|quarter: {dayWidth, headerFormat(d), subFormat(d), subUnit}}` (from `GanttChart.tsx:14-39`)
  - `ROW_HEIGHT = 40`, `BAR_HEIGHT = 20`, `BAR_TOP = 10`, `TIMELINE_MARGIN = 20`
  - `toDayValue(d: Date): number`
  - `getWeekNumber(d: Date): number` (ISO week, from `GanttChart.tsx:1565-1570`)
  - `detectInconsistencies(tasks): Map<number, {epicId, conflictingPhases: Set<string>, details: string[]}>` (from `GanttChart.tsx:59-101`)
  - `detectAlerts(tasks, today?: Date): Map<number, {epicId, details: string[]}>` (from `GanttChart.tsx:117-166`)
  - `computeDateRange(tasks, now?: Date): {minDate, maxDate}` (from `GanttChart.tsx:411-436`: clamp to [now−1y, now+2y], always include current year, 14-day padding)
  - `makeDayOffset(minDate, dayWidth): (date: Date) => number` — UTC-based day diff × dayWidth + `TIMELINE_MARGIN` (DST-safe, from `GanttChart.tsx:443-447`)
  - `buildTimelineHeaders({minDate, maxDate, zoom, dayOffset}): {yearHeaders, quarterHeaders, mainHeaders, subHeaders}` — each header is `{label, left, width}` (from `GanttChart.tsx:450-538`)
  - `computeWeekLines(minDate, maxDate, dayOffset): number[]` (from `GanttChart.tsx:541-551`)
  - `getCellText(epic, col, isInitiative): string` — cols `product|acto|epicName|status|progress` (from `GanttChart.tsx:222-237`)
  - `applyGanttRowFilters(displayRows, opts): DisplayRow[]` — `opts = {showInconsistencies, showAlerts, phaseFilter, colFilters: Record<string, Set<string>>, sortCol, sortDir, inconsistencies, alerts, today?: Date}` (from `GanttChart.tsx:331-408`, including the group-preserving sort)

- [ ] **Step 1: Write the failing test `tests/lite/gantt-logic.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toDayValue, getWeekNumber, detectInconsistencies, detectAlerts,
  computeDateRange, makeDayOffset, buildTimelineHeaders, computeWeekLines,
  getCellText, applyGanttRowFilters, ZOOM_CONFIG, TIMELINE_MARGIN,
} from "../../public/lite/js/gantt-logic.js";

function epic(id, phases, status = "In Progress", raw = {}) {
  return { id, epicKey: `E-${id}`, epicName: `Epic ${id}`, status, phases, rawData: raw };
}
function phase(name, start, end, id = name) {
  return { id, phaseName: name, color: "#000", startDate: start, endDate: end };
}

test("getWeekNumber: ISO week", () => {
  assert.equal(getWeekNumber(new Date(2026, 0, 1)), 1);   // Thu 1 Jan 2026 → W1
  assert.equal(getWeekNumber(new Date(2026, 11, 31)), 53); // Thu 31 Dec 2026 → W53
});

test("detectInconsistencies flags overlapping ordered phases", () => {
  const bad = epic(1, [
    phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 20)),
    phase("Development", new Date(2026, 0, 10), new Date(2026, 1, 1)), // starts before Analysis ends
  ]);
  const ok = epic(2, [
    phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 10)),
    phase("Development", new Date(2026, 0, 10), new Date(2026, 1, 1)), // same-day handoff is OK
  ]);
  const result = detectInconsistencies([bad, ok]);
  assert.ok(result.has(1));
  assert.ok(result.get(1).conflictingPhases.has("Analysis"));
  assert.ok(result.get(1).conflictingPhases.has("Development"));
  assert.ok(!result.has(2));
});

test("detectAlerts: analysis ended but status still Backlog", () => {
  const today = new Date(2026, 5, 1);
  const late = epic(1, [phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 31))], "Backlog");
  const fine = epic(2, [phase("Analysis", new Date(2026, 0, 1), new Date(2026, 0, 31))], "In Progress");
  const result = detectAlerts([late, fine], today);
  assert.ok(result.has(1));
  assert.ok(!result.has(2));
});

test("computeDateRange always covers current year with 14-day padding", () => {
  const now = new Date(2026, 6, 15);
  const { minDate, maxDate } = computeDateRange([], now);
  assert.ok(minDate <= new Date(2026, 0, 1));
  assert.ok(maxDate >= new Date(2026, 11, 31));
});

test("makeDayOffset is DST-safe (uses UTC day arithmetic)", () => {
  const minDate = new Date(2026, 2, 1); // March — crosses EU DST on Mar 29
  const off = makeDayOffset(minDate, 10);
  assert.equal(off(new Date(2026, 2, 1)), TIMELINE_MARGIN);
  assert.equal(off(new Date(2026, 3, 1)), TIMELINE_MARGIN + 31 * 10); // exactly 31 days
});

test("buildTimelineHeaders month zoom: one sub header per month, year headers on top", () => {
  const minDate = new Date(2026, 0, 1);
  const maxDate = new Date(2026, 11, 31);
  const dayOffset = makeDayOffset(minDate, ZOOM_CONFIG.month.dayWidth);
  const h = buildTimelineHeaders({ minDate, maxDate, zoom: "month", dayOffset });
  assert.equal(h.yearHeaders.length, 1);
  assert.equal(h.quarterHeaders.length, 4);
  assert.equal(h.subHeaders.length, 12);
  assert.equal(h.mainHeaders.length, 0);
});

test("applyGanttRowFilters: sort keeps initiative groups together", () => {
  const i1 = epic(-1, [], "", { "Custom field (Product)": "" });
  const c1 = epic(1, [], "", { "Custom field (Product)": "Zeta" });
  const s1 = epic(2, [], "", { "Custom field (Product)": "Alpha" });
  const rows = [
    { type: "initiative", epic: { ...i1, epicName: "Zzz init" }, initiativeKey: "I-1", initiativeName: "Zzz init", children: [c1] },
    { type: "epic", epic: c1, initiativeKey: "I-1" },
    { type: "epic", epic: s1 },
  ];
  const sorted = applyGanttRowFilters(rows, {
    showInconsistencies: false, showAlerts: false, phaseFilter: null,
    colFilters: {}, sortCol: "epicName", sortDir: "asc",
    inconsistencies: new Map(), alerts: new Map(),
  });
  // "Epic 2" < "Zzz init" so the standalone epic comes first, group stays intact
  assert.equal(sorted[0].epic.id, 2);
  assert.equal(sorted[1].type, "initiative");
  assert.equal(sorted[2].epic.id, 1);
});

test("getCellText: initiative shows only name and progress columns", () => {
  const e = epic(1, [], "Done", { "Custom field (Product)": "P1", "Custom field (% of progress)": "42.4" });
  assert.equal(getCellText(e, "product", true), "");
  assert.equal(getCellText(e, "product", false), "P1");
  assert.equal(getCellText(e, "progress", false), "42");
  assert.equal(getCellText(e, "epicName", true), "Epic 1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lite/`
Expected: FAIL — `Cannot find module .../gantt-logic.js`

- [ ] **Step 3: Write `public/lite/js/gantt-logic.js`**

Transcribe each listed function from `src/components/GanttChart.tsx` at the line ranges given in the Interfaces block, applying only these transformations — no logic changes:
1. Strip TypeScript types.
2. `detectAlerts(tasks, today = new Date())`: replace the internal `const today = toDayValue(new Date())` with `const todayVal = toDayValue(today)` and use `todayVal` in the comparisons.
3. `computeDateRange(tasks, now = new Date())`: replace `const now = new Date()` with the parameter.
4. `makeDayOffset(minDate, dayWidth)` returns the `dayOffset` closure; `TIMELINE_MARGIN` is a module const.
5. `buildTimelineHeaders({minDate, maxDate, zoom, dayOffset})`: body of the useMemo at `GanttChart.tsx:450-538`, reading `ZOOM_CONFIG[zoom]` internally, returning `{yearHeaders, quarterHeaders, mainHeaders, subHeaders}`.
6. `computeWeekLines(minDate, maxDate, dayOffset)`: body of the useMemo at `GanttChart.tsx:541-551`.
7. `getCellText(epic, col, isInitiative)`: from `GanttChart.tsx:222-237` (module-level function, no closure needed).
8. `applyGanttRowFilters(displayRows, opts)`: body of the `displayedRows` useMemo at `GanttChart.tsx:331-408`. The `isInPhaseToday` helper (`GanttChart.tsx:324-329`) becomes a module function taking `(epic, phaseName, today)`. `opts.today` defaults to `new Date()`.

The module must not reference `document`, `window`, or React.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lite/`
Expected: PASS (all suites)

- [ ] **Step 5: Commit**

```bash
git add public/lite/js/gantt-logic.js tests/lite/gantt-logic.test.mjs
git commit -m "feat(lite): extract pure gantt computations with tests"
```

---

### Task 7: `main.js` + `topbar.js` — app shell, state, orchestration

**Files:**
- Create: `public/lite/js/main.js` (replaces the Task 1 placeholder)
- Create: `public/lite/js/topbar.js`
- Modify: `public/lite/style.css` (append topbar styles)

**Interfaces:**
- Consumes: everything from Tasks 2-5.
- Produces (used by Tasks 8-12):
  - `main.js` exports: `state`, `actions`, `deriveData()`, `renderAll()`, `showError(message)`, `clearError()`, `setupAutoRefresh()`.
  - `state` shape: `{rawData, columns, activeFilters, searchTerm, jiraConnected, loading, resetKey, derived: {allEpicTasks, allDisplayRows, filteredEpicTasks, filteredKeys, hasActiveFilters, displayRows}}`.
  - `actions`: `{setData(rows, {silent}), setFilters(filters), setSearch(term), refreshFromJira(silent), openConnector(), openAi()}`.
  - `topbar.js` exports: `renderTopBar(container, state, actions)`.

- [ ] **Step 1: Write `public/lite/js/main.js`**

Boot sequence mirrors `App.tsx` minus auth/Supabase: localStorage cache → else auto-fetch if config is complete → else open the connector. Filters/search restore from `prefs.js` (replacing the Supabase-saved filters of the original).

```js
import { transformToEpicTasks, buildDisplayRows, extractColumns } from "./transform.js";
import { applyFilters, computeFilteredKeys, computeDisplayRows } from "./filters.js";
import { loadJiraConfig, fetchJiraData } from "./jira.js";
import { loadFilters, saveFilters, loadSearchTerm, saveSearchTerm } from "./prefs.js";
import { renderTopBar } from "./topbar.js";
import { renderFilterBar } from "./filterbar.js";
import { renderGantt } from "./gantt.js";
import { openConnector } from "./connector.js";
import { toggleAiPanel } from "./ai.js";

const CACHE_KEY = "oem-session-data";

export const state = {
  rawData: [],
  columns: [],
  activeFilters: [],
  searchTerm: "",
  jiraConnected: false,
  loading: false,
  resetKey: 0,
  derived: {
    allEpicTasks: [], allDisplayRows: [], filteredEpicTasks: [],
    filteredKeys: new Set(), hasActiveFilters: false, displayRows: [],
  },
};

export function deriveData() {
  const allEpicTasks = transformToEpicTasks(state.rawData);
  const allDisplayRows = buildDisplayRows(allEpicTasks);
  const filteredRows = applyFilters(state.rawData, state.activeFilters);
  const filteredEpicTasks = transformToEpicTasks(filteredRows);
  const filteredKeys = computeFilteredKeys(filteredEpicTasks, filteredRows);
  const hasActiveFilters = state.activeFilters.some((f) => f.values.length > 0);
  const displayRows = computeDisplayRows(allDisplayRows, {
    hasActiveFilters, filteredKeys, searchTerm: state.searchTerm,
  });
  state.derived = { allEpicTasks, allDisplayRows, filteredEpicTasks, filteredKeys, hasActiveFilters, displayRows };
}

export function renderAll() {
  renderTopBar(document.getElementById("topbar"), state, actions);
  renderFilterBar(document.getElementById("filterbar"), state, actions);
  document.getElementById("loading").classList.toggle("hidden", !state.loading);
  const gantt = document.getElementById("gantt");
  gantt.classList.toggle("hidden", state.loading || state.rawData.length === 0);
  if (!state.loading && state.rawData.length > 0) {
    renderGantt(gantt, state, actions);
  }
}

export function showError(message) {
  const banner = document.getElementById("error-banner");
  banner.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = message;
  const close = document.createElement("button");
  close.textContent = "×";
  close.addEventListener("click", clearError);
  banner.append(span, close);
  banner.classList.remove("hidden");
}

export function clearError() {
  document.getElementById("error-banner").classList.add("hidden");
}

let refreshTimer = null;

export function setupAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  const config = loadJiraConfig();
  if (state.jiraConnected && config && config.refreshInterval > 0) {
    refreshTimer = setInterval(() => actions.refreshFromJira(true), config.refreshInterval * 1000);
  }
}

export const actions = {
  setData(rows, { silent = false } = {}) {
    state.rawData = rows;
    state.columns = extractColumns(rows);
    if (!silent) {
      state.activeFilters = [];
      state.searchTerm = "";
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch { /* quota */ }
    deriveData();
    renderAll();
  },

  setFilters(filters) {
    state.activeFilters = filters;
    saveFilters(filters);
    if (filters.every((f) => f.values.length === 0)) {
      state.resetKey += 1; // tells the gantt to clear its internal filters/sort
    }
    deriveData();
    renderAll();
  },

  setSearch(term) {
    state.searchTerm = term;
    saveSearchTerm(term);
    deriveData();
    renderAll();
  },

  async refreshFromJira(silent = false) {
    const config = loadJiraConfig();
    if (!config || !config.email || !config.apiToken || !config.jql) {
      openConnector(state, actions);
      return;
    }
    if (!silent) { state.loading = true; renderAll(); }
    try {
      const rows = await fetchJiraData(config);
      if (rows.length > 0) {
        state.jiraConnected = true;
        actions.setData(rows, { silent: true });
        clearError();
        setupAutoRefresh();
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "JIRA fetch failed");
    } finally {
      if (!silent) { state.loading = false; renderAll(); }
    }
  },

  openConnector() {
    openConnector(state, actions);
  },

  openAi() {
    toggleAiPanel(state);
  },
};

function boot() {
  state.activeFilters = loadFilters();
  state.searchTerm = loadSearchTerm();

  let hasCache = false;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.rawData = parsed;
        state.columns = extractColumns(parsed);
        state.jiraConnected = true;
        hasCache = true;
      }
    }
  } catch { /* ignore */ }

  deriveData();
  renderAll();

  if (hasCache) {
    setupAutoRefresh();
    return;
  }

  const config = loadJiraConfig();
  if (config && config.email && config.apiToken && config.jql) {
    actions.refreshFromJira(false);
  } else {
    openConnector(state, actions);
  }
}

boot();
```

Note: `filterbar.js`, `gantt.js`, `connector.js`, `ai.js` do not exist yet. Create minimal stubs so the module graph loads (each replaced by its own task):

```js
// public/lite/js/filterbar.js (stub — replaced in Task 9)
export function renderFilterBar() {}
```
```js
// public/lite/js/gantt.js (stub — replaced in Task 10)
export function renderGantt(container) { container.textContent = "Gantt placeholder"; }
```
```js
// public/lite/js/connector.js (stub — replaced in Task 8)
export function openConnector() { alert("Connector not built yet"); }
```
```js
// public/lite/js/ai.js (stub — replaced in Task 12)
export function toggleAiPanel() {}
```

- [ ] **Step 2: Write `public/lite/js/topbar.js`**

Vanilla port of `src/components/TopBar.tsx` minus: Import/upload button, Admin button, user avatar/sign-out. Keeps: brand, search input (with clear button), project count, AI button, Jira button. The AI button opens the panel directly (no paywall — no roles in lite).

```js
// Port of src/components/TopBar.tsx (no upload/admin/user section).

export function renderTopBar(container, state, actions) {
  const count = state.derived.filteredEpicTasks.length;
  container.innerHTML = `
    <div class="brand">
      <div class="brand-lines"><i></i><i></i><i></i></div>
      <div class="brand-name">rob<span>a</span>l<span>i</span>ze <em>lite</em></div>
    </div>
    <div class="topbar-actions">
      ${count > 0 ? `
        <div class="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input id="topbar-search" type="text" placeholder="Search projects..." />
          <button id="topbar-search-clear" class="${state.searchTerm ? "" : "hidden"}">×</button>
        </div>
        <div class="project-count"><span class="dot"></span>${count} projects</div>
        <button id="topbar-ai" class="pill pill-ghost">AI</button>
      ` : ""}
      <button id="topbar-jira" class="pill ${state.jiraConnected ? "pill-connected" : "pill-ghost"}">
        ${state.jiraConnected ? '<span class="dot dot-glow"></span>Jira Connected' : "Connect Jira"}
      </button>
    </div>
  `;

  const search = container.querySelector("#topbar-search");
  if (search) {
    search.value = state.searchTerm;
    search.addEventListener("input", (e) => {
      // re-render replaces the input; preserve focus and caret
      const pos = e.target.selectionStart;
      actions.setSearch(e.target.value);
      const next = document.getElementById("topbar-search");
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    });
    container.querySelector("#topbar-search-clear")
      .addEventListener("click", () => actions.setSearch(""));
  }
  container.querySelector("#topbar-ai")?.addEventListener("click", actions.openAi);
  container.querySelector("#topbar-jira").addEventListener("click", () => {
    if (state.jiraConnected) actions.refreshFromJira(false);
    else actions.openConnector();
  });
}
```

- [ ] **Step 3: Append topbar styles to `public/lite/style.css`**

Transcribe the visual values from `src/components/TopBar.tsx` — gradient bar (`TopBar.tsx:38-49`), brand (`52-61`), pill buttons (`18-33`), search input (`68-100`), count badge (`131-146`) — into these classes:

```css
/* ===== Topbar ===== */
#topbar {
  background: var(--gradient-primary);
  color: white;
  padding: 12px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4px 20px rgba(107, 44, 245, 0.25);
  position: relative;
  z-index: 50;
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand-lines { display: flex; flex-direction: column; gap: 3px; }
.brand-lines i { display: block; height: 2.5px; border-radius: 2px; background: #fff; }
.brand-lines i:nth-child(1) { width: 16px; }
.brand-lines i:nth-child(2) { width: 12px; opacity: 0.55; }
.brand-lines i:nth-child(3) { width: 8px; background: #5DE8B0; opacity: 0.9; }
.brand-name {
  font-family: 'Arial Black', Arial, sans-serif;
  font-weight: 900; font-size: 22px; line-height: 1; letter-spacing: -1.5px; color: #fff;
}
.brand-name span { color: #5DE8B0; }
.brand-name em {
  font-style: normal; font-size: 11px; font-weight: 600; letter-spacing: 1px;
  vertical-align: super; opacity: 0.7; margin-left: 4px;
}
.topbar-actions { display: flex; gap: 10px; align-items: center; }
.pill {
  border: none; padding: 8px 18px; border-radius: 100px; cursor: pointer;
  font-weight: 600; font-size: 12px; letter-spacing: 0.2px;
  display: flex; align-items: center; gap: 6px; white-space: nowrap;
  backdrop-filter: blur(8px);
}
.pill-ghost { background: rgba(255,255,255,0.12); color: white; border: 1px solid rgba(255,255,255,0.25); }
.pill-connected { background: rgba(52, 211, 153, 0.2); color: white; border: 1px solid rgba(52, 211, 153, 0.5); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: #34D399; display: inline-block; }
.dot-glow { box-shadow: 0 0 6px rgba(52, 211, 153, 0.5); }
.search-wrap { position: relative; display: flex; align-items: center; }
.search-wrap svg { position: absolute; left: 12px; pointer-events: none; opacity: 0.5; }
.search-wrap input {
  padding: 8px 14px 8px 36px; border-radius: 100px;
  border: 1px solid rgba(255,255,255,0.2); font-size: 12px; width: 240px;
  outline: none; background: rgba(255,255,255,0.15); color: white;
  caret-color: white; backdrop-filter: blur(8px); letter-spacing: 0.2px;
}
.search-wrap input::placeholder { color: rgba(255,255,255,0.6); }
.search-wrap button {
  position: absolute; right: 10px; background: rgba(255,255,255,0.2);
  border: none; color: white; cursor: pointer; font-size: 11px;
  width: 18px; height: 18px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; padding: 0; line-height: 1;
}
.project-count {
  background: rgba(255,255,255,0.1); border-radius: 100px; padding: 6px 14px;
  font-size: 11px; font-weight: 500; letter-spacing: 0.3px;
  display: flex; align-items: center; gap: 6px;
}
.project-count .dot { width: 6px; height: 6px; background: #34D399; }
```

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`, open `http://localhost:5173/lite/index.html`.
Expected: topbar renders with brand + "Connect Jira" pill. If the browser profile already has `oem-session-data` (from using the main app in dev), the project count appears and the gantt area shows "Gantt placeholder". Clicking "Connect Jira" shows the stub alert. No console errors.

- [ ] **Step 5: Run node tests still pass**

Run: `node --test tests/lite/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/lite/js public/lite/style.css
git commit -m "feat(lite): app shell with state orchestration and topbar"
```

---

### Task 8: `connector.js` — JIRA connection modal

**Files:**
- Create: `public/lite/js/connector.js` (replaces stub)
- Modify: `public/lite/style.css` (append modal styles)

**Interfaces:**
- Consumes: `loadJiraConfig/saveJiraConfig/fetchJiraData` (Task 4), `state`/`actions`/`setupAutoRefresh`/`showError` semantics (Task 7).
- Produces: `openConnector(state, actions)` — builds the modal into `#connector-root`, removes it on close.

Functional port of `src/components/JiraConnector.tsx` with the admin/non-admin distinction removed: the full form (email, API token, JQL, max rows, auto-refresh) is always shown, config always saved to localStorage. No Supabase.

- [ ] **Step 1: Write `public/lite/js/connector.js`**

```js
// Port of src/components/JiraConnector.tsx — no admin/Supabase logic:
// everyone edits the full config, stored in localStorage only.
import { loadJiraConfig, saveJiraConfig, fetchJiraData } from "./jira.js";
import { setupAutoRefresh, clearError } from "./main.js";

const DEFAULT_JQL = 'project = "ACTO" AND issuetype = Epic ORDER BY key ASC';

export function openConnector(state, actions) {
  const root = document.getElementById("connector-root");
  const saved = loadJiraConfig() || {};
  const connected = state.jiraConnected;

  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-header ${connected ? "modal-header-connected" : ""}">
          <span>${connected ? "Connected to Jira" : "Import from Jira"}</span>
          <button class="modal-close">×</button>
        </div>
        <div class="modal-body">
          <label class="field">
            <span>Atlassian email</span>
            <input id="jc-email" type="email" placeholder="you@company.com" />
          </label>
          <label class="field">
            <span>API Token</span>
            <input id="jc-token" type="password" placeholder="Paste your Atlassian API token" />
            <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer">Create an API token</a>
          </label>
          <label class="field">
            <span>JQL Query</span>
            <textarea id="jc-jql" rows="3"></textarea>
          </label>
          <div class="field-row">
            <label class="field">
              <span>Max rows</span>
              <input id="jc-maxrows" type="number" min="1" max="10000" style="width:100px" />
            </label>
            <label class="field">
              <span>Auto-refresh (seconds)</span>
              <input id="jc-refresh" type="number" min="0" step="30" placeholder="0 = off" style="width:120px" />
            </label>
          </div>
          <div id="jc-error" class="form-error hidden"></div>
          <div id="jc-progress" class="progress hidden">
            <span id="jc-progress-label"></span>
            <div class="progress-track"><div id="jc-progress-bar" class="progress-bar"></div></div>
          </div>
          <div class="modal-buttons">
            <button id="jc-fetch" class="btn-primary">${connected ? "Refresh Now" : "Get Data Now"}</button>
            ${connected ? '<button id="jc-disconnect" class="btn-danger">Disconnect</button>' : ""}
          </div>
        </div>
      </div>
    </div>
  `;

  const $ = (sel) => root.querySelector(sel);
  $("#jc-email").value = saved.email || "";
  $("#jc-token").value = saved.apiToken || "";
  $("#jc-jql").value = saved.jql || DEFAULT_JQL;
  $("#jc-maxrows").value = saved.maxRows ?? 5000;
  $("#jc-refresh").value = saved.refreshInterval ?? 0;

  function close() { root.innerHTML = ""; }
  $(".modal-close").addEventListener("click", close);
  $(".modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) close();
  });

  $("#jc-disconnect")?.addEventListener("click", () => {
    state.jiraConnected = false;
    setupAutoRefresh(); // clears the timer since jiraConnected is now false
    close();
    actions.setData(state.rawData, { silent: true }); // re-render topbar state
  });

  $("#jc-fetch").addEventListener("click", async () => {
    const config = {
      email: $("#jc-email").value.trim(),
      apiToken: $("#jc-token").value.trim(),
      jql: $("#jc-jql").value.trim(),
      maxRows: Number($("#jc-maxrows").value) || 1000,
      refreshInterval: parseInt($("#jc-refresh").value, 10) || 0,
    };
    const errorBox = $("#jc-error");
    errorBox.classList.add("hidden");
    if (!config.email || !config.apiToken || !config.jql) {
      errorBox.textContent = "Please fill in all fields.";
      errorBox.classList.remove("hidden");
      return;
    }
    saveJiraConfig(config);

    const btn = $("#jc-fetch");
    btn.disabled = true;
    btn.textContent = "Loading...";
    $("#jc-progress").classList.remove("hidden");
    try {
      const rows = await fetchJiraData(config, (loaded, total) => {
        $("#jc-progress-label").textContent = `Loading... ${loaded} / ${total} issues`;
        $("#jc-progress-bar").style.width = `${(loaded / total) * 100}%`;
      });
      if (rows.length === 0) {
        errorBox.textContent = "No results found for this JQL query.";
        errorBox.classList.remove("hidden");
        return;
      }
      state.jiraConnected = true;
      actions.setData(rows, { silent: true });
      clearError();
      setupAutoRefresh();
      close();
    } catch (err) {
      errorBox.textContent = err instanceof Error ? err.message : "Connection failed.";
      errorBox.classList.remove("hidden");
      state.jiraConnected = false;
    } finally {
      btn.disabled = false;
      btn.textContent = state.jiraConnected ? "Refresh Now" : "Get Data Now";
      $("#jc-progress").classList.add("hidden");
    }
  });
}
```

- [ ] **Step 2: Append modal styles to `public/lite/style.css`**

Transcribe visual values from `src/components/JiraConnector.tsx:156-462` into these classes:

```css
/* ===== Modal (connector) ===== */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 2000;
  display: flex; align-items: center; justify-content: center;
}
.modal {
  background: white; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.2);
  width: 440px; max-height: 90vh; overflow: auto; display: flex; flex-direction: column;
}
.modal-header {
  background: var(--primary); color: white; padding: 16px 20px;
  border-radius: 14px 14px 0 0; display: flex; justify-content: space-between;
  align-items: center; font-weight: 700; font-size: 15px;
}
.modal-header-connected { background: #2b8a3e; }
.modal-close { background: none; border: none; color: white; font-size: 18px; cursor: pointer; padding: 0; line-height: 1; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field > span { font-size: 12px; font-weight: 600; color: var(--text-dark); }
.field input, .field textarea {
  padding: 9px 12px; border: 1.5px solid var(--border-light); border-radius: 8px;
  font-size: 13px; outline: none;
}
.field textarea { resize: vertical; font-family: monospace; }
.field input:focus, .field textarea:focus { border-color: var(--primary); }
.field a { font-size: 11px; color: var(--primary); text-decoration: none; margin-top: 4px; }
.field-row { display: flex; gap: 16px; }
.form-error {
  background: #fff0f0; border: 1px solid #ffc9c9; border-radius: 8px;
  padding: 10px 12px; font-size: 12px; color: #e03131;
}
.progress { font-size: 12px; color: var(--text-muted); }
.progress-track { margin-top: 6px; height: 4px; background: var(--border-light); border-radius: 2px; overflow: hidden; }
.progress-bar { height: 100%; width: 0; background: var(--primary); border-radius: 2px; transition: width 0.3s; }
.modal-buttons { display: flex; gap: 10px; margin-top: 4px; }
.btn-primary {
  flex: 1; background: var(--primary); color: white; border: none;
  padding: 11px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.btn-primary:disabled { background: var(--text-muted); cursor: not-allowed; }
.btn-danger {
  background: white; border: 1.5px solid #e03131; color: #e03131;
  padding: 11px 16px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer;
}
```

- [ ] **Step 3: Verify end-to-end in browser**

Run: `npm run dev`, open `http://localhost:5173/lite/index.html`.
Note: in dev, `/api/jira-proxy` must be served. Check `vite.config.ts` — if the dev proxy only exists for the React root, run `vercel dev` instead, or verify against the deployed proxy. Expected: opening the connector, entering the JIRA credentials (from the existing app's config, pre-filled automatically) and clicking "Get Data Now" shows progress, closes the modal, and the topbar switches to "Jira Connected" with a project count. An invalid token shows the error box with the JIRA status code.

- [ ] **Step 4: Commit**

```bash
git add public/lite/js/connector.js public/lite/style.css
git commit -m "feat(lite): JIRA connector modal with progress and auto-refresh"
```

---

### Task 9: `filterbar.js` — filter chips, favorites, add-filter dropdown

**Files:**
- Create: `public/lite/js/filterbar.js` (replaces stub)
- Modify: `public/lite/style.css` (append filterbar styles)

**Interfaces:**
- Consumes: `state.columns`, `state.activeFilters`, `actions.setFilters` (Task 7), `extractUniqueValues` (Task 2), `loadFavorites/saveFavorites` (Task 5).
- Produces: `renderFilterBar(container, state, actions)`.

Functional port of `src/components/FilterBar.tsx`. Same behaviors: chips with checkbox dropdowns + value search + Select all/Clear; favorites (★) always present as chips and not removable (remove clears values instead); add-filter dropdown with column search and per-row star; Reset button (keeps favorites, clears values — this triggers `resetKey` via `actions.setFilters`); drag & drop chip reorder.

- [ ] **Step 1: Write `public/lite/js/filterbar.js`**

Implementation notes (the executor writes the full module from these, they are exact):

- Module-local UI state (survives re-render within the module): `let openDropdown = null` (`{kind: "chip", column}` or `{kind: "add"}` or `null`), `let dropdownSearch = ""`, `let favorites = loadFavorites()` (reloaded lazily on first render), `let dragFrom = null`.
- `renderFilterBar(container, state, actions)`:
  1. If `state.columns.length === 0`: `container.innerHTML = ""` and return.
  2. Favorites sync (port of `FilterBar.tsx:385-396`): compute `missing = favorites.filter(f => state.columns.includes(f) && !state.activeFilters.some(af => af.column === f))`; if non-empty call `actions.setFilters([...missing.map(col => ({column: col, values: []})), ...state.activeFilters])` and return (the re-render will come back through).
  3. Render: `Filters` label, one chip per `state.activeFilters` entry, `+ Add filter` button, and `Reset` (only when `activeFilters.length > 0`, right-aligned).
  4. Chip label logic (port of `FilterBar.tsx:100-105`): 0 values → column name; 1 value → the value; n values → `${column} (${n})`. Chip gets class `chip-active` when `values.length > 0`; favorite chips show `★` before the label and have no `×` remove button.
  5. Chip click toggles `openDropdown` for that column and re-renders the bar (`renderFilterBar(container, state, actions)` recursion is fine).
  6. Chip dropdown (port of `CheckboxDropdown`, `FilterBar.tsx:178-357`): header with column name + star toggle, search input filtering values (`getUniqueValues` = `extractUniqueValues(state.rawData, column)`), "Tout sélectionner" / "Effacer" buttons, checkbox list of filtered values. Checkbox change calls `actions.setFilters` with the updated values for that column. Keep `openDropdown` set so the dropdown stays open across re-renders; restore the search input's value and focus after re-render (same focus-preservation pattern as the topbar search in Task 7).
  7. Remove (`×`): favorite → clear values; non-favorite → drop the filter (port of `FilterBar.tsx:425-436`).
  8. Add-filter dropdown (port of `FilterBar.tsx:552-634`): search input over `state.columns` minus already-active columns; row click adds `{column, values: []}`; star click toggles favorite AND adds the filter.
  9. Star toggle updates `favorites`, persists via `saveFavorites(favorites)`.
  10. Reset (port of `FilterBar.tsx:446-452`): `actions.setFilters(activeFilters.filter(f => favorites.includes(f.column)).map(f => ({...f, values: []})))`.
  11. Drag & drop (port of `FilterBar.tsx:454-478`): chips get `draggable="true"`; `dragstart` records index, `dragenter` records target, `dragend` splices the reordered array and calls `actions.setFilters(reordered)`.
  12. Outside click: one `document.addEventListener("mousedown", ...)` registered once at module load; if the click is outside `#filterbar`, set `openDropdown = null`, `dropdownSearch = ""` and re-render (keep the last `container/state/actions` in module vars for this).

- [ ] **Step 2: Append filterbar styles to `public/lite/style.css`**

Transcribe values from `src/components/FilterBar.tsx` (bar: `483-497`; chips: `109-176`; dropdown panel: `179-195`; option rows: `296-341`; add button: `537-551`; reset: `638-654`) into classes: `.filterbar`, `.filterbar-label`, `.chip`, `.chip-active`, `.chip-remove`, `.chip-star`, `.dropdown`, `.dropdown-search`, `.dropdown-actions`, `.dropdown-options`, `.dropdown-option`, `.btn-add-filter`, `.btn-reset`.

- [ ] **Step 3: Verify in browser**

With data loaded: add a filter on `Status`, tick a value → gantt row count shrinks and chip shows the value; star it → chip persists after Reset with cleared values; reload the page → favorite chip and saved filter values reappear (from `oem-prefs-*`). Drag a chip to reorder.

- [ ] **Step 4: Run node tests still pass**

Run: `node --test tests/lite/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/lite/js/filterbar.js public/lite/style.css
git commit -m "feat(lite): filter bar with favorites, dropdowns and drag reorder"
```

---

### Task 10: `gantt.js` — chart rendering (toolbar, headers, grid, bars)

**Files:**
- Create: `public/lite/js/gantt.js` (replaces stub)
- Modify: `public/lite/style.css` (append gantt styles)

**Interfaces:**
- Consumes: everything from Task 6 (`gantt-logic.js`), `state.derived` + `state.resetKey` (Task 7), `PHASE_CONFIG` (Task 2).
- Produces: `renderGantt(container, state, actions)`. Module-local `ui` object (extended in Task 11): `{zoom: "month", showInconsistencies: false, showAlerts: false, phaseFilter: null, gridCollapsed: false, sortCol: null, sortDir: null, colFilters: {}, colWidths: {product: 100, acto: 80, epicName: 250, status: 120, progress: 50}, lastResetKey: 0, scrolledOnce: false}`.

This task renders everything static; Task 11 wires the interactions. DOM layout mirrors the React version exactly (`GanttChart.tsx:603-1470`):

```
container
├── .gantt-toolbar          (zoom group, Today, Check dates, Alerts, legend)
├── .gantt-header-row       (flex: grid header | collapse toggle | timeline header (overflow hidden))
└── .gantt-body             (single scroll container, overflow: auto)
    └── .gantt-canvas       (inline-flex, min-width 100%)
        ├── .gantt-grid     (position: sticky; left: 0; z-index 10)
        └── .gantt-timeline (absolute-positioned bars, today line, week lines)
```

- [ ] **Step 1: Write `public/lite/js/gantt.js` (rendering)**

Exact behaviors to implement, all ported from `GanttChart.tsx` (line refs given):

1. **Reset check** (`198-206`): at the top of `renderGantt`, if `state.resetKey !== ui.lastResetKey`, reset `phaseFilter/showInconsistencies/showAlerts/sortCol/sortDir/colFilters` and update `lastResetKey`.
2. **Derived values**: `inconsistencies = detectInconsistencies(state.derived.allEpicTasks)`, `alerts = detectAlerts(state.derived.allEpicTasks)`, `displayedRows = applyGanttRowFilters(state.derived.displayRows, {...ui, inconsistencies, alerts})`, `{minDate, maxDate} = computeDateRange(state.derived.filteredEpicTasks)`, `dayOffset = makeDayOffset(minDate, ZOOM_CONFIG[ui.zoom].dayWidth)`, headers via `buildTimelineHeaders`, `weekLines = computeWeekLines(...)`, `totalWidth = totalDays * dayWidth` with the UTC `totalDays` formula from `GanttChart.tsx:439-440`.
3. **Toolbar** (`670-837`): zoom segmented control (Day/Week/Month/Quarter), divider, red "Today" button, "Check dates"/"N issues" toggle, "Alerts"/"N alerts" toggle (each disables the other when enabled, `741-743`/`766-768`), right-aligned legend of the 5 phases from `PHASE_CONFIG` (label "QA" for "QA / Test") acting as phase filter buttons.
4. **Header row** (`839-1045`): grid column headers (Product/ACTO/Project Name/Status/%) each with sort arrow when sorted, filter `▼` glyph (highlighted when a col filter is set), and a resize handle div; collapse toggle (`◀`/`▶`); timeline header with year row, quarter row, optional month main row, sub row — each header cell absolutely positioned at `{left, width}` from `buildTimelineHeaders`.
5. **Rows** (`1095-1256` grid, `1313-1466` timeline): for each of `displayedRows`, grid cells (product, ACTO as `https://imawebgroup.atlassian.net/browse/<key>` link, name — indented 24px for children of initiatives, status badge, progress %) and a timeline row. Initiative rows: `#f0ecff` background, 3px primary left border, bold; alternating white/`--row-alt` otherwise. When `showInconsistencies`/`showAlerts` highlight a row: red/amber left border + tinted background (`1098-1105`).
6. **Timeline bars**:
   - Initiative row (`1333-1391`): translucent bar `background: rgba(107,44,245,0.08); border: 1.5px solid rgba(107,44,245,0.31)` spanning min start → max end of all children phases (+`dayWidth` for end-day inclusion, `1337`), with the centered label `<key> — <name> [<client>]` (client from first child's `Custom field (Client)`).
   - Epic row (`1393-1462`): grey outline box spanning min start → max phase end (`1396-1418`, uses max `endDate` — the bbb5a6f fix), then one colored bar per phase at `left = dayOffset(start)`, `width = dayOffset(end) - left + dayWidth`, red 2px border when the phase is in `inconsistencies.get(epic.id).conflictingPhases`.
   - Today line (`1263-1294`): 2px red vertical line at `dayOffset(new Date())` with a dot on top, height = `displayedRows.length * ROW_HEIGHT`.
   - Week lines (`1297-1311`): 1px `--border-row` verticals at each `weekLines` x.
7. **Empty state** (`1055-1080`): when `displayedRows.length === 0`, centered message varying by active toggle.
8. **Scroll-to-today on first render per data/zoom** (`589-595`): after building the DOM, if `!ui.scrolledOnce || zoom changed`, set `.gantt-body.scrollLeft = dayOffset(today) - clientWidth / 3`.

Rendering style: build one HTML string per region and assign via `innerHTML`, then attach listeners by `querySelector` (same pattern as Tasks 7-8). Escape user-derived text (epic names, statuses, products) with a local `esc()` helper (`String(v).replace(/[&<>"']/g, ...)`) everywhere it is interpolated into HTML.

- [ ] **Step 2: Append gantt styles to `public/lite/style.css`**

Transcribe values from the line ranges above into classes: `.gantt-toolbar`, `.zoom-group`, `.zoom-btn`, `.zoom-btn-active`, `.btn-today`, `.btn-toggle`, `.btn-toggle-danger-active`, `.btn-toggle-warn-active`, `.legend`, `.legend-btn`, `.gantt-header-row`, `.grid-header-cell`, `.resize-handle`, `.collapse-toggle`, `.timeline-header`, `.tl-cell-year`, `.tl-cell-quarter`, `.tl-cell-main`, `.tl-cell-sub`, `.gantt-body`, `.gantt-canvas`, `.gantt-grid`, `.grid-row`, `.grid-row-initiative`, `.grid-row-alert`, `.grid-row-inconsistent`, `.status-badge`, `.gantt-timeline`, `.tl-row`, `.phase-bar`, `.phase-bar-conflict`, `.initiative-bar`, `.initiative-label`, `.epic-outline`, `.today-line`, `.week-line`, `.gantt-empty`.

- [ ] **Step 3: Verify in browser against the React app**

Open `http://localhost:5173/` (React) and `http://localhost:5173/lite/index.html` side by side with the same data. Expected: same rows in the same order, same bar positions and widths at Month zoom (spot-check 3 epics incl. one initiative), today line on the same date, initiative bars encompassing children outlines.

- [ ] **Step 4: Commit**

```bash
git add public/lite/js/gantt.js public/lite/style.css
git commit -m "feat(lite): gantt chart rendering (toolbar, headers, grid, bars)"
```

---

### Task 11: `gantt.js` — interactions

**Files:**
- Modify: `public/lite/js/gantt.js`
- Modify: `public/lite/style.css` (popover/tooltip/dropdown styles)

**Interfaces:**
- Consumes: the Task 10 module structure.
- Produces: fully interactive gantt. Adds to `ui`: `{popover: null, filterDropdown: null}`.

All ports from `GanttChart.tsx` (line refs given). Every interaction mutates `ui` then calls `renderGantt(container, state, actions)` again (full re-render), except scroll sync which touches the DOM directly.

- [ ] **Step 1: Implement toolbar + header interactions**

1. Zoom buttons set `ui.zoom`; "Today" centers scroll on `dayOffset(today) - clientWidth/2` (`710-717`); "Check dates"/"Alerts" toggle their flags (mutually exclusive, `740-743`/`765-768`); legend buttons toggle `ui.phaseFilter` and, when activating, clear both flags and center on today (`800-814`).
2. Column header click cycles sort asc → desc → none (`282-290`). Filter `▼` click opens `ui.filterDropdown = {col, rect}` (`293-297`); the dropdown lists unique `getCellText` values of non-initiative rows with checkboxes updating `ui.colFilters` (`1472-1560`), with a "Clear" action; a fixed transparent overlay closes it on outside click.
3. Column resize: `mousedown` on `.resize-handle` + document `mousemove`/`mouseup`, min width 40 (`264-279`) — during drag update only the affected DOM widths, re-render once on mouseup. Double-click auto-fits using canvas `measureText` with font `500 11px/13px 'Aptos','Aptos Display',Calibri,sans-serif` and the paddings from `242-262`.
4. Collapse toggle flips `ui.gridCollapsed` (`916-937`).

- [ ] **Step 2: Implement row/bar interactions**

1. Phase bar click toggles a popover (`1427-1440`): fixed-position card at click x/y showing phase name ("QA" for "QA / Test"), Start/End (`formatDate` as `en-GB` `dd MMM yyyy`), Duration in days (`597-601`, `605-668`) — with the small arrow. Click elsewhere (document `mousedown`) or scrolling the body closes it (`554-572`).
2. Grid row click (non-initiative) scrolls to that epic's phase closest to today (`303-321`).
3. Grid row hover, when the row has inconsistency/alert details and the matching toggle is on, shows the fixed tooltip at `right + 8px` with the details list (`1130-1158`); mouseleave hides it. Implement with a single reusable `#gantt-tooltip` element appended to `body`.
4. Scroll sync (`575-586`): `.gantt-body` scroll sets `.timeline-header.scrollLeft` and stores `ui.scrollLeft`, then updates the initiative labels' centering (`1359-1373`: label centered in the visible part of the bar) by direct DOM update on the `.initiative-label` elements — no full re-render on scroll.

- [ ] **Step 3: Append popover/tooltip/col-dropdown styles to `public/lite/style.css`**

Transcribe from `GanttChart.tsx:606-668` (popover), `1130-1158` (tooltip), `1483-1558` (column filter dropdown) into: `.phase-popover`, `.phase-popover-arrow`, `.gantt-tooltip`, `.col-filter-overlay`, `.col-filter-dropdown`.

- [ ] **Step 4: Verify in browser**

Expected: zoom switching keeps bars aligned with headers; clicking a bar opens the popover with correct dates/duration; sorting by Product keeps initiative groups intact; column filter on Status reduces rows; resize + double-click autofit work; collapsing the grid leaves the timeline usable; "Check dates" shows only conflicted epics with red-bordered phases and hovering a row shows details; search + phase filter combine.

- [ ] **Step 5: Run node tests still pass**

Run: `node --test tests/lite/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/lite/js/gantt.js public/lite/style.css
git commit -m "feat(lite): gantt interactions (zoom, sort, filters, popover, resize)"
```

---

### Task 12: `ai.js` — AI assistant panel

**Files:**
- Create: `public/lite/js/ai.js` (replaces stub)
- Modify: `public/lite/style.css` (append panel styles)

**Interfaces:**
- Consumes: `state.derived.displayRows` (Task 7), `/api/ai` endpoint (existing, unchanged).
- Produces: `toggleAiPanel(state)` — mounts/unmounts the panel in `#ai-root`; module-local `messages` array persists across open/close within the session.

Port of `src/components/AiPanel.tsx`. `buildContext` (`AiPanel.tsx:16-39`) is copied as-is (types stripped): epic/initiative counts, then up to 80 rows formatted `key | product | name | Status: s | phases`, `... and N more rows` overflow line.

- [ ] **Step 1: Write `public/lite/js/ai.js`**

```js
// Port of src/components/AiPanel.tsx (no paywall/roles).

let messages = []; // {role: "user"|"assistant", text}
let loading = false;

function buildContext(rows) {
  const lines = [];
  lines.push(`Total projects visible: ${rows.filter((r) => r.type === "epic").length}`);
  lines.push(`Initiatives: ${rows.filter((r) => r.type === "initiative").length}`);
  lines.push("");
  lines.push("Projects:");
  for (const row of rows.slice(0, 80)) {
    const e = row.epic;
    if (row.type === "initiative") {
      lines.push(`[INITIATIVE] ${e.epicKey} - ${e.epicName} (${row.children?.length || 0} children)`);
    } else {
      const phases = e.phases.map((p) => `${p.phaseName}: ${p.startDate.toLocaleDateString("en-GB")} → ${p.endDate.toLocaleDateString("en-GB")}`).join(", ");
      const product = e.rawData["Custom field (Product)"] || "";
      lines.push(`${e.epicKey} | ${product} | ${e.epicName} | Status: ${e.status} | ${phases}`);
    }
  }
  if (rows.length > 80) lines.push(`... and ${rows.length - 80} more rows`);
  return lines.join("\n");
}

export function toggleAiPanel(state) {
  const root = document.getElementById("ai-root");
  if (root.innerHTML) { root.innerHTML = ""; return; }
  render(root, state);
}

function render(root, state) {
  root.innerHTML = `
    <div class="ai-panel">
      <div class="ai-header"><span>AI Assistant</span><button class="ai-close">×</button></div>
      <div class="ai-messages">
        ${messages.length === 0 ? `
          <div class="ai-empty">
            <p class="ai-empty-icon">🤖</p>
            <p class="ai-empty-title">Ask me anything about your projects</p>
            <p class="ai-empty-hint">"Which projects are at risk?"<br/>"Summary of BMW projects"<br/>"What's in Customer UAT right now?"</p>
          </div>` : ""}
        ${messages.map((m) => `<div class="ai-msg ai-msg-${m.role}"><div class="ai-bubble"></div></div>`).join("")}
        ${loading ? '<div class="ai-thinking"><span class="ai-pulse"></span>Thinking...</div>' : ""}
      </div>
      <div class="ai-input-row">
        <input id="ai-input" type="text" placeholder="Ask a question..." />
        <button id="ai-send" ${loading ? "disabled" : ""}>Send</button>
      </div>
    </div>
  `;
  // textContent (not innerHTML) for message bodies — they contain user/model text
  const bubbles = root.querySelectorAll(".ai-bubble");
  messages.forEach((m, i) => { bubbles[i].textContent = m.text; });
  const msgBox = root.querySelector(".ai-messages");
  msgBox.scrollTop = msgBox.scrollHeight;

  root.querySelector(".ai-close").addEventListener("click", () => { root.innerHTML = ""; });
  const input = root.querySelector("#ai-input");
  const send = async () => {
    const trimmed = input.value.trim();
    if (!trimmed || loading) return;
    messages.push({ role: "user", text: trimmed });
    loading = true;
    render(root, state);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, context: buildContext(state.derived.displayRows) }),
      });
      const data = await res.json();
      messages.push({ role: "assistant", text: data.error ? `Error: ${data.error}` : data.response });
    } catch (err) {
      messages.push({ role: "assistant", text: `Error: ${err}` });
    } finally {
      loading = false;
      render(root, state);
      root.querySelector("#ai-input")?.focus();
    }
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  root.querySelector("#ai-send").addEventListener("click", send);
  input.focus();
}
```

- [ ] **Step 2: Append AI panel styles to `public/lite/style.css`**

Transcribe from `src/components/AiPanel.tsx:86-224`: fixed right panel 400px wide full-height (`.ai-panel`), primary header (`.ai-header`), scrollable messages with user bubbles right/primary and assistant bubbles left/`#f4f1fe` with the asymmetric border radii (`.ai-msg`, `.ai-bubble`), empty state (`.ai-empty*`), pulsing thinking dot (`.ai-thinking`, `.ai-pulse` with the `pulse` keyframes), input row (`.ai-input-row`).

- [ ] **Step 3: Verify in browser**

With data loaded and `ANTHROPIC_API_KEY` available to the API (deployed env or `vercel dev`): open AI panel, ask "How many projects are visible?" — a plain-text answer appears. Without the key, the error surfaces in the thread. Panel closes/reopens keeping the conversation.

- [ ] **Step 4: Commit**

```bash
git add public/lite/js/ai.js public/lite/style.css
git commit -m "feat(lite): AI assistant panel"
```

---

### Task 13: Final verification & guardrails

**Files:**
- No new files. Verification only (fix regressions in place if found).

- [ ] **Step 1: Full test suite**

Run: `node --test tests/lite/`
Expected: PASS, 0 failures.

- [ ] **Step 2: Existing app untouched**

Run: `git diff --stat main -- src/ api/ index.html package.json`
Expected: empty output (only `public/lite/`, `tests/lite/`, `vercel.json`, `docs/` changed since branching).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: exit 0; `ls dist/lite/js` lists all 10 modules; `dist/index.html` (React app) unchanged.

- [ ] **Step 4: Side-by-side acceptance run (spec success criteria)**

In the browser, `/` vs `/lite/` with the same JIRA data:
1. `/lite/` reaches the Gantt with no login screen.
2. Same row order, same bar geometry at each zoom level (spot-check Day and Quarter).
3. Filters + favorites + search behave identically; reload restores them.
4. AI panel answers using visible rows.
5. Network tab on `/lite/`: no request to `supabase.co`, no React/vendor bundle; first render from cache is near-instant.
6. Auto-refresh: set 60s in the connector, observe a silent refetch after a minute.

- [ ] **Step 5: Commit any fixes and finish**

```bash
git add -A && git commit -m "chore(lite): final verification fixes"
```

Then use superpowers:finishing-a-development-branch to decide merge/PR.

---

## Self-Review Notes

- **Spec coverage:** connexion JIRA (T4/T8), Gantt identique incl. DST + initiative fixes (T6 `makeDayOffset` UTC + T10 §6), filtres+recherche (T3/T9), panneau IA (T12), cache localStorage partagé (T7 boot + T8), bandeau d'erreur (T1 `#error-banner` + T7 `showError`), quota localStorage try/catch (T7 `setData`), rewrite vercel unique (T1), critères de réussite (T13). Exclusions (login/admin/import/PPTX) : rien à faire — jamais construits.
- **Type consistency check:** `actions.setData(rows, {silent})` used by T8/T7; `renderGantt(container, state, actions)` consistent T7/T10/T11; `openConnector(state, actions)` consistent T7/T8; `toggleAiPanel(state)` consistent T7/T12; header shape `{label, left, width}` consistent T6/T10.
- **Known deviation from the React app (intentional, per spec):** no admin-managed JIRA config (everyone edits the form), no AI paywall, no Supabase filter sync (localStorage `prefs.js` instead), `lite` badge added to the brand wordmark.


