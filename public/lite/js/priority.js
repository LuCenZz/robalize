// "Priority" table: a flat, one-row-per-initiative list (standalone epics
// count as their own group — see getPriorityRows) that the user can
// manually re-order by drag-and-drop, with a fully custom, reorderable
// set of columns and an Excel-style per-column sort/filter in each header.
import {
  getPriorityRows, priorityRowKey, getPriorityCellValue, getPriorityColumnValues,
  applyPriorityColumnFilters, sortPriorityRows, applyPriorityOrder,
} from "./priority-logic.js";

const COLUMN_LABELS = { "Issue key": "KEY", "Summary": "Description" };
function columnLabel(col) {
  return COLUMN_LABELS[col] || col;
}

// { kind: "filter", column } | { kind: "add" } | null — only one dropdown
// open at a time, same convention as filterbar.js's openDropdown.
let openDropdown = null;
let dropdownSearch = "";
let colDragFrom = null;
let colDragOver = null;
let rowDragFrom = null;
let rowDragOver = null;
let last = null; // {container, state, actions} for outside-click re-render

document.addEventListener("mousedown", (e) => {
  if (!last || !openDropdown) return;
  const stillInside =
    (openDropdown.kind === "filter" && e.target.closest(".priority-th")) ||
    (openDropdown.kind === "add" && e.target.closest(".priority-add-wrap"));
  if (!stillInside) {
    openDropdown = null;
    dropdownSearch = "";
    renderPriorityTable(last.container, last.state, last.actions);
  }
});

function esc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function sortArrow(sort, col) {
  if (sort.col !== col) return "";
  return sort.dir === "asc" ? " ▲" : " ▼";
}

function filterDropdownHtml(column, topRows, activeValues) {
  const values = getPriorityColumnValues(topRows, column).filter((v) =>
    v.toLowerCase().includes(dropdownSearch.toLowerCase())
  );
  return `
    <div class="dropdown dropdown-chip priority-th-dropdown">
      <div class="dropdown-search-wrap">
        <input class="dropdown-search dropdown-search-chip" type="text" placeholder="Search..." />
      </div>
      <div class="dropdown-actions">
        <button class="dropdown-select-all">Select all</button>
        <button class="dropdown-clear">Clear</button>
      </div>
      <div class="dropdown-options">
        ${values.map((val) => `
          <label class="dropdown-option ${activeValues.includes(val) ? "dropdown-option-checked" : ""}">
            <input type="checkbox" data-value="${esc(val)}" ${activeValues.includes(val) ? "checked" : ""} />
            <span>${esc(val)}</span>
          </label>
        `).join("")}
        ${values.length === 0 ? '<div class="dropdown-empty">No values</div>' : ""}
      </div>
    </div>
  `;
}

function addColumnDropdownHtml(availableColumns) {
  const filtered = availableColumns.filter((c) =>
    c.toLowerCase().includes(dropdownSearch.toLowerCase())
  );
  return `
    <div class="dropdown priority-add-dropdown">
      <input class="dropdown-search dropdown-search-add" type="text" placeholder="Search a field..." />
      <div class="dropdown-options">
        ${filtered.map((col) => `<div class="dropdown-add-row" data-column="${esc(col)}">${esc(col)}</div>`).join("")}
        ${filtered.length === 0 ? '<div class="dropdown-empty">No field found</div>' : ""}
      </div>
    </div>
  `;
}

function headerCellHtml(column, idx, sort, colFilters, topRows) {
  const active = colFilters[column] && colFilters[column].length > 0;
  const isOpen = openDropdown?.kind === "filter" && openDropdown.column === column;
  return `
    <th class="priority-th ${sort.col === column ? "priority-th-sorted" : ""}"
        draggable="true" data-col-idx="${idx}" data-column="${esc(column)}">
      <span class="priority-th-drag" title="Drag to reorder column">⠿</span>
      <button class="priority-th-label" data-sort-col="${esc(column)}">${esc(columnLabel(column))}${sortArrow(sort, column)}</button>
      <button class="priority-th-filter ${active ? "priority-th-filter-active" : ""}" data-filter-col="${esc(column)}" title="Filter">▾</button>
      <button class="priority-th-remove" data-remove-col="${esc(column)}" title="Remove column">×</button>
      ${isOpen ? filterDropdownHtml(column, topRows, colFilters[column] || []) : ""}
    </th>
  `;
}

function rowHtml(row, columns, canDrag) {
  const key = priorityRowKey(row);
  return `
    <tr class="priority-row" draggable="${canDrag}" data-row-key="${esc(key)}">
      <td class="priority-td-drag">${canDrag ? '<span class="priority-drag-handle" title="Drag to reorder">⠿</span>' : ""}</td>
      ${columns.map((col) => `<td class="priority-td">${esc(getPriorityCellValue(row, col))}</td>`).join("")}
      <td class="priority-td-add"></td>
    </tr>
  `;
}

export function renderPriorityTable(container, state, actions) {
  last = { container, state, actions };

  const columns = state.priorityColumns;
  const topRows = getPriorityRows(state.derived.displayRows);
  const filtered = applyPriorityColumnFilters(topRows, state.priorityColumnFilters);
  const sort = state.prioritySort;
  const canDrag = !sort.col;
  const rows = canDrag ? applyPriorityOrder(filtered, state.priorityOrder) : sortPriorityRows(filtered, sort.col, sort.dir);

  const availableColumns = state.columns.filter((c) => !columns.includes(c));

  container.innerHTML = `
    <div class="forecast-wrap priority-wrap">
      <div class="forecast-header">
        <span class="forecast-title">Priority</span>
        <span class="forecast-count">${rows.length} initiative${rows.length === 1 ? "" : "s"}</span>
      </div>
      <div class="forecast-table-scroll priority-table-scroll">
        <table class="priority-table">
          <thead>
            <tr>
              <th class="priority-th-drag-col"></th>
              ${columns.map((col, idx) => headerCellHtml(col, idx, sort, state.priorityColumnFilters, topRows)).join("")}
              <th class="priority-th-add-col">
                <div class="add-wrap priority-add-wrap">
                  <button class="btn-add-filter priority-add-btn">+ Add column</button>
                  ${openDropdown?.kind === "add" ? addColumnDropdownHtml(availableColumns) : ""}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => rowHtml(row, columns, canDrag)).join("")}
            ${rows.length === 0 ? `<tr><td class="priority-empty" colspan="${columns.length + 2}">No initiatives match the current filters.</td></tr>` : ""}
          </tbody>
        </table>
      </div>
    </div>
  `;

  wireEvents(container, state, actions, { columns, topRows, rows, canDrag });
}

function wireEvents(container, state, actions, { columns, topRows, rows, canDrag }) {
  // Column header: click label to cycle sort
  container.querySelectorAll("[data-sort-col]").forEach((btn) => {
    btn.addEventListener("click", () => actions.setPrioritySort(btn.dataset.sortCol));
  });

  // Column header: filter icon toggles its dropdown
  container.querySelectorAll("[data-filter-col]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const column = btn.dataset.filterCol;
      const isOpen = openDropdown?.kind === "filter" && openDropdown.column === column;
      openDropdown = isOpen ? null : { kind: "filter", column };
      dropdownSearch = "";
      renderPriorityTable(container, state, actions);
      if (!isOpen) container.querySelector(".dropdown-search-chip")?.focus();
    });
  });

  // Column header: remove column
  container.querySelectorAll("[data-remove-col]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const column = btn.dataset.removeCol;
      if (openDropdown?.kind === "filter" && openDropdown.column === column) openDropdown = null;
      actions.setPriorityColumns(columns.filter((c) => c !== column));
    });
  });

  // Filter dropdown internals (search / select all / clear / checkboxes)
  const filterDd = container.querySelector(".priority-th-dropdown");
  if (filterDd && openDropdown?.kind === "filter") {
    const column = openDropdown.column;
    const current = state.priorityColumnFilters[column] || [];
    const update = (values) => actions.setPriorityColumnFilter(column, values);

    const search = filterDd.querySelector(".dropdown-search-chip");
    search.value = dropdownSearch;
    search.addEventListener("input", (e) => {
      const pos = e.target.selectionStart;
      dropdownSearch = e.target.value;
      renderPriorityTable(container, state, actions);
      const next = container.querySelector(".dropdown-search-chip");
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    });

    filterDd.querySelector(".dropdown-select-all").addEventListener("click", () => {
      update(getPriorityColumnValues(topRows, column));
    });
    filterDd.querySelector(".dropdown-clear").addEventListener("click", () => update([]));

    filterDd.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        const val = cb.dataset.value;
        update(current.includes(val) ? current.filter((v) => v !== val) : [...current, val]);
      });
    });
  }

  // Add column
  const addBtn = container.querySelector(".priority-add-btn");
  addBtn?.addEventListener("click", () => {
    const isOpen = openDropdown?.kind === "add";
    openDropdown = isOpen ? null : { kind: "add" };
    dropdownSearch = "";
    renderPriorityTable(container, state, actions);
    if (!isOpen) container.querySelector(".dropdown-search-add")?.focus();
  });

  const addSearch = container.querySelector(".dropdown-search-add");
  if (addSearch) {
    addSearch.value = dropdownSearch;
    addSearch.addEventListener("input", (e) => {
      const pos = e.target.selectionStart;
      dropdownSearch = e.target.value;
      renderPriorityTable(container, state, actions);
      const next = container.querySelector(".dropdown-search-add");
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    });
  }

  container.querySelectorAll(".dropdown-add-row").forEach((rowEl) => {
    rowEl.addEventListener("click", () => {
      openDropdown = null;
      dropdownSearch = "";
      actions.setPriorityColumns([...columns, rowEl.dataset.column]);
    });
  });

  // Column drag & drop reorder — same native HTML5 pattern as filterbar.js's chips.
  container.querySelectorAll(".priority-th[data-col-idx]").forEach((th) => {
    const idx = Number(th.dataset.colIdx);
    th.addEventListener("dragstart", (e) => {
      colDragFrom = idx;
      th.classList.add("priority-th-dragging");
      e.dataTransfer.setData("text/plain", "");
    });
    th.addEventListener("dragenter", () => { colDragOver = idx; });
    th.addEventListener("dragover", (e) => e.preventDefault());
    th.addEventListener("dragend", () => {
      th.classList.remove("priority-th-dragging");
      if (colDragFrom !== null && colDragOver !== null && colDragFrom !== colDragOver) {
        const reordered = [...columns];
        const [removed] = reordered.splice(colDragFrom, 1);
        reordered.splice(colDragOver, 0, removed);
        actions.setPriorityColumns(reordered);
      }
      colDragFrom = null;
      colDragOver = null;
    });
  });

  // Row drag & drop — reorders the currently visible rows among themselves;
  // rows hidden by an active column filter keep their relative order and
  // are appended after the visible block (see applyPriorityOrder).
  if (canDrag) {
    container.querySelectorAll(".priority-row[draggable='true']").forEach((tr) => {
      const key = tr.dataset.rowKey;
      tr.addEventListener("dragstart", (e) => {
        rowDragFrom = key;
        tr.classList.add("priority-row-dragging");
        e.dataTransfer.setData("text/plain", "");
      });
      tr.addEventListener("dragenter", () => { rowDragOver = key; });
      tr.addEventListener("dragover", (e) => e.preventDefault());
      tr.addEventListener("dragend", () => {
        tr.classList.remove("priority-row-dragging");
        if (rowDragFrom !== null && rowDragOver !== null && rowDragFrom !== rowDragOver) {
          const visibleKeys = rows.map((r) => priorityRowKey(r));
          const fromIdx = visibleKeys.indexOf(rowDragFrom);
          const toIdx = visibleKeys.indexOf(rowDragOver);
          if (fromIdx !== -1 && toIdx !== -1) {
            const reorderedVisible = [...visibleKeys];
            const [removed] = reorderedVisible.splice(fromIdx, 1);
            reorderedVisible.splice(toIdx, 0, removed);
            const hiddenKeys = topRows
              .map((r) => priorityRowKey(r))
              .filter((k) => !visibleKeys.includes(k));
            actions.setPriorityOrder([...reorderedVisible, ...hiddenKeys]);
          }
        }
        rowDragFrom = null;
        rowDragOver = null;
      });
    });
  }
}
