import { useState, useRef, useEffect, useCallback } from "react";
import type { ActiveFilter } from "../types";
import { theme } from "../styles/theme";
import { saveFavorites as saveUserFavorites, loadFavorites as loadUserFavorites } from "../utils/userPrefs";

interface FilterBarProps {
  columns: string[];
  activeFilters: ActiveFilter[];
  getUniqueValues: (column: string) => string[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
}

function StarButton({
  filled,
  onClick,
  size = 14,
}: {
  filled: boolean;
  onClick: (e: React.MouseEvent) => void;
  size?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={filled ? "Retirer des favoris" : "Ajouter aux favoris"}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "0 2px",
        fontSize: size,
        lineHeight: 1,
        color: filled ? "#f5a623" : "#ccc",
        transition: "color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!filled) e.currentTarget.style.color = "#f5c842";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = filled ? "#f5a623" : "#ccc";
      }}
    >
      {filled ? "★" : "☆"}
    </button>
  );
}

function CheckboxDropdown({
  filter,
  uniqueValues,
  onUpdate,
  onRemove,
  isFavorite,
  onToggleFavorite,
}: {
  filter: ActiveFilter;
  uniqueValues: string[];
  onUpdate: (values: string[]) => void;
  onRemove: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = uniqueValues.filter((v) =>
    v.toLowerCase().includes(search.toLowerCase())
  );

  const selectedCount = filter.values.length;

  function toggle(val: string) {
    if (filter.values.includes(val)) {
      onUpdate(filter.values.filter((v) => v !== val));
    } else {
      onUpdate([...filter.values, val]);
    }
  }

  function selectAll() {
    onUpdate([...uniqueValues]);
  }

  function clearAll() {
    onUpdate([]);
  }

  const label =
    selectedCount === 0
      ? filter.column
      : selectedCount === 1
        ? filter.values[0]
        : `${filter.column} (${selectedCount})`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          border: "1.5px solid #c9b8ff",
          borderRadius: 8,
          background: selectedCount > 0 ? "#f0ebff" : "white",
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setOpen(!open)}
          style={{
            padding: "6px 10px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 12,
            color: selectedCount > 0 ? theme.primary : "#555",
            fontWeight: selectedCount > 0 ? 600 : 400,
            display: "flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
            maxWidth: 200,
          }}
        >
          {isFavorite && (
            <span style={{ color: "#f5a623", fontSize: 10 }}>★</span>
          )}
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontSize: 8,
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s",
            }}
          >
            ▼
          </span>
        </button>
        {!isFavorite && (
          <button
            onClick={onRemove}
            style={{
              background: "none",
              border: "none",
              borderLeft: "1px solid #c9b8ff",
              color: "#999",
              cursor: "pointer",
              fontSize: 13,
              padding: "6px 8px",
              lineHeight: 1,
            }}
            title={`Supprimer le filtre ${filter.column}`}
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "white",
            border: `1px solid ${theme.borderLight}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(107, 44, 245, 0.12)",
            zIndex: 200,
            width: 280,
            maxHeight: 360,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header with favorite toggle */}
          <div
            style={{
              padding: "10px 12px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: theme.primary,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {filter.column}
            </span>
            <StarButton filled={isFavorite} onClick={onToggleFavorite} />
          </div>

          {/* Search */}
          <div style={{ padding: "8px 12px" }}>
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{
                width: "100%",
                padding: "7px 10px",
                border: `1.5px solid ${theme.borderLight}`,
                borderRadius: 6,
                outline: "none",
                fontSize: 12,
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = theme.primary)
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = theme.borderLight)
              }
            />
          </div>

          {/* Select all / Clear */}
          <div
            style={{
              display: "flex",
              gap: 12,
              padding: "0 12px 6px",
              fontSize: 11,
            }}
          >
            <button
              onClick={selectAll}
              style={{
                background: "none",
                border: "none",
                color: theme.primary,
                cursor: "pointer",
                padding: 0,
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              Tout sélectionner
            </button>
            <button
              onClick={clearAll}
              style={{
                background: "none",
                border: "none",
                color: "#999",
                cursor: "pointer",
                padding: 0,
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              Effacer
            </button>
          </div>

          {/* Options list */}
          <div
            style={{
              overflowY: "auto",
              maxHeight: 240,
              borderTop: `1px solid ${theme.borderLight}`,
            }}
          >
            {filtered.map((val) => {
              const checked = filter.values.includes(val);
              return (
                <label
                  key={val}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 12px",
                    cursor: "pointer",
                    fontSize: 12,
                    color: theme.textDark,
                    background: checked ? "#f8f5ff" : "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!checked)
                      e.currentTarget.style.background = "#faf8ff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = checked
                      ? "#f8f5ff"
                      : "transparent";
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(val)}
                    style={{
                      accentColor: theme.primary,
                      width: 15,
                      height: 15,
                      cursor: "pointer",
                      margin: 0,
                    }}
                  />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {val}
                  </span>
                </label>
              );
            })}
            {filtered.length === 0 && (
              <div
                style={{
                  padding: 16,
                  textAlign: "center",
                  color: theme.textMuted,
                  fontSize: 12,
                }}
              >
                Aucun résultat
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function FilterBar({
  columns,
  activeFilters,
  getUniqueValues,
  onFiltersChange,
}: FilterBarProps) {
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [favorites, setFavorites] = useState<string[]>(loadUserFavorites);
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) {
        setShowAddDropdown(false);
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Ensure favorite columns are always present in activeFilters
  useEffect(() => {
    const validFavorites = favorites.filter((f) => columns.includes(f));
    const missingFavorites = validFavorites.filter(
      (fav) => !activeFilters.some((af) => af.column === fav)
    );
    if (missingFavorites.length > 0) {
      onFiltersChange([
        ...missingFavorites.map((col) => ({ column: col, values: [] as string[] })),
        ...activeFilters,
      ]);
    }
  }, [favorites, columns]);

  const toggleFavorite = useCallback(
    (column: string) => {
      setFavorites((prev) => {
        const next = prev.includes(column)
          ? prev.filter((f) => f !== column)
          : [...prev, column];
        saveUserFavorites(next);
        return next;
      });
    },
    []
  );

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
    // Can't remove favorite filters, only clear their values
    if (favorites.includes(column)) {
      onFiltersChange(
        activeFilters.map((f) =>
          f.column === column ? { ...f, values: [] } : f
        )
      );
    } else {
      onFiltersChange(activeFilters.filter((f) => f.column !== column));
    }
  }

  function updateFilterValues(column: string, values: string[]) {
    onFiltersChange(
      activeFilters.map((f) =>
        f.column === column ? { ...f, values } : f
      )
    );
  }

  function resetAll() {
    // Keep favorites but clear their values, remove the rest
    const favFilters = activeFilters
      .filter((f) => favorites.includes(f.column))
      .map((f) => ({ ...f, values: [] as string[] }));
    onFiltersChange(favFilters);
  }

  // Drag & drop reorder
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  function handleDragStart(idx: number) {
    dragItem.current = idx;
    setDragIdx(idx);
  }

  function handleDragEnter(idx: number) {
    dragOver.current = idx;
  }

  function handleDragEnd() {
    if (dragItem.current !== null && dragOver.current !== null && dragItem.current !== dragOver.current) {
      const reordered = [...activeFilters];
      const [removed] = reordered.splice(dragItem.current, 1);
      reordered.splice(dragOver.current, 0, removed);
      onFiltersChange(reordered);
    }
    dragItem.current = null;
    dragOver.current = null;
    setDragIdx(null);
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
          Filters
        </span>

        {activeFilters.map((filter, idx) => (
          <div
            key={filter.column}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragEnter={() => handleDragEnter(idx)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            style={{
              cursor: "grab",
              opacity: dragIdx === idx ? 0.4 : 1,
              transition: "opacity 0.15s",
            }}
          >
            <CheckboxDropdown
              filter={filter}
              uniqueValues={getUniqueValues(filter.column)}
              onUpdate={(values) => updateFilterValues(filter.column, values)}
              onRemove={() => removeFilter(filter.column)}
              isFavorite={favorites.includes(filter.column)}
              onToggleFavorite={() => toggleFavorite(filter.column)}
            />
          </div>
        ))}

        {/* Add filter button */}
        <div ref={addRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowAddDropdown(!showAddDropdown)}
            style={{
              background: theme.primary,
              border: "none",
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 12,
              cursor: "pointer",
              color: "white",
              fontWeight: 500,
            }}
          >
            + Add filter
          </button>
          {showAddDropdown && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                background: "white",
                border: `1px solid ${theme.borderLight}`,
                borderRadius: 10,
                boxShadow: "0 8px 24px rgba(107, 44, 245, 0.12)",
                zIndex: 200,
                width: 300,
                maxHeight: 400,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <input
                type="text"
                placeholder="Search a field..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
                style={{
                  padding: "10px 12px",
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
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "9px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                      borderBottom: `1px solid ${theme.filterBarBg}`,
                      color: theme.textDark,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = theme.filterBarBg)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "white")
                    }
                  >
                    <span onClick={() => addFilter(col)} style={{ flex: 1 }}>
                      {col}
                    </span>
                    <StarButton
                      filled={favorites.includes(col)}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(col);
                        addFilter(col);
                      }}
                      size={13}
                    />
                  </div>
                ))}
                {filteredAvailable.length === 0 && (
                  <div
                    style={{
                      padding: 16,
                      color: theme.textMuted,
                      fontSize: 12,
                      textAlign: "center",
                    }}
                  >
                    No field found
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
              border: "1.5px solid #c9b8ff",
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 12,
              cursor: "pointer",
              color: theme.primary,
              marginLeft: "auto",
              fontWeight: 500,
            }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
