import { useEffect, useRef, useState } from "react";
import { gantt } from "dhtmlx-gantt";
import "dhtmlx-gantt/codebase/dhtmlxgantt.css";
import type { EpicTask } from "../types";
import { theme } from "../styles/theme";

interface GanttChartProps {
  tasks: EpicTask[];
}

export function GanttChart({ tasks }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
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
      // Configure Gantt
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

      // Left-side columns
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

      // Timeline scales
      gantt.config.scales = [
        { unit: "month", step: 1, format: "%M %Y" },
        { unit: "week", step: 1, format: "W%W" },
      ];

      // Custom task color based on phase
      gantt.templates.task_class = (_start: Date, _end: Date, task: any) => {
        return task.phaseClass || "";
      };

      // Tooltip
      gantt.templates.tooltip_text = (
        start: Date,
        end: Date,
        task: any
      ) => {
        const startStr = start.toLocaleDateString("fr-FR");
        const endStr = end.toLocaleDateString("fr-FR");
        return `<b>${task.phaseName || task.text}</b><br/>
                ${startStr} — ${endStr}`;
      };

      // Style: white headers
      gantt.templates.scale_cell_class = () => "gantt-white-header";

      // Row alternation
      gantt.templates.grid_row_class = (_start: Date, _end: Date, task: any) => {
        return task.$index % 2 === 0 ? "" : "gantt-row-alt";
      };
      gantt.templates.task_row_class = (_start: Date, _end: Date, task: any) => {
        return task.$index % 2 === 0 ? "" : "gantt-row-alt";
      };

      gantt.init(containerRef.current);
      initialized.current = true;
    }

    // Convert EpicTasks to DHTMLX format
    const ganttData: any[] = [];

    tasks.forEach((epic) => {
      // Parent project row (invisible bar, just groups phases)
      ganttData.push({
        id: epic.id,
        text: epic.epicName,
        status: epic.status,
        start_date: null,
        duration: 0,
        type: "project",
        open: true,
        render: "split",
      });

      // One child task per phase
      epic.phases.forEach((phase) => {
        ganttData.push({
          id: phase.id,
          text: "",
          phaseName: phase.phaseName,
          start_date: formatDate(phase.startDate),
          end_date: formatDate(phase.endDate),
          parent: epic.id,
          color: phase.color,
          textColor: "transparent",
        });
      });
    });

    gantt.clearAll();
    gantt.parse({
      data: ganttData,
      links: [],
    });

    return () => {
      // Don't destroy on re-render, just clear data
    };
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
        .gantt_task_line {
          border-radius: 4px !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12) !important;
          border: none !important;
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
        .gantt_grid_data .gantt_row.gantt_project .gantt_cell {
          font-weight: 500 !important;
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
