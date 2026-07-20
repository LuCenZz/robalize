import { transformToEpicTasks, buildDisplayRows, extractColumns } from "./transform.js";
import { applyFilters, computeFilteredKeys, computeDisplayRows } from "./filters.js";
import { loadJiraConfig, fetchJiraData, resolveJiraConfig } from "./jira.js";
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
  refreshing: false,
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
  const gantt = document.getElementById("gantt");
  gantt.classList.toggle("hidden", state.rawData.length === 0);
  if (state.rawData.length > 0) {
    renderGantt(gantt, state, actions);
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
      const rows = await fetchJiraData(config, undefined, (batchRows) => {
        // Render as soon as the first page arrives; the rest keeps loading
        // in the background instead of blocking the whole fetch.
        state.jiraConnected = true;
        if (!background && !gotFirstBatch) {
          gotFirstBatch = true;
          state.refreshing = false;
        }
        actions.setData(batchRows, { silent: true });
      });
      if (rows.length > 0) {
        clearError();
        setupAutoRefresh();
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
