// Port of src/components/FilterBar.tsx: chips with checkbox dropdowns,
// favorites (★, persisted), add-filter dropdown, reset, drag & drop reorder.
// Also renders a dedicated row of colored Product pills — a quick-access
// shortcut for the same "Custom field (Product)" filter.
import { extractUniqueValues } from "./transform.js";
import { loadFavorites, saveFavorites } from "./prefs.js";

const PRODUCT_COLUMN = "Custom field (Product)";
const PRODUCT_COLORS = [
  "#4A6CF7", "#8B5CF6", "#16A34A", "#F59E0B",
  "#EF4444", "#06B6D4", "#F43F5E", "#84CC16",
  "#6366F1", "#EC4899",
];

// "Project" = the initiative an epic belongs to. Stored on every child row
// as the raw "Parent summary" field, so it's filterable the same way as
// any other column — this control is just a friendlier, searchable
// shortcut to it (initiatives can number in the dozens, too many for pills).
const PROJECT_COLUMN = "Parent summary";

let openDropdown = null; // {kind: "chip", column} | {kind: "add"} | null
let dropdownSearch = "";
let favorites = null; // lazy-loaded
let dragFrom = null;
let dragOver = null;
let last = null; // {container, state, actions} for outside-click re-render

// Project search: typed query + whether the suggestion list is showing.
// Separate from openDropdown — this is a live search box, not a toggled panel.
let projectQuery = "";
let projectSuggestOpen = false;

// A click anywhere outside the specific open panel closes it — not just
// outside the whole filter bar, so clicking the Gantt, the toolbar, or any
// other chip/field always dismisses whatever is currently open.
document.addEventListener("mousedown", (e) => {
  if (!last) return;

  if (openDropdown) {
    const stillInside =
      (openDropdown.kind === "chip" && e.target.closest(".chip-wrap")) ||
      (openDropdown.kind === "add" && e.target.closest(".add-wrap"));
    if (!stillInside) {
      openDropdown = null;
      dropdownSearch = "";
      renderFilterBar(last.container, last.state, last.actions);
    }
  }

  if (projectSuggestOpen && !e.target.closest(".project-search-wrap")) {
    projectSuggestOpen = false;
    projectQuery = "";
    renderFilterBar(last.container, last.state, last.actions);
  }
});

function esc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderFilterBar(container, state, actions) {
  last = { container, state, actions };
  if (favorites === null) favorites = loadFavorites();

  if (state.columns.length === 0) {
    container.innerHTML = "";
    return;
  }

  // Ensure favorite columns are always present in activeFilters
  const validFavorites = favorites.filter((f) => state.columns.includes(f));
  const missing = validFavorites.filter(
    (fav) => !state.activeFilters.some((af) => af.column === fav)
  );
  if (missing.length > 0) {
    actions.setFilters([
      ...missing.map((col) => ({ column: col, values: [] })),
      ...state.activeFilters,
    ]);
    return; // re-render comes back through actions
  }

  const chipsHtml = state.activeFilters.map((filter, idx) => {
    const isFav = favorites.includes(filter.column);
    const n = filter.values.length;
    const label = n === 0 ? filter.column : n === 1 ? filter.values[0] : `${filter.column} (${n})`;
    return `
      <div class="chip-wrap" draggable="true" data-idx="${idx}" data-column="${esc(filter.column)}">
        <div class="chip ${n > 0 ? "chip-active" : ""}">
          <button class="chip-label" data-column="${esc(filter.column)}">
            ${isFav ? '<span class="chip-fav-star">★</span>' : ""}
            <span class="chip-text">${esc(label)}</span>
            <span class="chip-arrow ${openDropdown?.kind === "chip" && openDropdown.column === filter.column ? "chip-arrow-open" : ""}">▼</span>
          </button>
          ${isFav ? "" : `<button class="chip-remove" data-column="${esc(filter.column)}" title="Supprimer le filtre ${esc(filter.column)}">×</button>`}
        </div>
        ${openDropdown?.kind === "chip" && openDropdown.column === filter.column ? chipDropdownHtml(filter, state) : ""}
      </div>
    `;
  }).join("");

  const availableColumns = state.columns.filter(
    (c) => !state.activeFilters.some((f) => f.column === c)
  );
  const filteredAvailable = availableColumns.filter((c) =>
    c.toLowerCase().includes(dropdownSearch.toLowerCase())
  );

  const productValues = state.columns.includes(PRODUCT_COLUMN)
    ? extractUniqueValues(state.rawData, PRODUCT_COLUMN)
    : [];
  const projectValues = state.columns.includes(PROJECT_COLUMN)
    ? extractUniqueValues(state.rawData, PROJECT_COLUMN)
    : [];

  container.innerHTML = `
    ${productValues.length > 0 ? productRowHtml(state, productValues) : ""}
    ${projectValues.length > 0 ? projectRowHtml(state, projectValues) : ""}
    <div class="filterbar">
      <span class="filterbar-label">Filters</span>
      ${chipsHtml}
      <div class="add-wrap">
        <button class="btn-add-filter">+ Add filter</button>
        ${openDropdown?.kind === "add" ? `
          <div class="dropdown">
            <input class="dropdown-search dropdown-search-add" type="text" placeholder="Search a field..." />
            <div class="dropdown-options">
              ${filteredAvailable.map((col) => `
                <div class="dropdown-add-row" data-column="${esc(col)}">
                  <span class="dropdown-add-name">${esc(col)}</span>
                  <button class="star-btn ${favorites.includes(col) ? "star-filled" : ""}" data-column="${esc(col)}">${favorites.includes(col) ? "★" : "☆"}</button>
                </div>
              `).join("")}
              ${filteredAvailable.length === 0 ? '<div class="dropdown-empty">No field found</div>' : ""}
            </div>
          </div>
        ` : ""}
      </div>
      ${state.activeFilters.length > 0 ? '<button class="btn-reset">Reset</button>' : ""}
    </div>
  `;

  wireEvents(container, state, actions);
}

function productRowHtml(state, productValues) {
  const filter = state.activeFilters.find((f) => f.column === PRODUCT_COLUMN);
  const hasSelection = !!filter && filter.values.length > 0;
  return `
    <div class="product-row">
      <span class="filterbar-label">Product</span>
      ${productValues.map((val, i) => {
        const color = PRODUCT_COLORS[i % PRODUCT_COLORS.length];
        const active = !hasSelection || filter.values.includes(val);
        return `
          <button class="product-pill ${active ? "product-pill-active" : "product-pill-inactive"}"
                  data-value="${esc(val)}"
                  style="${active ? `background:${color};border-color:${color};` : `color:${color};border-color:${color};`}">
            ${esc(val)}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function projectRowHtml(state, projectValues) {
  const filter = state.activeFilters.find((f) => f.column === PROJECT_COLUMN);
  const selected = filter ? filter.values : [];
  const available = projectValues.filter((v) => !selected.includes(v));
  const suggestions = projectSuggestOpen
    ? available.filter((v) => v.toLowerCase().includes(projectQuery.toLowerCase()))
    : [];

  return `
    <div class="product-row">
      <span class="filterbar-label">Project</span>
      <div class="project-search-wrap">
        <svg class="project-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <div class="project-search-box">
          ${selected.map((val) => `
            <span class="project-tag">
              ${esc(val)}
              <button class="project-tag-remove" data-value="${esc(val)}">×</button>
            </span>
          `).join("")}
          <input class="project-search-input" type="text" placeholder="${selected.length === 0 ? "Search projects..." : "Add another..."}" />
        </div>
        ${selected.length > 0 ? '<button class="project-search-clear-all" title="Clear all projects">×</button>' : ""}
        ${suggestions.length > 0 ? `
          <div class="project-suggestions">
            ${suggestions.map((val) => `<div class="project-suggestion" data-value="${esc(val)}">${esc(val)}</div>`).join("")}
          </div>
        ` : ""}
        ${projectSuggestOpen && projectQuery.trim() && suggestions.length === 0 ? `
          <div class="project-suggestions"><div class="dropdown-empty">Aucun résultat</div></div>
        ` : ""}
      </div>
    </div>
  `;
}

function chipDropdownHtml(filter, state) {
  const uniqueValues = extractUniqueValues(state.rawData, filter.column);
  const filtered = uniqueValues.filter((v) =>
    v.toLowerCase().includes(dropdownSearch.toLowerCase())
  );
  const isFav = favorites.includes(filter.column);
  return `
    <div class="dropdown dropdown-chip">
      <div class="dropdown-header">
        <span class="dropdown-title">${esc(filter.column)}</span>
        <button class="star-btn star-toggle ${isFav ? "star-filled" : ""}" title="${isFav ? "Retirer des favoris" : "Ajouter aux favoris"}">${isFav ? "★" : "☆"}</button>
      </div>
      <div class="dropdown-search-wrap">
        <input class="dropdown-search dropdown-search-chip" type="text" placeholder="Rechercher..." />
      </div>
      <div class="dropdown-actions">
        <button class="dropdown-select-all">Tout sélectionner</button>
        <button class="dropdown-clear">Effacer</button>
      </div>
      <div class="dropdown-options">
        ${filtered.map((val) => `
          <label class="dropdown-option ${filter.values.includes(val) ? "dropdown-option-checked" : ""}">
            <input type="checkbox" data-value="${esc(val)}" ${filter.values.includes(val) ? "checked" : ""} />
            <span>${esc(val)}</span>
          </label>
        `).join("")}
        ${filtered.length === 0 ? '<div class="dropdown-empty">Aucun résultat</div>' : ""}
      </div>
    </div>
  `;
}

function wireEvents(container, state, actions) {
  // Product pills: toggle this value in/out of the Custom field (Product)
  // filter. No selection at all means "show everything" (all pills lit).
  container.querySelectorAll(".product-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.value;
      const existing = state.activeFilters.find((f) => f.column === PRODUCT_COLUMN);
      if (!existing) {
        actions.setFilters([...state.activeFilters, { column: PRODUCT_COLUMN, values: [value] }]);
        return;
      }
      const values = existing.values.includes(value)
        ? existing.values.filter((v) => v !== value)
        : [...existing.values, value];
      actions.setFilters(state.activeFilters.map((f) =>
        f.column === PRODUCT_COLUMN ? { ...f, values } : f
      ));
    });
  });

  // Project search: type-ahead suggestions, click to add as a tag,
  // multiple tags combine (AND'd with every other active filter).
  const projectInput = container.querySelector(".project-search-input");
  if (projectInput) {
    const updateProject = (values) => {
      const existing = state.activeFilters.find((f) => f.column === PROJECT_COLUMN);
      if (!existing) {
        actions.setFilters([...state.activeFilters, { column: PROJECT_COLUMN, values }]);
      } else {
        actions.setFilters(state.activeFilters.map((f) =>
          f.column === PROJECT_COLUMN ? { ...f, values } : f
        ));
      }
    };
    const addProject = (val) => {
      const existing = state.activeFilters.find((f) => f.column === PROJECT_COLUMN);
      const current = existing ? existing.values : [];
      projectQuery = "";
      updateProject([...current, val]);
      // Re-render happens via actions.setFilters; refocus once it lands.
      queueMicrotask(() => container.querySelector(".project-search-input")?.focus());
    };

    projectInput.value = projectQuery;
    projectInput.addEventListener("focus", () => {
      if (projectSuggestOpen) return;
      projectSuggestOpen = true;
      renderFilterBar(container, state, actions);
      container.querySelector(".project-search-input")?.focus();
    });
    projectInput.addEventListener("input", (e) => {
      const pos = e.target.selectionStart;
      projectQuery = e.target.value;
      projectSuggestOpen = true;
      renderFilterBar(container, state, actions);
      const next = container.querySelector(".project-search-input");
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    });

    container.querySelectorAll(".project-suggestion").forEach((el) => {
      el.addEventListener("click", () => addProject(el.dataset.value));
    });
    container.querySelectorAll(".project-tag-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const existing = state.activeFilters.find((f) => f.column === PROJECT_COLUMN);
        const current = existing ? existing.values : [];
        updateProject(current.filter((v) => v !== btn.dataset.value));
      });
    });
    container.querySelector(".project-search-clear-all")?.addEventListener("click", () => {
      updateProject([]);
    });
  }

  // Chip label → toggle dropdown
  container.querySelectorAll(".chip-label").forEach((btn) => {
    btn.addEventListener("click", () => {
      const column = btn.dataset.column;
      const isOpen = openDropdown?.kind === "chip" && openDropdown.column === column;
      openDropdown = isOpen ? null : { kind: "chip", column };
      dropdownSearch = "";
      renderFilterBar(container, state, actions);
      if (!isOpen) container.querySelector(".dropdown-search-chip")?.focus();
    });
  });

  // Chip remove (non-favorites only)
  container.querySelectorAll(".chip-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const column = btn.dataset.column;
      if (openDropdown?.kind === "chip" && openDropdown.column === column) openDropdown = null;
      actions.setFilters(state.activeFilters.filter((f) => f.column !== column));
    });
  });

  // Chip dropdown internals
  const chipDd = container.querySelector(".dropdown-chip");
  if (chipDd && openDropdown?.kind === "chip") {
    const column = openDropdown.column;
    const filter = state.activeFilters.find((f) => f.column === column);
    const update = (values) => {
      actions.setFilters(state.activeFilters.map((f) => (f.column === column ? { ...f, values } : f)));
    };

    const search = chipDd.querySelector(".dropdown-search-chip");
    search.value = dropdownSearch;
    search.addEventListener("input", (e) => {
      const pos = e.target.selectionStart;
      dropdownSearch = e.target.value;
      renderFilterBar(container, state, actions);
      const next = container.querySelector(".dropdown-search-chip");
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    });

    chipDd.querySelector(".star-toggle").addEventListener("click", () => {
      toggleFavorite(column);
      renderFilterBar(container, state, actions);
    });
    chipDd.querySelector(".dropdown-select-all").addEventListener("click", () => {
      update(extractUniqueValues(state.rawData, column));
    });
    chipDd.querySelector(".dropdown-clear").addEventListener("click", () => update([]));

    chipDd.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        const val = cb.dataset.value;
        if (filter.values.includes(val)) update(filter.values.filter((v) => v !== val));
        else update([...filter.values, val]);
      });
    });
  }

  // Add filter
  container.querySelector(".btn-add-filter").addEventListener("click", () => {
    const isOpen = openDropdown?.kind === "add";
    openDropdown = isOpen ? null : { kind: "add" };
    dropdownSearch = "";
    renderFilterBar(container, state, actions);
    if (!isOpen) container.querySelector(".dropdown-search-add")?.focus();
  });

  const addSearch = container.querySelector(".dropdown-search-add");
  if (addSearch) {
    addSearch.value = dropdownSearch;
    addSearch.addEventListener("input", (e) => {
      const pos = e.target.selectionStart;
      dropdownSearch = e.target.value;
      renderFilterBar(container, state, actions);
      const next = container.querySelector(".dropdown-search-add");
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    });
  }

  container.querySelectorAll(".dropdown-add-row").forEach((rowEl) => {
    const column = rowEl.dataset.column;
    rowEl.querySelector(".dropdown-add-name").addEventListener("click", () => {
      addFilter(column, state, actions);
    });
    rowEl.querySelector(".star-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(column);
      addFilter(column, state, actions);
    });
  });

  // Reset: keep favorites with cleared values, remove the rest
  container.querySelector(".btn-reset")?.addEventListener("click", () => {
    openDropdown = null;
    const favFilters = state.activeFilters
      .filter((f) => favorites.includes(f.column))
      .map((f) => ({ ...f, values: [] }));
    actions.setFilters(favFilters);
  });

  // Drag & drop reorder
  container.querySelectorAll(".chip-wrap").forEach((chipEl) => {
    const idx = Number(chipEl.dataset.idx);
    chipEl.addEventListener("dragstart", () => { dragFrom = idx; chipEl.classList.add("chip-dragging"); });
    chipEl.addEventListener("dragenter", () => { dragOver = idx; });
    chipEl.addEventListener("dragover", (e) => e.preventDefault());
    chipEl.addEventListener("dragend", () => {
      chipEl.classList.remove("chip-dragging");
      if (dragFrom !== null && dragOver !== null && dragFrom !== dragOver) {
        const reordered = [...state.activeFilters];
        const [removed] = reordered.splice(dragFrom, 1);
        reordered.splice(dragOver, 0, removed);
        actions.setFilters(reordered);
      }
      dragFrom = null;
      dragOver = null;
    });
  });
}

function addFilter(column, state, actions) {
  openDropdown = null;
  dropdownSearch = "";
  actions.setFilters([...state.activeFilters, { column, values: [] }]);
}

function toggleFavorite(column) {
  favorites = favorites.includes(column)
    ? favorites.filter((f) => f !== column)
    : [...favorites, column];
  saveFavorites(favorites);
}
