// DOM rendering + interactions for the Gantt chart.
// Port of src/components/GanttChart.tsx on top of the pure gantt-logic.js.
import {
  ZOOM_CONFIG, ROW_HEIGHT, BAR_HEIGHT, BAR_TOP, TIMELINE_MARGIN, HEADER_ROW_HEIGHT,
  detectInconsistencies, detectAlerts, detectEddIssues, computeDateRange, makeDayOffset,
  buildTimelineHeaders, computeWeekLines, getCellText, applyGanttRowFilters,
  getDisplayProgress, computePhaseCumulativeWeights, computePhaseWeight,
  computePhaseWorkloadDays, computePhasePrice, computePhasePriceCumulative,
  computePeriodForecast, resolvePhaseRenderBounds, computeProjectedProgress,
  computePhaseThisMonth,
} from "./gantt-logic.js";
import { PHASE_CONFIG, parseJiraDate } from "./transform.js";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// Short labels shown inside phase bars when they are wide enough
const PHASE_SHORT = {
  "Analysis": "Analysis",
  "Development": "Dev",
  "QA / Test": "QA",
  "Customer UAT": "UAT",
  "Pilot": "Pilot",
};

// The Analysis box has no % tracking of its own — this is the only signal
// that analysis is actually finished: the epic has moved past its earliest
// statuses (still Backlog/In Definition means analysis hasn't wrapped, even
// if the box's scheduled end date has already passed) and that end date is
// behind us.
const ANALYSIS_NOT_DONE_STATUSES = new Set(["backlog", "in definition"]);

// Status pill colors [background, foreground] — roadmap-reference style
const STATUS_COLORS = {
  "blocked": ["#FDE8E8", "#DC2626"],
  "in definition": ["#FDF0DF", "#D97706"],
  "scoping rfc": ["#FDF0DF", "#D97706"],
  "backlog": ["#F1F0F5", "#6B7280"],
  "to do": ["#F1F0F5", "#6B7280"],
  "in progress": ["#E7EDFE", "#4A6CF7"],
  "pending customer uat": ["#F0EAFD", "#8B5CF6"],
  "pending internal uat": ["#F0EAFD", "#8B5CF6"],
  "done": ["#E3F6EC", "#16A34A"],
};

export function statusColors(status) {
  return STATUS_COLORS[status.trim().toLowerCase()] || ["#F1F0F5", "#6B7280"];
}

const ui = {
  zoom: "month",
  showInconsistencies: false,
  showAlerts: false,
  showEddIssues: false,
  phaseFilter: null,
  gridCollapsed: false,
  sortCol: null,
  sortDir: null,
  colFilters: {},
  colWidths: { product: 108, acto: 100, epicName: 270, status: 132, progress: 96 },
  lastResetKey: 0,
  filterDropdown: null, // {col, rect: {left, bottom}}
  scrollKey: "",        // zoom+rowcount signature → scroll to today when it changes
};

const COLS = [
  { col: "product", label: "Product", fontSize: 11 },
  { col: "acto", label: "ACTO", fontSize: 11 },
  { col: "epicName", label: "Project Name", fontSize: 12 },
  { col: "status", label: "Status", fontSize: 12 },
  { col: "progress", label: "%", fontSize: 11 },
];

let rerender = null; // bound to the latest (container, state, actions)
let unschedStickyLeft = 26; // sticky offset for "No date scheduled" pills

function esc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const formatDate = (d) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function formatMoney(val) {
  return Math.round(val).toLocaleString("en-GB");
}

// Compact form for tight spaces (the grid's % column): 1046 -> "1k", 793 -> "793".
function formatMoneyCompact(val) {
  const abs = Math.abs(val);
  if (abs >= 1000) return `${(val / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(val));
}

// Story points: whole numbers plain, fractional to one decimal.
function formatPoints(val) {
  return Number.isInteger(val) ? String(val) : val.toFixed(1);
}

// JIRA logs time in seconds; show hours (its native tracking unit) with
// days alongside, using the same 8h/day convention as Step workload.
function formatTimeSpent(seconds) {
  const hours = seconds / 3600;
  const days = hours / 8;
  const h = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${h}h (${days.toFixed(1)}d)`;
}

// The epic's total NRR — not per-phase data, so every phase box shows the
// same figure when the toggle is set to NRR mode.
function getEpicNrr(epic) {
  const raw = epic.rawData["Custom field ((€)NRR New (DEV))"];
  if (!raw || !raw.trim()) return null;
  const val = parseFloat(raw);
  return isNaN(val) ? null : formatMoney(val);
}

export function renderGantt(container, state, actions) {
  rerender = () => renderGantt(container, state, actions);

  // Reset internal filters when resetKey changes (FilterBar "Reset")
  if (state.resetKey !== ui.lastResetKey) {
    ui.lastResetKey = state.resetKey;
    ui.phaseFilter = null;
    ui.showInconsistencies = false;
    ui.showAlerts = false;
    ui.showEddIssues = false;
    ui.sortCol = null;
    ui.sortDir = null;
    ui.colFilters = {};
    ui.filterDropdown = null;
  }

  const { filteredEpicTasks, displayRows } = state.derived;
  // Computed from the currently filtered epics (Product/Project/column
  // filters), not the full dataset — otherwise this badge count wouldn't
  // match the rows actually shown below once a filter narrows the list.
  const inconsistencies = detectInconsistencies(filteredEpicTasks);
  const alerts = detectAlerts(filteredEpicTasks);
  const eddIssues = detectEddIssues(filteredEpicTasks);
  const displayedRows = applyGanttRowFilters(displayRows, {
    showInconsistencies: ui.showInconsistencies,
    showAlerts: ui.showAlerts,
    showEddIssues: ui.showEddIssues,
    phaseFilter: ui.phaseFilter,
    colFilters: ui.colFilters,
    sortCol: ui.sortCol,
    sortDir: ui.sortDir,
    inconsistencies,
    alerts,
    eddIssues,
  });

  const config = ZOOM_CONFIG[ui.zoom];
  const { minDate, maxDate } = computeDateRange(filteredEpicTasks);
  const totalDays = (Date.UTC(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())
    - Date.UTC(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) / 86400000;
  const totalWidth = totalDays * config.dayWidth;
  const dayOffset = makeDayOffset(minDate, config.dayWidth);
  const { yearHeaders, quarterHeaders, mainHeaders, subHeaders } =
    buildTimelineHeaders({ minDate, maxDate, zoom: ui.zoom, dayOffset });
  const weekLines = computeWeekLines(minDate, maxDate, dayOffset);

  const gridTotalWidth = COLS.reduce((s, c) => s + ui.colWidths[c.col], 0);
  unschedStickyLeft = (ui.gridCollapsed ? 0 : gridTotalWidth) + 26;
  const headerHeight = HEADER_ROW_HEIGHT * 2 + (mainHeaders.length > 0 ? HEADER_ROW_HEIGHT : 0) + (subHeaders.length > 0 ? HEADER_ROW_HEIGHT : 0) + 2;
  const rowsHeight = displayedRows.length * ROW_HEIGHT;
  const todayX = dayOffset(new Date());

  // Preserve scroll across re-renders; jump to today when zoom/data change
  const prevBody = container.querySelector(".gantt-body");
  const prevScroll = prevBody ? { left: prevBody.scrollLeft, top: prevBody.scrollTop } : null;
  const scrollKey = `${ui.zoom}|${state.rawData.length}`;

  container.innerHTML = `
    ${toolbarHtml(inconsistencies, alerts, eddIssues)}
    <div class="gantt-header-row">
      ${ui.gridCollapsed ? "" : `
      <div class="gantt-grid-header" style="width:${gridTotalWidth}px;height:${headerHeight}px">
        ${COLS.map(({ col, label, fontSize }) => {
          const isSorted = ui.sortCol === col;
          const hasFilter = ui.colFilters[col]?.size > 0;
          return `
            <div class="grid-header-cell ${col === "progress" ? "grid-header-cell-center" : ""}"
                 data-sort-col="${col}" data-colw="${col}"
                 style="width:${ui.colWidths[col]}px;${col === "epicName" ? "padding:0 12px;" : ""}">
              <span class="grid-header-label">${label}</span>
              ${isSorted ? `<span class="sort-arrow">${ui.sortDir === "asc" ? "▲" : "▼"}</span>` : ""}
              <span class="col-filter-btn ${hasFilter ? "col-filter-btn-active" : ""}" data-filter-col="${col}" title="Filter">▼</span>
              <div class="resize-handle" data-resize-col="${col}"></div>
            </div>
          `;
        }).join("")}
      </div>`}
      <div class="collapse-toggle" title="${ui.gridCollapsed ? "Show columns" : "Hide columns"}">${ui.gridCollapsed ? "▶" : "◀"}</div>
      <div class="timeline-header">
        <div style="width:${totalWidth + TIMELINE_MARGIN * 2}px;position:relative">
          <div class="tl-header-row">
            ${yearHeaders.map((h) => `<div class="tl-cell tl-cell-year" style="left:${h.left}px;width:${h.width}px">${h.label}</div>`).join("")}
          </div>
          <div class="tl-header-row">
            ${quarterHeaders.map((h) => `<div class="tl-cell tl-cell-quarter" ${periodAttrs(h)} style="left:${h.left}px;width:${h.width}px">${h.label}</div>`).join("")}
          </div>
          ${mainHeaders.length > 0 ? `<div class="tl-header-row">
            ${mainHeaders.map((h) => `<div class="tl-cell tl-cell-main" ${periodAttrs(h)} style="left:${h.left}px;width:${h.width}px">${h.label}</div>`).join("")}
          </div>` : ""}
          ${subHeaders.length > 0 ? `<div class="tl-header-row tl-header-row-last">
            ${subHeaders.map((h) => `<div class="tl-cell tl-cell-sub ${h.left <= todayX && todayX < h.left + h.width ? "tl-cell-current" : ""}" ${periodAttrs(h)} style="left:${h.left}px;width:${h.width}px">${h.label}</div>`).join("")}
          </div>` : ""}
        </div>
      </div>
    </div>
    <div class="gantt-body-wrap">
      <div class="gantt-body">
        <div class="gantt-canvas">
          ${displayedRows.length === 0 ? emptyStateHtml(state.refreshing) : ""}
          ${ui.gridCollapsed ? "" : `
          <div class="gantt-grid" style="width:${gridTotalWidth}px">
            ${displayedRows.map((row, i) => gridRowHtml(row, i, inconsistencies, alerts, eddIssues)).join("")}
          </div>`}
          <div class="gantt-timeline" style="width:${totalWidth + TIMELINE_MARGIN * 2}px">
            ${todayX >= 0 && todayX <= totalWidth ? `
              <div class="today-line" style="left:${todayX}px;height:${rowsHeight}px"><div class="today-dot"></div></div>` : ""}
            ${weekLines.map((x) => `<div class="week-line" style="left:${x}px;height:${rowsHeight}px"></div>`).join("")}
            ${displayedRows.map((row, i) => timelineRowHtml(row, i, dayOffset, config, inconsistencies, alerts, eddIssues, state.boxMode, state.storyMetrics)).join("")}
          </div>
        </div>
      </div>
    </div>
    ${filterDropdownHtml(displayRows)}
  `;

  wireEvents(container, state, actions, {
    dayOffset, displayedRows, inconsistencies, alerts, eddIssues, todayX, config,
  });

  // Scroll: today on zoom/data change, otherwise preserve
  const body = container.querySelector(".gantt-body");
  if (body) {
    if (ui.scrollKey !== scrollKey) {
      ui.scrollKey = scrollKey;
      if (displayedRows.length > 0) body.scrollLeft = todayX - body.clientWidth / 3;
    } else if (prevScroll) {
      body.scrollLeft = prevScroll.left;
      body.scrollTop = prevScroll.top;
    }
    syncHeaderScroll(container, body);
    updateInitiativeLabels(container, body);

    // Double-clicking a row in the Forecast Detail table sets this, then
    // switches to this view — land on that exact row (both axes) and
    // flash it, since it's one row among many that otherwise look alike.
    if (state.focusRowKey) {
      const idx = displayedRows.findIndex(
        (r) => (r.type === "initiative" ? r.initiativeKey : r.epic.epicKey) === state.focusRowKey
      );
      if (idx >= 0) {
        body.scrollTop = idx * ROW_HEIGHT - body.clientHeight / 2 + ROW_HEIGHT / 2;
        scrollToClosestPhase(displayedRows[idx].epic, body, dayOffset);
        syncHeaderScroll(container, body);
        const rowEl = container.querySelector(`.grid-row[data-row-key="${CSS.escape(state.focusRowKey)}"]`);
        if (rowEl) {
          rowEl.classList.add("grid-row-focus-flash");
          setTimeout(() => rowEl.classList.remove("grid-row-focus-flash"), 1600);
        }
      }
      state.focusRowKey = null;
    }
  }
}

/* ---------- HTML builders ---------- */

function toolbarHtml(inconsistencies, alerts, eddIssues) {
  return `
    <div class="gantt-toolbar">
      <div class="zoom-group">
        ${["day", "week", "month", "quarter"].map((level) => `
          <button class="zoom-btn ${ui.zoom === level ? "zoom-btn-active" : ""}" data-zoom="${level}">
            ${level[0].toUpperCase() + level.slice(1)}
          </button>`).join("")}
      </div>
      <div class="toolbar-divider"></div>
      <button class="btn-today"><span class="btn-today-tick"></span>Today</button>
      <div class="toolbar-divider"></div>
      <button class="btn-toggle ${ui.showInconsistencies ? "btn-toggle-danger-active" : ""}" data-toggle="inconsistencies">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        ${ui.showInconsistencies ? `${inconsistencies.size} issues` : "Check dates"}
      </button>
      <button class="btn-toggle ${ui.showAlerts ? "btn-toggle-warn-active" : ""}" data-toggle="alerts">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        ${ui.showAlerts ? `${alerts.size} alerts` : "Alerts"}
      </button>
      <button class="btn-toggle ${ui.showEddIssues ? "btn-toggle-edd-active" : ""}" data-toggle="edd" title="Epics whose Estimated Delivery Date is before Customer UAT even starts">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${ui.showEddIssues ? `${eddIssues.size} EDD issues` : "Check EDD"}
      </button>
      <div class="legend">
        ${PHASE_CONFIG.map((p) => {
          const active = ui.phaseFilter === p.name;
          const label = p.name === "QA / Test" ? "QA" : p.name;
          return `
            <button class="legend-btn ${active ? "legend-btn-active" : ""}" data-phase="${esc(p.name)}"
                    style="${active ? `background:${p.color};box-shadow:0 2px 8px ${p.color}44;` : ""}">
              <span class="legend-swatch" style="background:${active ? "rgba(255,255,255,0.9)" : p.color}"></span>
              ${label}
            </button>`;
        }).join("")}
      </div>
    </div>
  `;
}

// Whole-month / whole-quarter header cells carry start/end (see
// buildTimelineHeaders) so their NRR forecast can be computed on hover;
// week/day cells don't and get no attributes (no tooltip wired for them).
function periodAttrs(h) {
  if (!h.start || !h.end) return "";
  return `data-period-start="${h.start.toISOString()}" data-period-end="${h.end.toISOString()}"`;
}

function emptyStateHtml(refreshing) {
  // A JIRA refresh in flight can legitimately take a few seconds (several
  // paginated requests, plus JIRA's own search-index lag for anything just
  // edited) — showing the same "No results" during that window as for a
  // filter that truly matches nothing reads as broken rather than loading.
  if (refreshing) {
    return `
      <div class="gantt-empty">
        <div class="gantt-empty-icon">⏳</div>
        <div class="gantt-empty-title">Loading…</div>
        <div class="gantt-empty-detail">Still fetching the latest data from JIRA — this can take a few seconds.</div>
      </div>
    `;
  }
  const icon = ui.showInconsistencies ? "⚠" : ui.showAlerts ? "🔔" : ui.showEddIssues ? "📅" : "📋";
  const detail = ui.showInconsistencies
    ? "No date inconsistencies found in the current filtered view."
    : ui.showAlerts
      ? "No status alerts found in the current filtered view."
      : ui.showEddIssues
        ? "No EDD issues found in the current filtered view."
        : "No projects match the current filters.";
  return `
    <div class="gantt-empty">
      <div class="gantt-empty-icon">${icon}</div>
      <div class="gantt-empty-title">No results</div>
      <div class="gantt-empty-detail">${detail}</div>
    </div>
  `;
}

function rowMeta(row, i, inconsistencies, alerts, eddIssues) {
  const epic = row.epic;
  const isInitiative = row.type === "initiative";
  const isInconsistent = ui.showInconsistencies && inconsistencies.has(epic.id);
  const isAlerted = ui.showAlerts && alerts.has(epic.id);
  const isEddIssue = ui.showEddIssues && eddIssues.has(epic.id);
  const isHighlighted = isInconsistent || isAlerted || isEddIssue;
  return {
    epic, isInitiative, isInconsistent, isAlerted, isEddIssue, isHighlighted,
    highlightColor: isInconsistent ? "#e03131" : isAlerted ? "#e67700" : "#2563EB",
    rowClass: [
      isInitiative ? "row-initiative" : "",
      isHighlighted ? (isInconsistent ? "row-inconsistent" : isAlerted ? "row-alerted" : "row-edd") : "",
    ].filter(Boolean).join(" "),
  };
}

// An initiative's own total/reached NRR is the sum of its children's —
// its % is then derived from that sum (reached ÷ total), not a plain
// average of the children's %s, so a big-budget epic naturally outweighs
// a small one, and the % and the €X/€Y under it always agree.
function computeInitiativeNrr(children) {
  let total = 0;
  let reached = 0;
  let any = false;
  for (const child of children) {
    const childProgress = getDisplayProgress(child);
    const cumPrices = computePhasePriceCumulative(child);
    const childTotal = cumPrices ? cumPrices["Pilot"] : null;
    if (childProgress === null || !childTotal) continue;
    total += childTotal;
    reached += childTotal * (childProgress / 100);
    any = true;
  }
  return any && total > 0 ? { pct: Math.round((reached / total) * 100), reached, total } : null;
}

// Same sum-then-divide approach as computeInitiativeNrr, but projected
// forward to targetDate via computeProjectedProgress (never regresses
// below today's real progress) instead of using today's % as-is.
function computeInitiativeProjection(children, targetDate) {
  let total = 0;
  let reached = 0;
  let any = false;
  for (const child of children) {
    const pct = computeProjectedProgress(child, targetDate);
    const cumPrices = computePhasePriceCumulative(child);
    const childTotal = cumPrices ? cumPrices["Pilot"] : null;
    if (pct === null || !childTotal) continue;
    total += childTotal;
    reached += childTotal * (pct / 100);
    any = true;
  }
  return any && total > 0 ? { pct: Math.round((reached / total) * 100), reached, total } : null;
}

// One projection per month from the current month through whichever month
// the initiative's last scheduled phase (across all children) ends in —
// capped so a very long-running project doesn't produce a huge tooltip.
const PROJECTION_MONTHS_CAP = 18;

function computeInitiativeMonthlyProjections(children, allPhases) {
  if (allPhases.length === 0) return [];
  const now = new Date();
  const maxEndTime = Math.max(...allPhases.map((p) => p.endDate.getTime()));
  const horizon = new Date(new Date(maxEndTime).getFullYear(), new Date(maxEndTime).getMonth(), 1);

  const months = [];
  let cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cursor <= horizon && months.length < PROJECTION_MONTHS_CAP) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const projection = computeInitiativeProjection(children, monthEnd);
    if (projection) {
      months.push({
        label: cursor.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
        ...projection,
      });
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months;
}

function gridRowHtml(row, i, inconsistencies, alerts, eddIssues) {
  const { epic, isInitiative, isInconsistent, isAlerted, isEddIssue, isHighlighted, highlightColor } =
    rowMeta(row, i, inconsistencies, alerts, eddIssues);
  const product = epic.rawData["Custom field (Product)"] || "";
  const initiativeNrr = isInitiative ? computeInitiativeNrr(row.children || []) : null;
  const displayProgress = isInitiative ? (initiativeNrr ? initiativeNrr.pct : null) : getDisplayProgress(epic);
  const progress = displayProgress !== null ? `${displayProgress}%` : "";
  // NRR reached / total expected at the current progress %, from the same
  // Budget Price total as the phase boxes' NRR mode (Pilot's cumulative
  // value = the sum of every step's own Budget Price).
  let nrrProgressHtml = "";
  const hasProjection = isInitiative ? (row.children || []).length > 0 : epic.phases.length > 0;
  if (isInitiative) {
    if (initiativeNrr) {
      nrrProgressHtml = `
        <div class="grid-cell-progress-nrr" title="€${formatMoney(initiativeNrr.reached)} reached of €${formatMoney(initiativeNrr.total)} expected (sum of epics)">
          €${formatMoneyCompact(initiativeNrr.reached)}/€${formatMoneyCompact(initiativeNrr.total)}
        </div>
      `;
    }
  } else if (displayProgress !== null) {
    const cumPrices = computePhasePriceCumulative(epic);
    const totalNrr = cumPrices ? cumPrices["Pilot"] : null;
    if (totalNrr) {
      const reached = totalNrr * (displayProgress / 100);
      nrrProgressHtml = `
        <div class="grid-cell-progress-nrr" title="€${formatMoney(reached)} reached of €${formatMoney(totalNrr)} expected">
          €${formatMoneyCompact(reached)}/€${formatMoneyCompact(totalNrr)}
        </div>
      `;
    }
  }
  const hasDetails = (isInconsistent || isAlerted || isEddIssue);
  return `
    <div class="grid-row ${rowMeta(row, i, inconsistencies, alerts, eddIssues).rowClass}"
         data-row-idx="${i}" data-row-key="${esc(isInitiative ? row.initiativeKey : row.epic.epicKey)}"
         ${hasDetails ? `data-has-details="1"` : ""}
         style="height:${ROW_HEIGHT}px;${isInitiative && !isHighlighted ? "" : ""}">
      <div class="grid-cell" data-colw="product" style="width:${ui.colWidths.product}px" title="${esc(product)}">
        ${isInitiative ? "" : esc(product || "—")}
      </div>
      <div class="grid-cell" data-colw="acto" style="width:${ui.colWidths.acto}px" title="${esc(epic.epicKey || "")}">
        ${epic.epicKey
          ? `<a class="acto-link ${isInitiative ? "acto-link-strong" : ""}" href="https://imawebgroup.atlassian.net/browse/${encodeURIComponent(epic.epicKey)}" target="_blank" rel="noopener noreferrer">${esc(epic.epicKey)}</a>`
          : "—"}
      </div>
      <div class="grid-cell grid-cell-name ${isInitiative ? "grid-cell-name-initiative" : ""}"
           data-colw="epicName" style="width:${ui.colWidths.epicName}px;${isHighlighted ? `color:${highlightColor};` : ""}"
           title="${esc(epic.epicName)}">
        ${esc(epic.epicName)}
      </div>
      <div class="grid-cell" data-colw="status" style="width:${ui.colWidths.status}px">
        ${epic.status ? (() => {
          const [bg, fg] = statusColors(epic.status);
          return `<span class="status-badge" style="background:${bg};color:${fg}">${esc(epic.status)}</span>`;
        })() : ""}
      </div>
      <div class="grid-cell grid-cell-progress" data-colw="progress" style="width:${ui.colWidths.progress}px" ${hasProjection ? `data-row-idx="${i}" data-has-projection="1"` : ""}>
        ${progress}
        ${nrrProgressHtml}
      </div>
    </div>
  `;
}

function timelineRowHtml(row, i, dayOffset, config, inconsistencies, alerts, eddIssues, boxMode, storyMetrics) {
  const { epic, isInitiative, isInconsistent } = rowMeta(row, i, inconsistencies, alerts, eddIssues);
  const info = isInconsistent ? inconsistencies.get(epic.id) : null;
  let bars = "";

  if (isInitiative && epic.phases.length > 0) {
    const allDates = epic.phases.flatMap((p) => [p.startDate, p.endDate]);
    const minLeft = dayOffset(new Date(Math.min(...allDates.map((d) => d.getTime()))));
    const maxRight = dayOffset(new Date(Math.max(...allDates.map((d) => d.getTime()))));
    const w = maxRight - minLeft + config.dayWidth;
    if (w > 0) {
      const client = row.children?.[0]?.rawData["Custom field (Client)"]?.trim() || "";
      const label = `${epic.epicKey} — ${epic.epicName}${client ? ` [${client}]` : ""}`;
      // Slim "summary task" bar with the label in small caps above it
      bars = `
        <div class="initiative-bar" style="left:${minLeft}px;top:31px;width:${w}px"></div>
        <div class="initiative-label" data-bar-left="${minLeft}" data-bar-width="${w}"
             style="left:${minLeft + w / 2}px;top:7px;height:16px">
          <span>${esc(label)}</span>
        </div>
      `;
    }
  } else if (!isInitiative && epic.phases.length === 0) {
    // Unscheduled epic: status pill + note, pinned to the visible viewport
    const [bg, fg] = statusColors(epic.status || "");
    bars = `
      <div class="tl-unscheduled" style="left:${unschedStickyLeft}px">
        ${epic.status ? `<span class="status-pill" style="background:${bg};color:${fg}">${esc(epic.status)}</span>` : ""}
        <span class="tl-nodate">No date scheduled</span>
      </div>
    `;
  } else if (!isInitiative) {
    if (epic.phases.length > 0) {
      const visible = epic.phases
        .filter((p) => dayOffset(p.endDate) - dayOffset(p.startDate) > 0)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      if (visible.length > 0) {
        const minLeft = dayOffset(visible[0].startDate);
        const maxRight = Math.max(...visible.map((p) => dayOffset(p.endDate)));
        // Thin rail connecting first phase start to last phase end
        bars += `
          <div class="phase-track ${isInconsistent ? "phase-track-inconsistent" : ""}"
               style="left:${minLeft}px;top:${BAR_TOP + BAR_HEIGHT / 2 - 1}px;width:${maxRight - minLeft + config.dayWidth}px"></div>
        `;
      }
    }
    const cumWeights = computePhaseCumulativeWeights(epic);
    const cumPrices = boxMode === "nrr" ? computePhasePriceCumulative(epic) : null;
    bars += resolvePhaseRenderBounds(epic.phases).map(({ phase, startDate, endDate }) => {
      const left = dayOffset(startDate);
      const width = dayOffset(endDate) - left + config.dayWidth;
      if (width <= 0) return "";
      const isConflicting = info?.conflictingPhases.has(phase.phaseName);
      const isAnalysisDone = phase.phaseName === "Analysis"
        && !ANALYSIS_NOT_DONE_STATUSES.has((epic.status || "").trim().toLowerCase())
        && phase.endDate < new Date();
      const fallback = PHASE_SHORT[phase.phaseName] || phase.phaseName;
      let label;
      if (boxMode === "effort") {
        const days = computePhaseWorkloadDays(epic, phase.phaseName);
        label = days !== null ? `${days}d` : fallback;
      } else if (boxMode === "nrr") {
        // Running total of Budget Price through this phase — same data as
        // the "Step budget" tooltip row, cumulative like % Progress.
        const cum = cumPrices ? cumPrices[phase.phaseName] : null;
        label = cum !== null && cum !== undefined ? `€${formatMoneyCompact(cum)}` : fallback;
      } else {
        const cum = cumWeights ? cumWeights[phase.phaseName] : null;
        label = cum !== null && cum !== undefined ? `${cum}%` : fallback;
      }

      // Real Dev/QA progress from Story/Testing children (actual reported
      // status/dates, not a forecast) — only meaningful next to the
      // schedule-based % or NRR, and only for the two phases that
      // actually have story/testing work under them.
      let secondary = "";
      if (boxMode === "progress" || boxMode === "nrr") {
        const realStory = phase.phaseName === "Development" ? storyMetrics?.dev.get(epic.epicKey)
          : phase.phaseName === "QA / Test" ? storyMetrics?.qa.get(epic.epicKey)
          : undefined;
        if (realStory !== undefined) {
          if (boxMode === "nrr") {
            const ownPrice = computePhasePrice(epic, phase.phaseName);
            if (ownPrice !== null) secondary = `€${formatMoneyCompact(ownPrice * (realStory.pct / 100))}`;
          } else {
            secondary = `${realStory.pct}%`;
          }
        }
      }

      // The label always sits above the box, centered on it — narrow
      // boxes (Pilot especially) never have room for text inside them.
      return `
        <div class="phase-bar ${isConflicting ? "phase-bar-conflict" : ""} ${isAnalysisDone ? "phase-bar-done" : ""}"
             data-phase-id="${esc(phase.id)}" data-row-idx="${i}"
             style="left:${left}px;top:${BAR_TOP}px;width:${width}px;height:${BAR_HEIGHT}px;background:${phase.color}"></div>
        <span class="phase-bar-label-above" style="left:${left}px;top:${BAR_TOP - (secondary ? 27 : 15)}px;color:${phase.color}">${esc(label)}${secondary ? `<span class="phase-bar-label-secondary">${esc(secondary)}</span>` : ""}</span>
      `;
    }).join("");
  }

  // Estimated delivery milestone — shown for any epic that has the field,
  // scheduled or not.
  if (!isInitiative) {
    const deliveryRaw = epic.rawData["Custom field (Estimated Delivery Date)"];
    const deliveryDate = deliveryRaw ? parseJiraDate(deliveryRaw) : null;
    if (deliveryDate) {
      const dx = dayOffset(deliveryDate);
      bars += `
        <div class="delivery-marker" data-date="${esc(formatDate(deliveryDate))}"
             style="left:${dx}px;top:${BAR_TOP + BAR_HEIGHT / 2}px"></div>
      `;
    }
  }

  return `
    <div class="tl-row ${rowMeta(row, i, inconsistencies, alerts, eddIssues).rowClass}" style="height:${ROW_HEIGHT}px">
      ${bars}
    </div>
  `;
}

function buildEpicCardHtml(epic, phase, storyMetrics) {
  const stepWeight = computePhaseWeight(epic, phase.phaseName);
  const nrr = getEpicNrr(epic);
  const workloadDays = computePhaseWorkloadDays(epic, phase.phaseName);
  const phasePrice = computePhasePrice(epic, phase.phaseName);

  const realStory = phase.phaseName === "Development" ? storyMetrics?.dev.get(epic.epicKey)
    : phase.phaseName === "QA / Test" ? storyMetrics?.qa.get(epic.epicKey)
    : undefined;
  const realNrr = realStory !== undefined && phasePrice !== null ? phasePrice * (realStory.pct / 100) : null;
  const thisMonth = computePhaseThisMonth(epic, phase, storyMetrics);

  // Only the hovered phase's dates are shown — not the full schedule.
  const short = PHASE_SHORT[phase.phaseName] || phase.phaseName;
  const phaseRows = `<div class="epic-card-phase"><span>${esc(short)}</span><b>${formatDate(phase.startDate)} → ${formatDate(phase.endDate)}</b></div>`;

  return `
    <div class="epic-card-title">${esc(epic.epicName)}</div>
    <div class="epic-card-row">
      <span>Code</span>
      <a class="epic-card-code" href="https://imawebgroup.atlassian.net/browse/${encodeURIComponent(epic.epicKey)}" target="_blank" rel="noopener noreferrer">${esc(epic.epicKey)}</a>
    </div>
    ${epic.status ? `<div class="epic-card-row"><span>Status</span><b>${esc(epic.status)}</b></div>` : ""}
    ${nrr !== null ? `<div class="epic-card-row"><span>NRR</span><b class="epic-card-nrr">€${nrr}</b></div>` : ""}
    ${workloadDays !== null ? `<div class="epic-card-row"><span>Step workload</span><b>${workloadDays} ${workloadDays === "1" ? "day" : "days"}</b></div>` : ""}
    ${phasePrice !== null ? `<div class="epic-card-row"><span>Step budget</span><b class="epic-card-nrr">€${formatMoney(phasePrice)}</b></div>` : ""}
    ${stepWeight !== null ? `<div class="epic-card-row"><span>Step weight</span><span class="epic-card-progress-pill">${stepWeight}%</span></div>` : ""}
    ${realStory !== undefined ? `<div class="epic-card-row"><span>Real progress (US)</span><b class="epic-card-secondary">${formatPoints(realStory.done)}/${formatPoints(realStory.total)} pts (${realStory.pct}%)</b></div>` : ""}
    ${realNrr !== null ? `<div class="epic-card-row"><span>Real NRR (US)</span><b class="epic-card-secondary">€${formatMoney(realNrr)}</b></div>` : ""}
    ${realStory?.timeSpentSeconds > 0 ? `<div class="epic-card-row"><span>Time spent (US)</span><b class="epic-card-secondary">${formatTimeSpent(realStory.timeSpentSeconds)}</b></div>` : ""}
    ${thisMonth ? `<div class="epic-card-divider"></div>` : ""}
    ${thisMonth?.days !== null && thisMonth ? `<div class="epic-card-row"><span>Planned this month</span><b>${thisMonth.days}d (${thisMonth.pct}%)</b></div>` : ""}
    ${thisMonth && thisMonth.days === null ? `<div class="epic-card-row"><span>Planned this month</span><b>${thisMonth.pct}%</b></div>` : ""}
    ${thisMonth ? `<div class="epic-card-row"><span>NRR this month</span><b class="epic-card-nrr">€${formatMoney(thisMonth.nrr)}</b></div>` : ""}
    ${phaseRows ? `<div class="epic-card-divider"></div>${phaseRows}` : ""}
  `;
}

function filterDropdownHtml(displayRows) {
  const fd = ui.filterDropdown;
  if (!fd) return "";
  const uniqueVals = new Set();
  for (const row of displayRows) {
    if (row.type === "initiative") continue;
    const v = getCellText(row.epic, fd.col, false);
    if (v) uniqueVals.add(v);
  }
  const sorted = [...uniqueVals].sort((a, b) => a.localeCompare(b));
  const selected = ui.colFilters[fd.col] || new Set();
  return `
    <div class="col-filter-overlay"></div>
    <div class="col-filter-dropdown" style="top:${fd.rect.bottom + 2}px;left:${fd.rect.left}px">
      <div class="col-filter-header">
        <span>Filter</span>
        ${selected.size > 0 ? '<span class="col-filter-clear">Clear</span>' : ""}
      </div>
      <div class="col-filter-options">
        ${sorted.map((val) => `
          <label class="col-filter-option">
            <input type="checkbox" data-value="${esc(val)}" ${selected.has(val) ? "checked" : ""} />
            <span>${esc(val)}</span>
          </label>
        `).join("")}
      </div>
    </div>
  `;
}

/* ---------- events ---------- */

function wireEvents(container, state, actions, ctx) {
  const { dayOffset, displayedRows, inconsistencies, alerts, eddIssues, todayX } = ctx;
  const body = container.querySelector(".gantt-body");

  const centerOnToday = () => {
    if (body) body.scrollLeft = todayX - body.clientWidth / 2;
  };

  // Toolbar
  container.querySelectorAll(".zoom-btn").forEach((btn) => {
    btn.addEventListener("click", () => { ui.zoom = btn.dataset.zoom; rerender(); });
  });
  container.querySelector(".btn-today")?.addEventListener("click", centerOnToday);
  container.querySelectorAll(".btn-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const toggle = btn.dataset.toggle;
      if (toggle === "inconsistencies") {
        ui.showInconsistencies = !ui.showInconsistencies;
        if (ui.showInconsistencies) { ui.showAlerts = false; ui.showEddIssues = false; }
      } else if (toggle === "alerts") {
        ui.showAlerts = !ui.showAlerts;
        if (ui.showAlerts) { ui.showInconsistencies = false; ui.showEddIssues = false; }
      } else {
        ui.showEddIssues = !ui.showEddIssues;
        if (ui.showEddIssues) { ui.showInconsistencies = false; ui.showAlerts = false; }
      }
      rerender();
    });
  });
  container.querySelectorAll(".legend-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const phase = btn.dataset.phase;
      const active = ui.phaseFilter === phase;
      ui.phaseFilter = active ? null : phase;
      if (!active) {
        ui.showInconsistencies = false;
        ui.showAlerts = false;
      }
      rerender();
      if (!active) {
        const newBody = container.querySelector(".gantt-body");
        if (newBody) newBody.scrollLeft = todayX - newBody.clientWidth / 2;
      }
    });
  });

  // Column headers: sort, filter dropdown, resize, autofit
  container.querySelectorAll(".grid-header-cell").forEach((cell) => {
    cell.addEventListener("click", (e) => {
      if (e.target.closest(".col-filter-btn") || e.target.closest(".resize-handle")) return;
      const col = cell.dataset.sortCol;
      if (ui.sortCol === col) {
        if (ui.sortDir === "asc") ui.sortDir = "desc";
        else { ui.sortCol = null; ui.sortDir = null; }
      } else {
        ui.sortCol = col;
        ui.sortDir = "asc";
      }
      rerender();
    });
  });
  container.querySelectorAll(".col-filter-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const col = btn.dataset.filterCol;
      if (ui.filterDropdown?.col === col) {
        ui.filterDropdown = null;
      } else {
        const r = btn.getBoundingClientRect();
        ui.filterDropdown = { col, rect: { left: r.left, bottom: r.bottom } };
      }
      rerender();
    });
  });
  container.querySelectorAll(".resize-handle").forEach((handle) => {
    const col = handle.dataset.resizeCol;
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = ui.colWidths[col];
      const onMove = (ev) => {
        const newW = Math.max(40, startW + ev.clientX - startX);
        ui.colWidths[col] = newW;
        // cheap direct-DOM update during drag; full re-render on mouseup
        container.querySelectorAll(`[data-colw="${col}"]`).forEach((el) => { el.style.width = `${newW}px`; });
        const gridW = COLS.reduce((s, c) => s + ui.colWidths[c.col], 0);
        const gh = container.querySelector(".gantt-grid-header");
        const gg = container.querySelector(".gantt-grid");
        if (gh) gh.style.width = `${gridW}px`;
        if (gg) gg.style.width = `${gridW}px`;
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        rerender();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    handle.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      autoFitColumn(col, state);
      rerender();
    });
  });
  container.querySelector(".collapse-toggle")?.addEventListener("click", () => {
    ui.gridCollapsed = !ui.gridCollapsed;
    rerender();
  });

  // Column filter dropdown
  container.querySelector(".col-filter-overlay")?.addEventListener("click", () => {
    ui.filterDropdown = null;
    rerender();
  });
  container.querySelector(".col-filter-clear")?.addEventListener("click", () => {
    delete ui.colFilters[ui.filterDropdown.col];
    ui.filterDropdown = null;
    rerender();
  });
  container.querySelectorAll(".col-filter-option input").forEach((cb) => {
    cb.addEventListener("change", () => {
      const col = ui.filterDropdown.col;
      const val = cb.dataset.value;
      const cur = new Set(ui.colFilters[col] || []);
      if (cur.has(val)) cur.delete(val);
      else cur.add(val);
      if (cur.size === 0) delete ui.colFilters[col];
      else ui.colFilters[col] = cur;
      rerender();
    });
  });

  // Delivery milestones → small date tooltip on hover
  container.querySelectorAll(".delivery-marker").forEach((marker) => {
    marker.addEventListener("mouseenter", () => {
      const rect = marker.getBoundingClientRect();
      showMarkerTooltip(rect.left + rect.width / 2, rect.top - 6, `Est. delivery: ${marker.dataset.date}`);
    });
    marker.addEventListener("mouseleave", hideTooltip);
  });

  // %  cell → month-by-month projection tooltip (never regresses below
  // the real reported % — see computeProjectedProgress). Initiative rows
  // aggregate their children epics; a plain epic row is just itself.
  container.querySelectorAll("[data-has-projection]").forEach((cell) => {
    cell.addEventListener("mouseenter", () => {
      const row = displayedRows[Number(cell.dataset.rowIdx)];
      if (!row) return;
      const forEpics = row.type === "initiative" ? (row.children || []) : [row.epic];
      const months = computeInitiativeMonthlyProjections(forEpics, row.epic.phases);
      if (months.length === 0) return;
      const rect = cell.getBoundingClientRect();
      showProjectionTooltip(rect.right + 8, rect.top + rect.height / 2, months);
    });
    cell.addEventListener("mouseleave", hideTooltip);
  });

  // Whole-month / whole-quarter header cells → NRR forecast tooltip,
  // computed from exactly the rows currently shown in the Gantt below.
  container.querySelectorAll("[data-period-start]").forEach((cell) => {
    cell.addEventListener("mouseenter", () => {
      const start = new Date(cell.dataset.periodStart);
      const end = new Date(cell.dataset.periodEnd);
      const forecast = computePeriodForecast(displayedRows, start, end, state.storyMetrics);
      const rect = cell.getBoundingClientRect();
      showMarkerTooltip(rect.left + rect.width / 2, rect.bottom + 6, `NRR forecast: €${formatMoney(forecast)}`, "below");
    });
    cell.addEventListener("mouseleave", hideTooltip);
  });

  // Phase bars → epic summary card on hover (dates shown are the hovered phase's only);
  // double-click opens that epic's ACTO directly in JIRA.
  container.querySelectorAll(".phase-bar").forEach((bar) => {
    bar.addEventListener("mouseenter", (e) => {
      const row = displayedRows[Number(bar.dataset.rowIdx)];
      if (!row) return;
      const phase = row.epic.phases.find((p) => p.id === bar.dataset.phaseId);
      if (!phase) return;
      showEpicCard(e.clientX, e.clientY, row.epic, phase, state.storyMetrics);
    });
    bar.addEventListener("mouseleave", hideEpicCard);
    bar.addEventListener("dblclick", () => {
      const row = displayedRows[Number(bar.dataset.rowIdx)];
      if (!row?.epic.epicKey) return;
      window.open(`https://imawebgroup.atlassian.net/browse/${encodeURIComponent(row.epic.epicKey)}`, "_blank", "noopener,noreferrer");
    });
  });

  // Grid rows: click scrolls to closest phase; hover shows details tooltip
  container.querySelectorAll(".grid-row").forEach((rowEl) => {
    const row = displayedRows[Number(rowEl.dataset.rowIdx)];
    if (!row) return;
    if (row.type !== "initiative") {
      rowEl.addEventListener("click", (e) => {
        if (e.target.closest(".acto-link")) return;
        scrollToClosestPhase(row.epic, body, dayOffset);
      });
    }
    if (rowEl.dataset.hasDetails) {
      let kind = null;
      let details = [];
      if (ui.showInconsistencies && inconsistencies.has(row.epic.id)) {
        kind = "danger";
        details = inconsistencies.get(row.epic.id).details;
      } else if (ui.showAlerts && alerts.has(row.epic.id)) {
        kind = "warn";
        details = alerts.get(row.epic.id).details;
      } else if (ui.showEddIssues && eddIssues.has(row.epic.id)) {
        kind = "edd";
        details = eddIssues.get(row.epic.id).details;
      }
      if (kind) {
        rowEl.addEventListener("mouseenter", () => {
          const rect = rowEl.getBoundingClientRect();
          showTooltip(rect.right + 8, rect.top + rect.height / 2, kind, details);
        });
        rowEl.addEventListener("mouseleave", hideTooltip);
      }
    }
  });

  // Scroll: sync timeline header, hide epic card, recenter initiative labels
  body?.addEventListener("scroll", () => {
    syncHeaderScroll(container, body);
    updateInitiativeLabels(container, body);
    hideEpicCard();
  });
}

function syncHeaderScroll(container, body) {
  const header = container.querySelector(".timeline-header");
  if (header) header.scrollLeft = body.scrollLeft;
}

// Initiative labels stay centered in the visible part of their bar.
function updateInitiativeLabels(container, body) {
  const scrollLeft = body.scrollLeft;
  container.querySelectorAll(".initiative-label").forEach((el) => {
    const barLeft = Number(el.dataset.barLeft);
    const barWidth = Number(el.dataset.barWidth);
    const visibleLeft = Math.max(barLeft, scrollLeft);
    const visibleRight = barLeft + barWidth;
    el.style.left = `${visibleLeft + (visibleRight - visibleLeft) / 2}px`;
  });
}

function scrollToClosestPhase(epic, body, dayOffset) {
  if (!body || epic.phases.length === 0) return;
  const today = new Date().getTime();
  let closestPhase = epic.phases[0];
  let closestDist = Infinity;
  for (const phase of epic.phases) {
    const start = phase.startDate.getTime();
    const end = phase.endDate.getTime();
    const dist = today >= start && today <= end ? 0 : Math.min(Math.abs(today - start), Math.abs(today - end));
    if (dist < closestDist) {
      closestDist = dist;
      closestPhase = phase;
    }
  }
  const phaseMiddle = dayOffset(new Date((closestPhase.startDate.getTime() + closestPhase.endDate.getTime()) / 2));
  body.scrollLeft = phaseMiddle - body.clientWidth / 2;
}

function autoFitColumn(col, state) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = col === "epicName" ? 13 : 11;
  const headerLabels = { product: "Product", acto: "ACTO", epicName: "Project Name", status: "Status", progress: "%" };
  ctx.font = `700 ${fontSize}px ${FONT}`;
  let maxW = ctx.measureText(headerLabels[col]).width;
  ctx.font = `500 ${fontSize}px ${FONT}`;
  for (const row of state.derived.displayRows) {
    const text = getCellText(row.epic, col, row.type === "initiative");
    const w = ctx.measureText(text).width;
    if (w > maxW) maxW = w;
  }
  const padding = col === "epicName" ? 36 : col === "status" ? 28 : 20;
  ui.colWidths[col] = Math.max(40, Math.ceil(maxW + padding));
}

/* ---------- tooltip (single reusable element) ---------- */

let tooltipEl = null;

const TOOLTIP_TITLES = {
  danger: "Date inconsistencies",
  warn: "Status alerts",
  edd: "EDD issues",
};

function showTooltip(x, y, kind, details) {
  hideTooltip();
  tooltipEl = document.createElement("div");
  tooltipEl.className = `gantt-tooltip gantt-tooltip-${kind}`;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
  const title = document.createElement("div");
  title.className = "gantt-tooltip-title";
  title.textContent = TOOLTIP_TITLES[kind] || "";
  tooltipEl.appendChild(title);
  for (const d of details) {
    const line = document.createElement("div");
    line.className = "gantt-tooltip-line";
    line.textContent = `• ${d}`;
    tooltipEl.appendChild(line);
  }
  document.body.appendChild(tooltipEl);
}

function showProjectionTooltip(x, y, months) {
  hideTooltip();
  tooltipEl = document.createElement("div");
  tooltipEl.className = "gantt-tooltip gantt-tooltip-projection";
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
  const title = document.createElement("div");
  title.className = "gantt-tooltip-title";
  title.textContent = "NRR projection by month";
  tooltipEl.appendChild(title);
  for (const m of months) {
    const line = document.createElement("div");
    line.className = "gantt-tooltip-line";
    line.textContent = `${m.label} : ${m.pct}% — €${formatMoney(m.reached)}`;
    tooltipEl.appendChild(line);
  }
  document.body.appendChild(tooltipEl);
}

function hideTooltip() {
  tooltipEl?.remove();
  tooltipEl = null;
}

function showMarkerTooltip(x, y, text, align = "above") {
  hideTooltip();
  tooltipEl = document.createElement("div");
  tooltipEl.className = `gantt-tooltip gantt-tooltip-marker ${align === "below" ? "gantt-tooltip-marker-below" : ""}`;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
  tooltipEl.textContent = text;
  document.body.appendChild(tooltipEl);
}

/* ---------- epic summary card (hover over a phase bar) ---------- */

let epicCardEl = null;

function showEpicCard(x, y, epic, phase, storyMetrics) {
  hideEpicCard();
  epicCardEl = document.createElement("div");
  epicCardEl.className = "epic-card";
  epicCardEl.innerHTML = buildEpicCardHtml(epic, phase, storyMetrics);
  epicCardEl.style.left = `${x}px`;
  epicCardEl.style.top = `${y - 10}px`;
  document.body.appendChild(epicCardEl);
}

function hideEpicCard() {
  epicCardEl?.remove();
  epicCardEl = null;
}
