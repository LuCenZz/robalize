import { useEffect, useRef, useState } from "react";
import { gantt } from "dhtmlx-gantt";
import "dhtmlx-gantt/codebase/dhtmlxgantt.css";
import type { EpicTask } from "../types";
import { theme } from "../styles/theme";
import { PHASE_CONFIG } from "../types";

interface GanttChartProps {
  tasks: EpicTask[];
}

export function GanttChart({ tasks }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const layerAdded = useRef(false);
  const [zoomLevel, setZoomLevel] = useState<"day" | "week" | "month">("month");

  function applyZoom(level: "day" | "week" | "month") {
    setZoomLevel(level);
    if (level === "day") {
      gantt.config.scales = [
        { unit: "month", step: 1, format: "%M %Y" },
        { unit: "day", step: 1, format: "%d" },
      ];
    } else if (level === "week") {
      gantt.config.scales = [
        { unit: "month", step: 1, format: "%M %Y" },
        { unit: "week", step: 1, format: "W%W" },
      ];
    } else {
      gantt.config.scales = [
        { unit: "year", step: 1, format: "%Y" },
        { unit: "month", step: 1, format: "%M" },
      ];
    }
    gantt.render();
  }

  useEffect(() => {
    if (!containerRef.current) return;

    if (!initialized.current) {
      gantt.config.readonly = true;
      gantt.config.date_format = "%Y-%m-%d";
      gantt.config.fit_tasks = true;
      gantt.config.show_progress = false;
      gantt.config.drag_move = false;
      gantt.config.drag_resize = false;
      gantt.config.drag_links = false;
      gantt.config.show_links = false;
      gantt.config.row_height = 40;
      gantt.config.bar_height = 22;
      gantt.config.scale_height = 40;

      gantt.config.columns = [
        {
          name: "text",
          label: "Epic Name",
          tree: false,
          width: 250,
          resize: true,
        },
        {
          name: "status",
          label: "Status",
          align: "center",
          width: 100,
          resize: true,
          template: (task: any) => {
            if (!task.status) return "";
            return `<span style="
              font-size:10px;
              background:${theme.primary}22;
              color:${theme.primary};
              padding:3px 8px;
              border-radius:10px;
              font-weight:500;
            ">${task.status}</span>`;
          },
        },
      ];

      gantt.config.scales = [
        { unit: "month", step: 1, format: "%M %Y" },
        { unit: "week", step: 1, format: "W%W" },
      ];

      // Hide the default task bar (we draw custom phase bars instead)
      gantt.templates.task_class = () => "gantt-hidden-bar";

      // Tooltip for custom layers is handled via title attribute
      gantt.templates.tooltip_text = () => "";

      gantt.templates.scale_cell_class = () => "gantt-white-header";

      gantt.templates.grid_row_class = (_start: Date, _end: Date, task: any) => {
        return task.$index % 2 === 0 ? "" : "gantt-row-alt";
      };
      gantt.templates.task_row_class = (_start: Date, _end: Date, task: any) => {
        return task.$index % 2 === 0 ? "" : "gantt-row-alt";
      };

      gantt.init(containerRef.current);
      initialized.current = true;
    }

    // Add custom task layer to draw colored phase bars (GPL-compatible)
    if (!layerAdded.current) {
      PHASE_CONFIG.forEach((phase) => {
        gantt.addTaskLayer({
          renderer: {
            render: (task: any) => {
              const phases = task.phases;
              if (!phases) return false;

              const phaseData = phases.find(
                (p: any) => p.phaseName === phase.name
              );
              if (!phaseData) return false;

              const startDate = new Date(phaseData.startDate);
              const endDate = new Date(phaseData.endDate);

              const startPos = gantt.posFromDate(startDate);
              const endPos = gantt.posFromDate(endDate);
              const width = endPos - startPos;

              if (width <= 0) return false;

              const taskTop = gantt.getTaskPosition(task, startDate, endDate);

              const el = document.createElement("div");
              el.className = "gantt-phase-bar";
              el.title = `${phase.name}: ${startDate.toLocaleDateString("fr-FR")} — ${endDate.toLocaleDateString("fr-FR")}`;
              el.style.cssText = `
                position: absolute;
                left: ${startPos}px;
                top: ${taskTop.top + 9}px;
                width: ${width}px;
                height: 22px;
                background: ${phase.color};
                border-radius: 4px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.12);
                cursor: pointer;
                z-index: 1;
              `;

              return el;
            },
            getRectangle: () => { return; },
            getVisibleRange: () => { return; },
          },
        });
      });
      layerAdded.current = true;
    }

    // Convert EpicTasks to DHTMLX format — one row per epic, no children
    const ganttData: any[] = [];

    tasks.forEach((epic) => {
      // Find the overall date range across all phases
      let minDate: Date | null = null;
      let maxDate: Date | null = null;
      for (const phase of epic.phases) {
        if (!minDate || phase.startDate < minDate) minDate = phase.startDate;
        if (!maxDate || phase.endDate > maxDate) maxDate = phase.endDate;
      }

      if (minDate && maxDate) {
        ganttData.push({
          id: epic.id,
          text: epic.epicName,
          status: epic.status,
          start_date: formatDate(minDate),
          end_date: formatDate(maxDate),
          phases: epic.phases,
        });
      }
    });

    gantt.clearAll();
    gantt.parse({
      data: ganttData,
      links: [],
    });
  }, [tasks]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <style>{`
        .gantt-white-header {
          background: white !important;
          color: ${theme.textDark} !important;
          font-weight: 700 !important;
          border-color: ${theme.borderLight} !important;
        }
        .gantt_grid_head_cell {
          background: white !important;
          color: ${theme.textDark} !important;
          font-weight: 700 !important;
          border-color: ${theme.borderLight} !important;
        }
        .gantt_scale_line {
          border-color: ${theme.borderLight} !important;
        }
        .gantt-row-alt {
          background: ${theme.rowAlt} !important;
        }
        .gantt-hidden-bar .gantt_task_line,
        .gantt_task_line.gantt-hidden-bar {
          background: transparent !important;
          box-shadow: none !important;
          border: none !important;
        }
        .gantt_task_line {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
        .gantt-phase-bar:hover {
          opacity: 0.85;
        }
        .gantt_grid_data .gantt_cell {
          border-color: ${theme.borderRow} !important;
          font-family: ${theme.fontFamily} !important;
          color: ${theme.textDark} !important;
        }
        .gantt_grid_head_cell {
          font-family: ${theme.fontFamily} !important;
        }
        .gantt_scale_cell {
          font-family: ${theme.fontFamily} !important;
        }
        .gantt_task_content {
          display: none !important;
        }
        .gantt_tree_icon {
          display: none !important;
        }
      `}</style>
      <div
        style={{
          padding: "8px 20px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          borderBottom: `1px solid ${theme.borderLight}`,
          background: "white",
        }}
      >
        <span style={{ fontSize: 12, color: theme.textMuted, marginRight: 4 }}>
          Zoom :
        </span>
        {(["day", "week", "month"] as const).map((level) => (
          <button
            key={level}
            onClick={() => applyZoom(level)}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              border: `1px solid ${theme.borderLight}`,
              background: zoomLevel === level ? theme.primary : "white",
              color: zoomLevel === level ? "white" : theme.textDark,
              fontSize: 12,
              cursor: "pointer",
              fontWeight: zoomLevel === level ? 600 : 400,
            }}
          >
            {level === "day" ? "Jour" : level === "week" ? "Semaine" : "Mois"}
          </button>
        ))}
      </div>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          width: "100%",
          fontFamily: theme.fontFamily,
        }}
      />
    </div>
  );
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
