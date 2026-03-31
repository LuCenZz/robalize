import { useState } from "react";
import type { ActiveFilter } from "../types";
import { theme } from "../styles/theme";

interface FilterBarProps {
  columns: string[];
  activeFilters: ActiveFilter[];
  getUniqueValues: (column: string) => string[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
}

export function FilterBar({
  columns,
  activeFilters,
  getUniqueValues,
  onFiltersChange,
}: FilterBarProps) {
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

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
    onFiltersChange(activeFilters.filter((f) => f.column !== column));
  }

  function updateFilterValues(column: string, values: string[]) {
    onFiltersChange(
      activeFilters.map((f) =>
        f.column === column ? { ...f, values } : f
      )
    );
  }

  function resetAll() {
    onFiltersChange([]);
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
          Filtres
        </span>

        {activeFilters.map((filter) => {
          const uniqueValues = getUniqueValues(filter.column);
          return (
            <div
              key={filter.column}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <select
                multiple
                value={filter.values}
                onChange={(e) => {
                  const selected = Array.from(
                    e.target.selectedOptions,
                    (o) => o.value
                  );
                  updateFilterValues(filter.column, selected);
                }}
                title={filter.column}
                style={{
                  padding: "5px 10px",
                  border: "1.5px solid #c9b8ff",
                  borderRadius: 6,
                  fontSize: 12,
                  background: "white",
                  color: "#333",
                  minWidth: 120,
                  maxHeight: 28,
                  overflow: "hidden",
                }}
              >
                {uniqueValues.map((val) => (
                  <option key={val} value={val}>
                    {val}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeFilter(filter.column)}
                style={{
                  background: "none",
                  border: "none",
                  color: theme.primary,
                  cursor: "pointer",
                  fontSize: 14,
                  padding: "0 2px",
                }}
                title={`Supprimer filtre ${filter.column}`}
              >
                x
              </button>
            </div>
          );
        })}

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowAddDropdown(!showAddDropdown)}
            style={{
              background: theme.primary,
              border: "none",
              padding: "5px 14px",
              borderRadius: 6,
              fontSize: 12,
              cursor: "pointer",
              color: "white",
              fontWeight: 500,
            }}
          >
            + Ajouter filtre
          </button>
          {showAddDropdown && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                background: "white",
                border: `1px solid ${theme.borderLight}`,
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                zIndex: 100,
                width: 300,
                maxHeight: 400,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <input
                type="text"
                placeholder="Rechercher un champ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
                style={{
                  padding: "8px 12px",
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
                    onClick={() => addFilter(col)}
                    style={{
                      padding: "8px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                      borderBottom: `1px solid ${theme.filterBarBg}`,
                      color: theme.textDark,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        theme.filterBarBg)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "white")
                    }
                  >
                    {col}
                  </div>
                ))}
                {filteredAvailable.length === 0 && (
                  <div
                    style={{
                      padding: "12px",
                      color: theme.textMuted,
                      fontSize: 12,
                      textAlign: "center",
                    }}
                  >
                    Aucun champ trouvé
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
              padding: "5px 12px",
              borderRadius: 6,
              fontSize: 12,
              cursor: "pointer",
              color: theme.primary,
              marginLeft: "auto",
            }}
          >
            Réinitialiser
          </button>
        )}
      </div>
    </div>
  );
}
