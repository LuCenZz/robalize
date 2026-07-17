// DOM rendering + interactions for the Gantt chart.
// Port of src/components/GanttChart.tsx on top of the pure gantt-logic.js.
import {
  ZOOM_CONFIG, ROW_HEIGHT, BAR_HEIGHT, BAR_TOP, TIMELINE_MARGIN,
  detectInconsistencies, detectAlerts, computeDateRange, makeDayOffset,
  buildTimelineHeaders, computeWeekLines, getCellText, applyGanttRowFilters,
} from "./gantt-logic.js";
import { PHASE_CONFIG } from "./transform.js";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// Short labels shown inside phase bars when they are wide enough
const PHASE_SHORT = {
  "Analysis": "Analysis",
  "Development": "Dev",
  "QA / Test": "QA",
  "Customer UAT": "UAT",
  "Pilot": "Pilot",
};

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

function statusColors(status) {
  return STATUS_COLORS[status.trim().toLowerCase()] || ["#F1F0F5", "#6B7280"];
}

const ui = {
  zoom: "month",
  showInconsistencies: false,
  showAlerts: false,
  phaseFilter: null,
  gridCollapsed: false,
  sortCol: null,
  sortDir: null,
  colFilters: {},
  colWidths: { product: 100, acto: 80, epicName: 250, status: 120, progress: 50 },
  lastResetKey: 0,
  popover: null,        // {phaseId, phaseName, startDate, endDate, x, y}
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

document.addEventListener("mousedown", (e) => {
  if (ui.popover && !e.target.closest(".phase-popover")) {
    ui.popover = null;
    rerender?.();
  }
});

function esc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const formatDate = (d) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const durationDays = (start, end) => Math.round((end.getTime() - start.getTime()) / 86400000);

export function renderGantt(container, state, actions) {
  rerender = () => renderGantt(container, state, actions);

  // Reset internal filters when resetKey changes (FilterBar "Reset")
  if (state.resetKey !== ui.lastResetKey) {
    ui.lastResetKey = state.resetKey;
    ui.phaseFilter = null;
    ui.showInconsistencies = false;
    ui.showAlerts = false;
    ui.sortCol = null;
    ui.sortDir = null;
    ui.colFilters = {};
    ui.filterDropdown = null;
  }

  const { allEpicTasks, filteredEpicTasks, displayRows } = state.derived;
  const inconsistencies = detectInconsistencies(allEpicTasks);
  const alerts = detectAlerts(allEpicTasks);
  const displayedRows = applyGanttRowFilters(displayRows, {
    showInconsistencies: ui.showInconsistencies,
    showAlerts: ui.showAlerts,
    phaseFilter: ui.phaseFilter,
    colFilters: ui.colFilters,
    sortCol: ui.sortCol,
    sortDir: ui.sortDir,
    inconsistencies,
    alerts,
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
  const headerHeight = 20 * 2 + (mainHeaders.length > 0 ? 20 : 0) + (subHeaders.length > 0 ? 20 : 0) + 2;
  const rowsHeight = displayedRows.length * ROW_HEIGHT;
  const todayX = dayOffset(new Date());

  // Preserve scroll across re-renders; jump to today when zoom/data change
  const prevBody = container.querySelector(".gantt-body");
  const prevScroll = prevBody ? { left: prevBody.scrollLeft, top: prevBody.scrollTop } : null;
  const scrollKey = `${ui.zoom}|${state.rawData.length}`;

  container.innerHTML = `
    ${toolbarHtml(inconsistencies, alerts)}
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
            ${quarterHeaders.map((h) => `<div class="tl-cell tl-cell-quarter" style="left:${h.left}px;width:${h.width}px">${h.label}</div>`).join("")}
          </div>
          ${mainHeaders.length > 0 ? `<div class="tl-header-row">
            ${mainHeaders.map((h) => `<div class="tl-cell tl-cell-main" style="left:${h.left}px;width:${h.width}px">${h.label}</div>`).join("")}
          </div>` : ""}
          ${subHeaders.length > 0 ? `<div class="tl-header-row tl-header-row-last">
            ${subHeaders.map((h) => `<div class="tl-cell tl-cell-sub ${h.left <= todayX && todayX < h.left + h.width ? "tl-cell-current" : ""}" style="left:${h.left}px;width:${h.width}px">${h.label}</div>`).join("")}
          </div>` : ""}
        </div>
      </div>
    </div>
    <div class="gantt-body-wrap">
      <div class="gantt-body">
        <div class="gantt-canvas">
          ${displayedRows.length === 0 ? emptyStateHtml() : ""}
          ${ui.gridCollapsed ? "" : `
          <div class="gantt-grid" style="width:${gridTotalWidth}px">
            ${displayedRows.map((row, i) => gridRowHtml(row, i, inconsistencies, alerts)).join("")}
          </div>`}
          <div class="gantt-timeline" style="width:${totalWidth + TIMELINE_MARGIN * 2}px">
            ${todayX >= 0 && todayX <= totalWidth ? `
              <div class="today-line" style="left:${todayX}px;height:${rowsHeight}px"><div class="today-dot"></div></div>` : ""}
            ${weekLines.map((x) => `<div class="week-line" style="left:${x}px;height:${rowsHeight}px"></div>`).join("")}
            ${displayedRows.map((row, i) => timelineRowHtml(row, i, dayOffset, config, inconsistencies, alerts)).join("")}
          </div>
        </div>
      </div>
    </div>
    ${popoverHtml()}
    ${filterDropdownHtml(displayRows)}
  `;

  wireEvents(container, state, actions, {
    dayOffset, displayedRows, inconsistencies, alerts, todayX, config,
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
  }
}

/* ---------- HTML builders ---------- */

function toolbarHtml(inconsistencies, alerts) {
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

function emptyStateHtml() {
  const icon = ui.showInconsistencies ? "⚠" : ui.showAlerts ? "🔔" : "📋";
  const detail = ui.showInconsistencies
    ? "No date inconsistencies found in the current filtered view."
    : ui.showAlerts
      ? "No status alerts found in the current filtered view."
      : "No projects match the current filters.";
  return `
    <div class="gantt-empty">
      <div class="gantt-empty-icon">${icon}</div>
      <div class="gantt-empty-title">No results</div>
      <div class="gantt-empty-detail">${detail}</div>
    </div>
  `;
}

function rowMeta(row, i, inconsistencies, alerts) {
  const epic = row.epic;
  const isInitiative = row.type === "initiative";
  const isInconsistent = ui.showInconsistencies && inconsistencies.has(epic.id);
  const isAlerted = ui.showAlerts && alerts.has(epic.id);
  const isHighlighted = isInconsistent || isAlerted;
  return {
    epic, isInitiative, isInconsistent, isAlerted, isHighlighted,
    highlightColor: isInconsistent ? "#e03131" : "#e67700",
    rowClass: [
      isInitiative ? "row-initiative" : "",
      isHighlighted ? (isInconsistent ? "row-inconsistent" : "row-alerted") : "",
    ].filter(Boolean).join(" "),
  };
}

function gridRowHtml(row, i, inconsistencies, alerts) {
  const { epic, isInitiative, isInconsistent, isAlerted, isHighlighted, highlightColor } =
    rowMeta(row, i, inconsistencies, alerts);
  const product = epic.rawData["Custom field (Product)"] || "";
  const progressRaw = epic.rawData["Custom field (% of progress)"];
  let progress = "";
  if (progressRaw && progressRaw.trim()) {
    const val = Math.round(parseFloat(progressRaw));
    if (!isNaN(val)) progress = `${val}%`;
  }
  const hasDetails = (isInconsistent || isAlerted);
  return `
    <div class="grid-row ${rowMeta(row, i, inconsistencies, alerts).rowClass}"
         data-row-idx="${i}" ${hasDetails ? `data-has-details="1"` : ""}
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
      <div class="grid-cell grid-cell-progress" data-colw="progress" style="width:${ui.colWidths.progress}px">
        ${progress}
      </div>
    </div>
  `;
}

function timelineRowHtml(row, i, dayOffset, config, inconsistencies, alerts) {
  const { epic, isInitiative, isInconsistent } = rowMeta(row, i, inconsistencies, alerts);
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
        <div class="initiative-bar" style="left:${minLeft}px;top:26px;width:${w}px"></div>
        <div class="initiative-label" data-bar-left="${minLeft}" data-bar-width="${w}"
             style="left:${minLeft + w / 2}px;top:6px;height:14px">
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
    bars += epic.phases.map((phase) => {
      const left = dayOffset(phase.startDate);
      const width = dayOffset(phase.endDate) - left + config.dayWidth;
      if (width <= 0) return "";
      const isConflicting = info?.conflictingPhases.has(phase.phaseName);
      const isSelected = ui.popover?.phaseId === phase.id;
      const short = PHASE_SHORT[phase.phaseName] || phase.phaseName;
      const showLabel = width >= short.length * 6.5 + 14;
      return `
        <div class="phase-bar ${isConflicting ? "phase-bar-conflict" : ""} ${isSelected ? "phase-bar-selected" : ""}"
             data-phase-id="${esc(phase.id)}" data-row-idx="${i}"
             style="left:${left}px;top:${BAR_TOP}px;width:${width}px;height:${BAR_HEIGHT}px;background:${phase.color}">
          ${showLabel ? `<span class="phase-bar-label">${esc(short)}</span>` : ""}
        </div>
      `;
    }).join("");
  }

  return `
    <div class="tl-row ${rowMeta(row, i, inconsistencies, alerts).rowClass}" style="height:${ROW_HEIGHT}px">
      ${bars}
    </div>
  `;
}

function popoverHtml() {
  const p = ui.popover;
  if (!p) return "";
  const name = p.phaseName === "QA / Test" ? "QA" : p.phaseName;
  return `
    <div class="phase-popover" style="left:${p.x}px;top:${p.y - 8}px">
      <div class="phase-popover-arrow"></div>
      <div class="phase-popover-title">${esc(name)}</div>
      <div class="phase-popover-line"><span>Start</span><b>${formatDate(p.startDate)}</b></div>
      <div class="phase-popover-line"><span>End</span><b>${formatDate(p.endDate)}</b></div>
      <div class="phase-popover-line phase-popover-duration"><span>Duration</span><b>${durationDays(p.startDate, p.endDate)} days</b></div>
    </div>
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
  const { dayOffset, displayedRows, inconsistencies, alerts, todayX } = ctx;
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
      if (btn.dataset.toggle === "inconsistencies") {
        ui.showInconsistencies = !ui.showInconsistencies;
        if (ui.showInconsistencies) ui.showAlerts = false;
      } else {
        ui.showAlerts = !ui.showAlerts;
        if (ui.showAlerts) ui.showInconsistencies = false;
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

  // Phase bars → popover
  container.querySelectorAll(".phase-bar").forEach((bar) => {
    bar.addEventListener("click", (e) => {
      e.stopPropagation();
      const row = displayedRows[Number(bar.dataset.rowIdx)];
      const phase = row.epic.phases.find((p) => p.id === bar.dataset.phaseId);
      if (!phase) return;
      ui.popover = ui.popover?.phaseId === phase.id ? null : {
        phaseId: phase.id,
        phaseName: phase.phaseName,
        startDate: phase.startDate,
        endDate: phase.endDate,
        x: e.clientX,
        y: e.clientY - 10,
      };
      rerender();
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
      const info = inconsistencies.get(row.epic.id);
      const alertInfo = alerts.get(row.epic.id);
      const isInconsistent = ui.showInconsistencies && !!info;
      const details = (isInconsistent ? info?.details : alertInfo?.details) || [];
      rowEl.addEventListener("mouseenter", () => {
        const rect = rowEl.getBoundingClientRect();
        showTooltip(rect.right + 8, rect.top + rect.height / 2, isInconsistent, details);
      });
      rowEl.addEventListener("mouseleave", hideTooltip);
    }
  });

  // Scroll: sync timeline header, close popover, recenter initiative labels
  body?.addEventListener("scroll", () => {
    syncHeaderScroll(container, body);
    updateInitiativeLabels(container, body);
    if (ui.popover) {
      ui.popover = null;
      container.querySelector(".phase-popover")?.remove();
      container.querySelectorAll(".phase-bar-selected").forEach((el) => el.classList.remove("phase-bar-selected"));
    }
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

function showTooltip(x, y, isInconsistent, details) {
  hideTooltip();
  tooltipEl = document.createElement("div");
  tooltipEl.className = `gantt-tooltip ${isInconsistent ? "gantt-tooltip-danger" : "gantt-tooltip-warn"}`;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
  const title = document.createElement("div");
  title.className = "gantt-tooltip-title";
  title.textContent = isInconsistent ? "Date inconsistencies" : "Status alerts";
  tooltipEl.appendChild(title);
  for (const d of details) {
    const line = document.createElement("div");
    line.className = "gantt-tooltip-line";
    line.textContent = `• ${d}`;
    tooltipEl.appendChild(line);
  }
  document.body.appendChild(tooltipEl);
}

function hideTooltip() {
  tooltipEl?.remove();
  tooltipEl = null;
}
