// "Forecast Detail" table: a portfolio-level view — one row per initiative
// (a standalone epic with no parent initiative counts as its own
// single-epic group) — with monthly % completion and NRR-to-recognize
// columns, replacing the Gantt timeline in the same content area. Reuses
// the exact same pure logic as the Gantt (computeProjectedProgress,
// computePeriodForecast, computePhasePriceCumulative) — no separate
// calculation model, just a different presentation of the same numbers.
import {
  computeProjectedProgress, computePeriodForecast, computePhasePriceCumulative, getDisplayProgress,
} from "./gantt-logic.js";
import { statusColors } from "./gantt.js";

// Cap on how many month columns render — a portfolio with a multi-year
// tail shouldn't produce hundreds of columns.
const MONTHS_CAP = 18;

// The 8 sticky (Status..Remaining Backlog) column widths, in <colgroup>
// order — also the running total used for their `left` offsets in CSS.
const STICKY_COL_WIDTHS = [44, 110, 280, 110, 90, 140, 120, 150];
const STICKY_TOTAL_WIDTH = STICKY_COL_WIDTHS.reduce((a, b) => a + b, 0);
const MONTH_COL_WIDTH = 76;

function esc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatK(val) {
  return Math.round(val / 1000).toLocaleString("en-GB") + "K";
}

function monthLabel(d) {
  return d.toLocaleDateString("en-GB", { month: "short" }) + " " + d.getFullYear();
}

// Stable identity for a month across re-renders (the chart/table
// recomputes its month range from scratch every time, so an index isn't
// safe to persist in state — a "YYYY-M" key is).
function monthKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

// A row's own epics: an initiative's children, or just itself for a
// standalone epic — everything downstream (totals, % completion,
// forecast) is computed the same way over this list either way.
function epicsForRow(row) {
  return row.type === "initiative" ? row.children : [row.epic];
}

// Every month from the current one through the month the latest currently
// visible epic's last phase ends in.
function computeMonthRange(epics) {
  const now = new Date();
  let maxEndTime = null;
  for (const epic of epics) {
    for (const phase of epic.phases) {
      if (maxEndTime === null || phase.endDate.getTime() > maxEndTime) maxEndTime = phase.endDate.getTime();
    }
  }
  if (maxEndTime === null) return [];
  const horizon = new Date(new Date(maxEndTime).getFullYear(), new Date(maxEndTime).getMonth(), 1);

  const months = [];
  let cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cursor <= horizon && months.length < MONTHS_CAP) {
    months.push(new Date(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months;
}

// Simple magnitude heatmap, matching the reference: red under a third,
// amber in the middle, green once it's mostly there.
function pctColor(pct) {
  if (pct >= 80) return "#1B9E5A";
  if (pct >= 30) return "#D9822B";
  return "#D6483F";
}

// Sum of each epic's own Budget Price total, and of that total weighted
// by its own display %, across a row's epics — same sum-then-divide
// pattern as the Gantt's initiative row (computeInitiativeNrr).
function computeRowTotals(epics) {
  let total = 0;
  let reached = 0;
  let any = false;
  for (const epic of epics) {
    const cumPrices = computePhasePriceCumulative(epic);
    const epicTotal = cumPrices ? cumPrices["Pilot"] : null;
    const pct = getDisplayProgress(epic);
    if (!epicTotal || pct === null) continue;
    total += epicTotal;
    reached += epicTotal * (pct / 100);
    any = true;
  }
  return any ? { total, reached } : { total: null, reached: null };
}

// Same weighted-by-budget aggregate as the Gantt's initiative projection
// tooltip (computeInitiativeProjection), reused here per month column.
function computeRowMonthlyPct(epics, monthEnd) {
  let total = 0;
  let reached = 0;
  let any = false;
  for (const epic of epics) {
    const pct = computeProjectedProgress(epic, monthEnd);
    const cumPrices = computePhasePriceCumulative(epic);
    const epicTotal = cumPrices ? cumPrices["Pilot"] : null;
    if (pct === null || !epicTotal) continue;
    total += epicTotal;
    reached += epicTotal * (pct / 100);
    any = true;
  }
  return any && total > 0 ? Math.round((reached / total) * 100) : null;
}

// Everything downstream (summary cards + detail rows) reads from this —
// computed once per row so the two never disagree with each other.
function computeRowData(row, pctMonths, nrrMonths) {
  const epics = epicsForRow(row);
  const { total, reached } = computeRowTotals(epics);
  const remaining = total !== null && reached !== null ? total - reached : null;

  const pctCells = pctMonths.map((m) => {
    const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    return computeRowMonthlyPct(epics, monthEnd);
  });
  const nrrCells = nrrMonths.map((m) => {
    const monthStart = new Date(m.getFullYear(), m.getMonth(), 1);
    const monthEndExclusive = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    return computePeriodForecast(epics.map((e) => ({ type: "epic", epic: e })), monthStart, monthEndExclusive);
  });

  return { row, epics, total, reached, remaining, pctCells, nrrCells };
}

function summaryCardsHtml(rowsData) {
  let totalOrderValue = 0;
  let totalReached = 0;
  let totalRemaining = 0;
  for (const d of rowsData) {
    if (d.total !== null) totalOrderValue += d.total;
    if (d.reached !== null) totalReached += d.reached;
    if (d.remaining !== null) totalRemaining += d.remaining;
  }
  const overallPct = totalOrderValue > 0 ? Math.round((totalReached / totalOrderValue) * 100) : null;
  const asOf = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const cards = [
    { label: "Projects", value: String(rowsData.length) },
    { label: "Order Value", value: totalOrderValue > 0 ? formatK(totalOrderValue) : "—" },
    { label: "Remaining Backlog", value: totalOrderValue > 0 ? formatK(totalRemaining) : "—" },
    { label: "Overall Completion", value: overallPct !== null ? overallPct + "%" : "—" },
  ];

  return `
    <div class="forecast-summary-wrap">
      <div class="forecast-summary-asof">Snapshot as of ${asOf} — figures below are today's actuals, not a projection</div>
      <div class="forecast-summary">
        ${cards.map((c) => `
          <div class="forecast-summary-card">
            <div class="forecast-summary-value">${c.value}</div>
            <div class="forecast-summary-label">${esc(c.label)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// Portfolio-wide aggregate per month column — shared by the pinned Total
// row and the summary chart, so the two never disagree.
function computePortfolioMonthlyTotals(rowsData, pctMonths, nrrMonths) {
  const pctTotals = pctMonths.map((_, i) => {
    let mTotal = 0;
    let mReached = 0;
    for (const d of rowsData) {
      const pct = d.pctCells[i];
      if (pct === null || d.total === null) continue;
      mTotal += d.total;
      mReached += d.total * (pct / 100);
    }
    return mTotal > 0 ? Math.round((mReached / mTotal) * 100) : null;
  });
  const nrrTotals = nrrMonths.map((_, i) => {
    let sum = 0;
    for (const d of rowsData) sum += d.nrrCells[i] || 0;
    return sum;
  });
  return { pctTotals, nrrTotals };
}

// The pinned "Total" row: same month columns as the detail rows, but
// aggregated across the whole filtered portfolio — the direct answer to
// "how much backlog, how much NRR forecast, by month".
function totalRowHtml(rowsData, pctMonths, nrrMonths, pctTotals, nrrTotals) {
  let total = 0;
  let reached = 0;
  for (const d of rowsData) {
    if (d.total !== null) total += d.total;
    if (d.reached !== null) reached += d.reached;
  }
  const remaining = total - reached;

  // No colspan here: it would shift every DOM cell after it out of step
  // with the header's nth-child column indexing (that's what the
  // left-offset measurement below relies on).
  return `
    <tr class="forecast-total-row">
      <td class="forecast-td-sticky">Total</td>
      <td class="forecast-td-sticky"></td>
      <td class="forecast-td-sticky forecast-td-name"></td>
      <td class="forecast-td-sticky"></td>
      <td class="forecast-td-sticky"></td>
      <td class="forecast-td-sticky"></td>
      <td class="forecast-td-sticky forecast-td-num">${total > 0 ? formatK(total) : "—"}</td>
      <td class="forecast-td-sticky forecast-td-num">${total > 0 ? formatK(remaining) : "—"}</td>
      ${pctTotals.map((pct, i) => `<td class="forecast-td-month forecast-td-pct ${i === 0 ? "forecast-td-current" : ""}" ${pct !== null && i > 0 ? `style="color:${pctColor(pct)}"` : ""}>${pct !== null ? pct + "%" : "—"}</td>`).join("")}
      ${nrrTotals.map((val) => `<td class="forecast-td-month forecast-td-nrr">${val > 0 ? formatK(val) : "—"}</td>`).join("")}
    </tr>
  `;
}

// Bar chart (monthly NRR forecast, €) with an overlaid line (cumulative %
// completion) — same numbers as the Total row, just visual. Plain inline
// SVG at native pixel size (no CSS/viewBox stretching — that distorts
// text), scrolling horizontally if there are many months. The line and
// bars are drawn in separate vertical bands so a tall bar and a high %
// don't fight for the same space and collide.
function forecastChartHtml(pctMonths, nrrMonths, pctTotals, nrrTotals, activeMonthKey) {
  if (nrrMonths.length === 0) return "";

  const colW = 72;
  const width = nrrMonths.length * colW;
  const height = 190;
  const padTop = 14;
  const padBottom = 26;
  const plotH = height - padTop - padBottom;
  // Line band: top 38% of the plot. Bar band: remaining space below it,
  // with a gap so labels never touch.
  const lineBandH = plotH * 0.38;
  const barBandTop = padTop + lineBandH + 14;
  const barBandH = height - padBottom - barBandTop;
  const maxNrr = Math.max(1, ...nrrTotals);

  const bars = nrrTotals.map((val, i) => {
    const key = monthKey(nrrMonths[i]);
    const isActive = key === activeMonthKey;
    const kVal = Math.round(val / 1000);
    const barH = (val / maxNrr) * barBandH;
    const x = i * colW + colW * 0.22;
    const barW = colW * 0.56;
    const y = barBandTop + (barBandH - barH);
    // A transparent hit-rect spans the whole column (not just the visible
    // bar) so a near-zero bar is still easy to click.
    return `<rect class="forecast-bar-hit" data-month-key="${key}" x="${(i * colW).toFixed(1)}" y="${padTop}" width="${colW}" height="${(height - padBottom - padTop).toFixed(1)}" fill="transparent"></rect>
            <rect class="forecast-bar" data-month-key="${key}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(barH, 1).toFixed(1)}" rx="2" fill="${isActive ? "#3D2B7D" : "#5B3FA6"}"></rect>
            ${kVal > 0 ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="#4C2E8F" font-weight="700">${kVal}K</text>` : ""}`;
  }).join("");

  // The % line uses pctTotals offset by one (pctMonths includes the
  // current/actual month that nrrMonths doesn't) so it lines up with the
  // same set of future months as the bars.
  const linePct = pctTotals.slice(1);
  const points = linePct.map((pct, i) => {
    const x = i * colW + colW / 2;
    const y = padTop + lineBandH - ((pct ?? 0) / 100) * lineBandH;
    return { x, y, pct };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  // Only label a point when it's the first, the last, or its value
  // differs from the last *labeled* one — a flat run of "86% 86% 86%..."
  // just overlaps itself otherwise.
  let lastLabeled = null;
  const dots = points.map((p, i) => {
    const isEndpoint = i === 0 || i === points.length - 1;
    const changed = p.pct !== null && p.pct !== lastLabeled;
    const showLabel = p.pct !== null && (isEndpoint || changed);
    if (showLabel) lastLabeled = p.pct;
    return `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="#12776F"></circle>
      ${showLabel ? `<text x="${p.x.toFixed(1)}" y="${(p.y - 7).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="#12776F" font-weight="700">${p.pct}%</text>` : ""}
    `;
  }).join("");

  const labels = nrrMonths.map((m, i) => `
    <text x="${(i * colW + colW / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="9.5" fill="#8B89A8">${monthLabel(m)}</text>
  `).join("");

  return `
    <div class="forecast-chart-wrap">
      <div class="forecast-chart-title">
        Monthly forecast <span class="forecast-chart-legend"><span class="forecast-chart-swatch forecast-chart-swatch-nrr"></span>NRR forecast (K€)</span>
        <span class="forecast-chart-legend"><span class="forecast-chart-swatch forecast-chart-swatch-pct"></span>Cumulative % completion</span>
      </div>
      <div class="forecast-chart-scroll">
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="forecast-chart-svg">
          <path d="${path}" fill="none" stroke="#12776F" stroke-width="2"></path>
          ${dots}
          ${bars}
          ${labels}
        </svg>
      </div>
    </div>
  `;
}

export function renderForecastTable(container, state, actions) {
  const rows = state.derived.displayRows.filter(
    (r) => r.type === "initiative" || (r.type === "epic" && !r.initiativeKey)
  );
  const allEpics = rows.flatMap(epicsForRow);
  // % Completion includes the current month (shown as "actual", not
  // projected). Forecast (K€) only makes sense for months still ahead —
  // it starts one month later, same as the reference.
  const pctMonths = computeMonthRange(allEpics);
  const nrrMonths = pctMonths.slice(1);
  const rowsData = rows.map((row) => computeRowData(row, pctMonths, nrrMonths));
  const { pctTotals, nrrTotals } = computePortfolioMonthlyTotals(rowsData, pctMonths, nrrMonths);

  // Clicking a chart bar filters the detail rows below to just the
  // projects that contributed to that month's forecast — the Total row,
  // cards and chart itself stay showing the whole portfolio, since those
  // are the aggregate the filter is drilling into.
  const activeMonthKey = state.forecastMonthFilter || null;
  const activeMonthIndex = activeMonthKey ? nrrMonths.findIndex((m) => monthKey(m) === activeMonthKey) : -1;
  const visibleRowsData = activeMonthIndex >= 0
    ? rowsData.filter((d) => (d.nrrCells[activeMonthIndex] || 0) > 0)
    : rowsData;

  container.innerHTML = `
    <div class="forecast-wrap">
      <div class="forecast-header">
        <span class="forecast-title">Forecast Detail</span>
        <span class="forecast-count">${rows.length} projects</span>
        ${rows.length > 0 ? `
          <div class="forecast-scroll-btns">
            <button id="forecast-scroll-left" class="forecast-scroll-btn" aria-label="Scroll table left">‹</button>
            <button id="forecast-scroll-right" class="forecast-scroll-btn" aria-label="Scroll table right">›</button>
          </div>
        ` : ""}
      </div>
      ${rows.length > 0 ? summaryCardsHtml(rowsData) : ""}
      ${rows.length > 0 ? forecastChartHtml(pctMonths, nrrMonths, pctTotals, nrrTotals, activeMonthKey) : ""}
      ${activeMonthIndex >= 0 ? `
        <div class="forecast-filter-banner">
          Showing <strong>${visibleRowsData.length}</strong> project${visibleRowsData.length === 1 ? "" : "s"} contributing to the <strong>${esc(monthLabel(nrrMonths[activeMonthIndex]))}</strong> forecast
          <button class="forecast-filter-clear" id="forecast-filter-clear">Clear filter</button>
        </div>
      ` : ""}
      <div class="forecast-table-scroll" tabindex="0">
        <table class="forecast-table" style="width:${STICKY_TOTAL_WIDTH + (pctMonths.length + nrrMonths.length) * MONTH_COL_WIDTH}px">
          <colgroup>
            ${STICKY_COL_WIDTHS.map((w) => `<col style="width:${w}px">`).join("")}
            ${pctMonths.map(() => `<col style="width:${MONTH_COL_WIDTH}px">`).join("")}
            ${nrrMonths.map(() => `<col style="width:${MONTH_COL_WIDTH}px">`).join("")}
          </colgroup>
          <thead>
            <tr>
              <th class="forecast-th-sticky" rowspan="2">Status</th>
              <th class="forecast-th-sticky" rowspan="2">JIRA ID</th>
              <th class="forecast-th-sticky forecast-th-name" rowspan="2">Project Name</th>
              <th class="forecast-th-sticky" rowspan="2">Brand</th>
              <th class="forecast-th-sticky" rowspan="2">Product</th>
              <th class="forecast-th-sticky" rowspan="2">PMO</th>
              <th class="forecast-th-sticky forecast-th-num" rowspan="2">Order Value (K€)</th>
              <th class="forecast-th-sticky forecast-th-num" rowspan="2">Remaining Backlog (K€)</th>
              ${pctMonths.length > 0 ? `<th class="forecast-group forecast-group-pct" colspan="${pctMonths.length}">% Completion</th>` : ""}
              ${nrrMonths.length > 0 ? `<th class="forecast-group forecast-group-nrr" colspan="${nrrMonths.length}">Forecast (K€)</th>` : ""}
            </tr>
            <tr>
              ${pctMonths.map((m, i) => `<th class="forecast-th-month forecast-th-pct ${i === 0 ? "forecast-th-current" : ""}">${monthLabel(m)}</th>`).join("")}
              ${nrrMonths.map((m) => `<th class="forecast-th-month forecast-th-nrr">${monthLabel(m)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.length > 0 ? totalRowHtml(rowsData, pctMonths, nrrMonths, pctTotals, nrrTotals) : ""}
            ${visibleRowsData.map((d) => forecastRowHtml(d)).join("")}
          </tbody>
        </table>
        ${rows.length === 0 ? '<div class="forecast-empty">No projects match the current filters.</div>' : ""}
        ${rows.length > 0 && visibleRowsData.length === 0 ? '<div class="forecast-empty">No projects contributed to this month.</div>' : ""}
      </div>
    </div>
  `;

  // Trackpad horizontal swipes are frequently a little diagonal. When this
  // box has nothing to scroll vertically (few rows — e.g. filtered down to
  // one project), a gesture with any vertical component gets silently
  // swallowed instead of scrolling sideways, since there's no vertical
  // overflow for it to act on. Redirect that vertical delta to horizontal
  // scroll — but only when there's genuinely no vertical content to scroll;
  // otherwise a normal "scroll down the row list" gesture would get hijacked
  // into a horizontal scroll instead.
  const tableScroll = container.querySelector(".forecast-table-scroll");
  if (tableScroll) {
    tableScroll.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (tableScroll.scrollHeight > tableScroll.clientHeight) return;
      if (tableScroll.scrollWidth <= tableScroll.clientWidth) return;
      tableScroll.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }

  container.querySelectorAll(".forecast-bar, .forecast-bar-hit").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.monthKey;
      actions.setForecastMonthFilter(key === activeMonthKey ? null : key);
    });
  });
  container.querySelector("#forecast-filter-clear")?.addEventListener("click", () => {
    actions.setForecastMonthFilter(null);
  });

  // Native scrollbar visibility for a horizontal-only overflow region turns
  // out to depend on the OS/browser's own scrollbar settings in ways that
  // aren't reliably overridable from CSS (an overlay-scrollbar OS setting
  // can still hide it in some browsers even with ::-webkit-scrollbar
  // styling) — these buttons are a scroll affordance that always renders,
  // independent of any of that.
  //
  // The target is rounded to the nearest month-column boundary ourselves
  // (rather than trusting CSS scroll-snap to correct a plain scrollBy)
  // because relying on the browser's post-scroll snap correction landed
  // mid-column in testing — the month columns are 76px each (the
  // <colgroup> above), and any position that isn't a multiple of that
  // slices a header/cell label in half behind the sticky columns.
  function scrollByColumns(direction) {
    if (!tableScroll) return;
    const target = tableScroll.scrollLeft + direction * MONTH_COL_WIDTH * 3;
    const maxScroll = tableScroll.scrollWidth - tableScroll.clientWidth;
    const snapped = Math.max(0, Math.min(maxScroll, Math.round(target / MONTH_COL_WIDTH) * MONTH_COL_WIDTH));
    tableScroll.scrollTo({ left: snapped, behavior: "smooth" });
  }
  container.querySelector("#forecast-scroll-left")?.addEventListener("click", () => scrollByColumns(-1));
  container.querySelector("#forecast-scroll-right")?.addEventListener("click", () => scrollByColumns(1));

  // The sticky offsets below need to match the *real* rendered header
  // height exactly, or the sticky row and the header (or the row right
  // under it) briefly overlap while scrolling. Font metrics make that
  // height a few px off from any hardcoded guess, so it's measured here
  // instead — getBoundingClientRect() forces the layout that's needed
  // for the numbers to be right immediately after innerHTML is set.
  const theadRows = container.querySelectorAll(".forecast-table thead tr");
  if (theadRows.length === 2) {
    const row1H = theadRows[0].getBoundingClientRect().height;
    const totalH = row1H + theadRows[1].getBoundingClientRect().height;
    container.querySelectorAll(".forecast-th-month").forEach((th) => { th.style.top = `${row1H}px`; });
    container.querySelectorAll(".forecast-total-row td").forEach((td) => { td.style.top = `${totalH}px`; });
  }

  // Horizontal left offsets no longer need measuring: the <colgroup> +
  // table-layout:fixed below force every column to its declared width on
  // every row regardless of content, so the static CSS `left` values
  // (which add up to those same declared widths) are now reliable.
}

function forecastRowHtml({ row, total, reached, remaining, pctCells, nrrCells }) {
  const epic = row.epic; // initiative's own synthetic epic, or the standalone epic itself
  const [, fg] = statusColors(epic.status || "");
  const brand = epic.rawData["Custom field (Client)"] || "—";
  const product = epic.rawData["Custom field (Product)"] || "—";
  const pmo = epic.rawData["Custom field (Project Manager)"] || "—";

  return `
    <tr>
      <td class="forecast-td-sticky"><span class="forecast-status-dot" style="background:${fg}" title="${esc(epic.status || "")}"></span></td>
      <td class="forecast-td-sticky">
        <a href="https://imawebgroup.atlassian.net/browse/${encodeURIComponent(epic.epicKey)}" target="_blank" rel="noopener noreferrer">${esc(epic.epicKey)}</a>
      </td>
      <td class="forecast-td-sticky forecast-td-name" title="${esc(epic.epicName)}">${esc(epic.epicName)}</td>
      <td class="forecast-td-sticky">${esc(brand)}</td>
      <td class="forecast-td-sticky">${esc(product)}</td>
      <td class="forecast-td-sticky">${esc(pmo)}</td>
      <td class="forecast-td-sticky forecast-td-num">${total !== null ? formatK(total) : "—"}</td>
      <td class="forecast-td-sticky forecast-td-num">${remaining !== null ? formatK(remaining) : "—"}</td>
      ${pctCells.map((pct, i) => `<td class="forecast-td-month forecast-td-pct ${i === 0 ? "forecast-td-current" : ""}" ${pct !== null && i > 0 ? `style="color:${pctColor(pct)}"` : ""}>${pct !== null ? pct + "%" : "—"}</td>`).join("")}
      ${nrrCells.map((val) => `<td class="forecast-td-month forecast-td-nrr">${val > 0 ? formatK(val) : "—"}</td>`).join("")}
    </tr>
  `;
}
