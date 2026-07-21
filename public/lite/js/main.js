import { transformToEpicTasks, buildDisplayRows, extractColumns } from "./transform.js";
import { applyFilters, computeFilteredKeys, computeDisplayRows } from "./filters.js";
import { loadJiraConfig, fetchJiraData, resolveJiraConfig } from "./jira.js";
import { computeStoryMetrics } from "./gantt-logic.js";
import { loadFilters, saveFilters, loadSearchTerm, saveSearchTerm } from "./prefs.js";
import { renderTopBar } from "./topbar.js";
import { renderFilterBar } from "./filterbar.js";
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
  try {
    const batches = [];
    for (let i = 0; i < keys.length; i += STORY_BATCH_SIZE) {
      batches.push(keys.slice(i, i + STORY_BATCH_SIZE));
    }
    const results = await Promise.all(batches.map((batch) => {
      const jql = `project = ACTO AND type in (Story, Testing) AND parent in (${batch.join(",")})`;
      return fetchJiraData({ email: "", apiToken: "", jql, maxRows: 5000 });
    }));
    state.storyMetrics = computeStoryMetrics(results.flat());
    renderAll();
  } catch { /* best-effort secondary metric */ }
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

  async refreshFromJira(background = false) {
    // No connection step: saved config if any, otherwise the server-managed
    // default JQL/credentials.
    const config = await resolveJiraConfig();
    // Foreground (page load/reload): blocking overlay. Background (the
    // periodic auto-refresh timer while the app stays open): silent, so it
    // never interrupts someone actively working in the Gantt.
    if (!background) { state.refreshing = true; renderAll(); }
    let gotFirstBatch = false;
    try {
      // Foreground: swap state.rawData in per page, so the Gantt shows the
      // first results immediately while the rest streams in. Background
      // (auto-refresh, user already looking at a stable view): don't touch
      // state.rawData until the whole fetch is done — replacing it page by
      // page would flash "No results" whenever the currently active filters
      // only match epics from a page that hasn't arrived yet.
      const rows = await fetchJiraData(config, undefined, background ? undefined : (batchRows) => {
        state.jiraConnected = true;
        if (!gotFirstBatch) {
          gotFirstBatch = true;
          state.refreshing = false;
        }
        actions.setData(batchRows, { silent: true });
      });
      if (rows.length > 0) {
        state.jiraConnected = true;
        if (background || !gotFirstBatch) actions.setData(rows, { silent: true });
        clearError();
        setupAutoRefresh();
        refreshStoryMetrics(rows);
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
