import { transformToEpicTasks, buildDisplayRows, extractColumns } from "./transform.js";
import { applyFilters, computeFilteredKeys, computeDisplayRows } from "./filters.js";
import { loadJiraConfig, fetchJiraData, resolveJiraConfig } from "./jira.js";
import { computeStoryMetrics } from "./gantt-logic.js";
import { loadFilters, saveFilters, loadSearchTerm, saveSearchTerm } from "./prefs.js";
import { renderTopBar } from "./topbar.js";
import { renderFilterBar, PROJECT_COLUMN } from "./filterbar.js";
import { renderGantt } from "./gantt.js";
import { renderForecastTable } from "./forecast.js";
import { openConnector } from "./connector.js";
import { toggleAiPanel } from "./ai.js";

const CACHE_KEY = "oem-session-data";

export const state = {
  rawData: [],
  columns: [],
  activeFilters: [],
  searchTerm: "",
  jiraConnected: false,
  refreshing: false,
  resetKey: 0,
  // What the phase-box label above each bar shows: cumulative weight %,
  // the phase's own budgeted workload in days, or the epic's NRR amount.
  boxMode: "progress",
  // "gantt" (the planning/timeline view) or "forecast" (the monthly
  // % completion / NRR-to-recognize table).
  viewMode: "gantt",
  // "YYYY-M" key of the month bar clicked in the Forecast Detail chart, or
  // null — filters that table's rows to projects contributing to that
  // month's forecast. Chart/cards/Total row stay unfiltered (the
  // portfolio aggregate being drilled into).
  forecastMonthFilter: null,
  // Row key (initiativeKey or epicKey) to scroll to next time the Gantt
  // renders — set by double-clicking a Forecast row, consumed and cleared
  // by renderGantt once it's acted on.
  focusRowKey: null,
  // Sort column/direction for the Forecast Detail table — col is a sticky
  // column name ("name"/"orderValue"/"remaining") or "pct:<i>"/"nrr:<i>"
  // for a specific month column; null col means unsorted (original order).
  forecastSort: { col: null, dir: null },
  // When true, the Forecast Detail page hides the summary cards + monthly
  // chart so the project table below can use the freed vertical space.
  forecastDetailCollapsed: false,
  // Real Dev/QA completion %, keyed by epic key — from Story/Testing
  // Story Points, fetched independently of the main epic data (see
  // refreshStoryMetrics below).
  storyMetrics: { dev: new Map(), qa: new Map() },
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
  const gantt = document.getElementById("gantt");
  gantt.classList.toggle("hidden", state.rawData.length === 0);
  if (state.rawData.length > 0) {
    if (state.viewMode === "forecast") {
      renderForecastTable(gantt, state, actions);
    } else {
      renderGantt(gantt, state, actions);
    }
  }
  renderRefreshOverlay();
}

// Built once per refresh cycle (not on every re-render) so its CSS
// animations don't restart from unrelated state changes while it's showing.
function renderRefreshOverlay() {
  const overlay = document.getElementById("refresh-overlay");
  if (!state.refreshing) {
    overlay.classList.add("hidden");
    return;
  }
  if (overlay.classList.contains("hidden")) {
    overlay.innerHTML = `
      <div class="refresh-overlay-content">
        <div class="brand-lines brand-lines-loading brand-lines-xl"><i></i><i></i><i></i></div>
        <div class="brand-name-xl">rob<span>a</span>l<span>i</span>ze</div>
        <div class="refresh-overlay-label">Syncing with JIRA<span class="loading-dots"></span></div>
      </div>
    `;
    overlay.classList.remove("hidden");
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
    refreshTimer = setInterval(() => {
      actions.refreshFromJira(true);
    }, config.refreshInterval * 1000);
  }
}

// Independent background fetch (Story/Testing issues) powering the real
// Dev/QA forecast shown next to the schedule-based one. Scoped to exactly
// the epics just loaded (parent in (...)) rather than the whole project —
// the project has 8000+ Story/Testing issues total, way past any sane
// row cap, but each epic only has a handful of children. Best-effort:
// failures are silent so they never disrupt the main Gantt or show a
// false error banner.
//
// Fetched in batches of STORY_BATCH_SIZE epic keys per JQL: with 300+
// epics loaded, a single "parent in (...)" clause plus JIRA's own
// nextPageToken (which re-encodes the whole JQL again on later pages)
// can push the request URL past JIRA's edge length limit (414). Small
// batches keep every request comfortably short.
const STORY_BATCH_SIZE = 40;

async function refreshStoryMetrics(epicRows) {
  const keys = [...new Set(epicRows.map((r) => r["Issue key"]).filter(Boolean))];
  if (keys.length === 0) return;
  const batches = [];
  for (let i = 0; i < keys.length; i += STORY_BATCH_SIZE) {
    batches.push(keys.slice(i, i + STORY_BATCH_SIZE));
  }
  // allSettled, not all: with 300+ epics this is 8+ parallel requests, and
  // Promise.all's all-or-nothing failure meant one flaky batch discarded
  // every OTHER batch's already-fetched rows too — silently blanking real
  // Dev/QA % for the entire portfolio, not just the epics in the batch
  // that actually failed. Logged (not swallowed) so a partial failure is
  // at least visible in the console instead of just quietly under-forecasting.
  const settled = await Promise.allSettled(batches.map((batch) => {
    const jql = `project = ACTO AND type in (Story, Testing) AND parent in (${batch.join(",")})`;
    return fetchJiraData({ email: "", apiToken: "", jql, maxRows: 5000 });
  }));
  const rows = [];
  let failed = 0;
  for (const result of settled) {
    if (result.status === "fulfilled") rows.push(...result.value);
    else failed++;
  }
  if (failed > 0) {
    console.warn(`Story/Testing metrics: ${failed}/${batches.length} batch(es) failed — real Dev/QA % will be incomplete for the epics in those batches.`, settled.filter((r) => r.status === "rejected").map((r) => r.reason));
  }
  state.storyMetrics = computeStoryMetrics(rows);
  renderAll();
}

// The main JQL excludes status Ceased/Done so finished projects don't
// clutter the Gantt on their own — but that also silently drops a Done/
// Ceased epic that's a CHILD of an initiative still otherwise in
// progress, which then gets its % and NRR computed from only its
// unfinished siblings (too low — see the Forecast/initiative-aggregate
// discussion). This fetches exactly what's missing (children of the
// initiatives we already loaded, whose own status was excluded) and
// merges them in, so those initiatives' rollups — and the Gantt row for
// that finished child — are complete. Best-effort: a failure here just
// means those initiatives look the same as before, not a broken app.
async function refreshDoneChildren(epicRows) {
  const initiativeKeys = [...new Set(epicRows.map((r) => r["Parent key"]).filter(Boolean))];
  if (initiativeKeys.length === 0) return;
  try {
    const batches = [];
    for (let i = 0; i < initiativeKeys.length; i += STORY_BATCH_SIZE) {
      batches.push(initiativeKeys.slice(i, i + STORY_BATCH_SIZE));
    }
    const results = await Promise.all(batches.map((batch) => {
      const jql = `project = ACTO AND type in (Epic, Initiative) AND parent in (${batch.join(",")}) AND status in (Ceased, Done)`;
      return fetchJiraData({ email: "", apiToken: "", jql, maxRows: 5000 });
    }));
    const newRows = keepEpicRows(results.flat());
    if (newRows.length === 0) return;
    const existingKeys = new Set(state.rawData.map((r) => r["Issue key"]));
    const toAdd = newRows.filter((r) => !existingKeys.has(r["Issue key"]));
    if (toAdd.length === 0) return;
    state.rawData = [...state.rawData, ...toAdd];
    state.columns = extractColumns(state.rawData);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(state.rawData)); } catch { /* quota */ }
    deriveData();
    renderAll();
  } catch { /* best-effort completeness fetch */ }
}

// The Gantt only ever shows Epics/Initiatives — filtered here regardless of
// what the configured JQL actually returns (its type filter is user-editable
// in the connector, and a broadened query — e.g. one that also fetches
// Story/Testing for some other reason — must never leak into the chart).
function keepEpicRows(rows) {
  return rows.filter((r) => {
    const type = (r["Issue Type"] || "").trim();
    return type === "" || type === "Epic" || type === "Initiative";
  });
}

export const actions = {
  setData(rows, { silent = false } = {}) {
    state.rawData = keepEpicRows(rows);
    state.columns = extractColumns(state.rawData);
    if (!silent) {
      state.activeFilters = [];
      state.searchTerm = "";
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(state.rawData)); } catch { /* quota */ }
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

  setBoxMode(mode) {
    state.boxMode = mode;
    renderAll();
  },

  setViewMode(mode) {
    state.viewMode = mode;
    renderAll();
  },

  setForecastMonthFilter(monthKey) {
    state.forecastMonthFilter = monthKey;
    renderAll();
  },

  focusRowInGantt(rowKey, projectName) {
    state.viewMode = "gantt";
    state.focusRowKey = rowKey;
    // Standalone epics (no parent initiative) have no "Parent summary" to
    // filter by — for those, just scroll to the row without touching filters.
    if (projectName) {
      state.activeFilters = [{ column: PROJECT_COLUMN, values: [projectName] }];
      saveFilters(state.activeFilters);
    }
    deriveData();
    renderAll();
  },

  setForecastSort(col) {
    const cur = state.forecastSort;
    if (cur.col !== col) state.forecastSort = { col, dir: "asc" };
    else if (cur.dir === "asc") state.forecastSort = { col, dir: "desc" };
    else state.forecastSort = { col: null, dir: null };
    renderAll();
  },

  setForecastDetailCollapsed(collapsed) {
    state.forecastDetailCollapsed = collapsed;
    renderAll();
  },

  async refreshFromJira(background = false) {
    // No connection step: saved config if any, otherwise the server-managed
    // default JQL/credentials.
    const config = await resolveJiraConfig();
    // Foreground (page load/reload): blocking overlay. Background (the
    // periodic auto-refresh timer while the app stays open): silent, so it
    // never interrupts someone actively working in the Gantt.
    if (!background) { state.refreshing = true; renderAll(); }
    // Progressive per-page rendering is only safe on a true cold start
    // (nothing shown yet, so any partial page is strictly better than a
    // blank screen). If a previous fetch (or cached data) already
    // populated the Gantt, swapping state.rawData in page by page would
    // briefly REPLACE that complete set with just the first ~100 fresh
    // rows — and if the currently active filter's project happens to be
    // on a page that hasn't arrived yet, that's a real, visible "No
    // results" flash, not just an internal timing detail. Once there's
    // something to lose, wait for the whole fetch and swap once, atomically.
    const coldStart = !background && state.rawData.length === 0;
    let gotFirstBatch = false;
    try {
      const rows = await fetchJiraData(config, undefined, !coldStart ? undefined : (batchRows) => {
        state.jiraConnected = true;
        if (!gotFirstBatch) {
          gotFirstBatch = true;
          state.refreshing = false;
        }
        actions.setData(batchRows, { silent: true });
      });
      if (rows.length > 0) {
        state.jiraConnected = true;
        if (!coldStart || !gotFirstBatch) actions.setData(rows, { silent: true });
        clearError();
        setupAutoRefresh();
        refreshStoryMetrics(rows);
        refreshDoneChildren(rows);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "JIRA fetch failed");
    } finally {
      if (!background && !gotFirstBatch) { state.refreshing = false; renderAll(); }
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
      const rawParsed = JSON.parse(cached);
      const parsed = Array.isArray(rawParsed) ? keepEpicRows(rawParsed) : [];
      if (parsed.length > 0) {
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
    // Instant display from cache, then a foreground refresh (blocking
    // overlay) so a browser reload always shows that a sync is happening.
    setupAutoRefresh();
    actions.refreshFromJira();
    return;
  }

  // Straight to the Gantt: fetch immediately, no connection step.
  actions.refreshFromJira();
}

boot();
