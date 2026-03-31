import { useMemo, useRef, useState } from "react";
import type { EpicTask } from "../types";
import { theme } from "../styles/theme";

interface GanttChartProps {
  tasks: EpicTask[];
}

type ZoomLevel = "day" | "week" | "month";

const ZOOM_CONFIG: Record<ZoomLevel, { dayWidth: number; headerFormat: (d: Date) => string; subFormat: (d: Date) => string; subUnit: "day" | "week" }> = {
  day: {
    dayWidth: 30,
    headerFormat: (d) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
    subFormat: (d) => String(d.getDate()),
    subUnit: "day",
  },
  week: {
    dayWidth: 8,
    headerFormat: (d) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
    subFormat: (d) => `W${getWeekNumber(d)}`,
    subUnit: "week",
  },
  month: {
    dayWidth: 3,
    headerFormat: (d) => String(d.getFullYear()),
    subFormat: (d) => d.toLocaleDateString("en-GB", { month: "short" }),
    subUnit: "day", // unused for month
  },
};

const ROW_HEIGHT = 40;
const BAR_HEIGHT = 20;
const BAR_TOP = (ROW_HEIGHT - BAR_HEIGHT) / 2;

export function GanttChart({ tasks }: GanttChartProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  // Compute global date range
  const { minDate, maxDate } = useMemo(() => {
    let min: Date | null = null;
    let max: Date | null = null;
    for (const task of tasks) {
      for (const phase of task.phases) {
        if (!min || phase.startDate < min) min = phase.startDate;
        if (!max || phase.endDate > max) max = phase.endDate;
      }
    }
    // Add padding
    const pad = 14;
    const minD = min ? new Date(min.getTime() - pad * 86400000) : new Date();
    const maxD = max ? new Date(max.getTime() + pad * 86400000) : new Date();
    return { minDate: minD, maxDate: maxD };
  }, [tasks]);

  const config = ZOOM_CONFIG[zoom];
  const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000);
  const totalWidth = totalDays * config.dayWidth;

  function dayOffset(date: Date): number {
    return Math.round((date.getTime() - minDate.getTime()) / 86400000) * config.dayWidth;
  }

  // Generate timeline headers
  const { mainHeaders, subHeaders } = useMemo(() => {
    const mains: { label: string; left: number; width: number }[] = [];
    const subs: { label: string; left: number; width: number }[] = [];

    if (zoom === "month") {
      // Main: years, Sub: months
      const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      while (cursor <= maxDate) {
        const yearStart = new Date(cursor.getFullYear(), 0, 1);
        const yearEnd = new Date(cursor.getFullYear() + 1, 0, 1);
        const left = dayOffset(yearStart < minDate ? minDate : yearStart);
        const right = dayOffset(yearEnd > maxDate ? maxDate : yearEnd);
        if (mains.length === 0 || mains[mains.length - 1].label !== String(cursor.getFullYear())) {
          mains.push({ label: String(cursor.getFullYear()), left, width: right - left });
        }

        const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        const ml = dayOffset(monthStart < minDate ? minDate : monthStart);
        const mr = dayOffset(monthEnd > maxDate ? maxDate : monthEnd);
        subs.push({
          label: config.subFormat(cursor),
          left: ml,
          width: mr - ml,
        });

        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else if (zoom === "week") {
      // Main: months, Sub: weeks
      const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      while (cursor <= maxDate) {
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        const ml = dayOffset(cursor < minDate ? minDate : cursor);
        const mr = dayOffset(monthEnd > maxDate ? maxDate : monthEnd);
        mains.push({ label: config.headerFormat(cursor), left: ml, width: mr - ml });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      // Weeks
      const weekCursor = new Date(minDate);
      weekCursor.setDate(weekCursor.getDate() - weekCursor.getDay() + 1);
      while (weekCursor <= maxDate) {
        const weekEnd = new Date(weekCursor);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const wl = dayOffset(weekCursor < minDate ? minDate : weekCursor);
        const wr = dayOffset(weekEnd > maxDate ? maxDate : weekEnd);
        subs.push({ label: `W${getWeekNumber(weekCursor)}`, left: wl, width: wr - wl });
        weekCursor.setDate(weekCursor.getDate() + 7);
      }
    } else {
      // Day: Main: months, Sub: days
      const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      while (cursor <= maxDate) {
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        const ml = dayOffset(cursor < minDate ? minDate : cursor);
        const mr = dayOffset(monthEnd > maxDate ? maxDate : monthEnd);
        mains.push({ label: config.headerFormat(cursor), left: ml, width: mr - ml });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      const dayCursor = new Date(minDate);
      while (dayCursor <= maxDate) {
        const dl = dayOffset(dayCursor);
        subs.push({ label: String(dayCursor.getDate()), left: dl, width: config.dayWidth });
        dayCursor.setDate(dayCursor.getDate() + 1);
      }
    }

    return { mainHeaders: mains, subHeaders: subs };
  }, [minDate, maxDate, zoom, config, totalDays]);

  // Sync scroll between grid and timeline
  function handleTimelineScroll(e: React.UIEvent<HTMLDivElement>) {
    if (gridScrollRef.current) {
      gridScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  }

  function handleGridScroll(e: React.UIEvent<HTMLDivElement>) {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Zoom controls */}
      <div
        style={{
          padding: "8px 20px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          borderBottom: `1px solid ${theme.borderLight}`,
          background: "white",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, color: theme.textMuted, marginRight: 4 }}>
          Zoom:
        </span>
        {(["day", "week", "month"] as const).map((level) => (
          <button
            key={level}
            onClick={() => setZoom(level)}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              border: `1px solid ${theme.borderLight}`,
              background: zoom === level ? theme.primary : "white",
              color: zoom === level ? "white" : theme.textDark,
              fontSize: 12,
              cursor: "pointer",
              fontWeight: zoom === level ? 600 : 400,
            }}
          >
            {level === "day" ? "Day" : level === "week" ? "Week" : "Month"}
          </button>
        ))}
        {/* Legend */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center" }}>
          {[
            { label: "Analysis", color: "#ffd43b" },
            { label: "Development", color: "#ff922b" },
            { label: "QA / Test", color: "#51cf66" },
            { label: "Customer UAT", color: "#339af0" },
            { label: "Pilot", color: "#1864ab" },
          ].map((p) => (
            <span key={p.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: theme.textDark }}>
              <span style={{ width: 14, height: 14, background: p.color, borderRadius: 3, display: "inline-block" }} />
              {p.label}
            </span>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left grid: Epic names */}
        <div
          ref={gridScrollRef}
          onScroll={handleGridScroll}
          style={{
            width: 320,
            flexShrink: 0,
            borderRight: `2px solid ${theme.borderLight}`,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Grid header */}
          <div
            style={{
              display: "flex",
              background: "white",
              borderBottom: `2px solid ${theme.borderLight}`,
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1, padding: "8px 12px", fontWeight: 700, fontSize: 12, color: theme.textDark, lineHeight: "52px" }}>
              Epic Name
            </div>
            <div style={{ width: 90, padding: "8px 4px", fontWeight: 700, fontSize: 12, color: theme.textDark, textAlign: "center", lineHeight: "52px" }}>
              Status
            </div>
          </div>
          {/* Grid rows */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {tasks.map((epic, i) => (
              <div
                key={epic.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: ROW_HEIGHT,
                  borderBottom: `1px solid ${theme.borderRow}`,
                  background: i % 2 === 0 ? "white" : theme.rowAlt,
                  padding: "0 12px",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: 500,
                    color: theme.textDark,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={epic.epicName}
                >
                  {epic.epicName}
                </div>
                <div style={{ width: 90, textAlign: "center" }}>
                  <span
                    style={{
                      fontSize: 10,
                      background: `${theme.primary}22`,
                      color: theme.primary,
                      padding: "3px 8px",
                      borderRadius: 10,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {epic.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Timeline */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Timeline header */}
          <div style={{ overflowX: "hidden", flexShrink: 0 }}>
            <div style={{ width: totalWidth, position: "relative" }}>
              {/* Main headers */}
              <div style={{ height: 26, position: "relative", borderBottom: `1px solid ${theme.borderLight}` }}>
                {mainHeaders.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: h.left,
                      width: h.width,
                      height: 26,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: theme.textDark,
                      borderRight: `1px solid ${theme.borderLight}`,
                      background: "white",
                    }}
                  >
                    {h.label}
                  </div>
                ))}
              </div>
              {/* Sub headers */}
              <div style={{ height: 26, position: "relative", borderBottom: `2px solid ${theme.borderLight}` }}>
                {subHeaders.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: h.left,
                      width: h.width,
                      height: 26,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      color: theme.textMuted,
                      borderRight: `1px solid ${theme.borderRow}`,
                      background: "white",
                    }}
                  >
                    {h.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline body (scrollable) */}
          <div
            ref={scrollRef}
            onScroll={handleTimelineScroll}
            style={{ flex: 1, overflow: "auto" }}
          >
            <div style={{ width: totalWidth, position: "relative" }}>
              {tasks.map((epic, i) => (
                <div
                  key={epic.id}
                  style={{
                    height: ROW_HEIGHT,
                    position: "relative",
                    borderBottom: `1px solid ${theme.borderRow}`,
                    background: i % 2 === 0 ? "white" : theme.rowAlt,
                  }}
                >
                  {epic.phases.map((phase) => {
                    const left = dayOffset(phase.startDate);
                    const width = dayOffset(phase.endDate) - left;
                    if (width <= 0) return null;
                    return (
                      <div
                        key={phase.id}
                        title={`${phase.phaseName}: ${phase.startDate.toLocaleDateString("en-GB")} — ${phase.endDate.toLocaleDateString("en-GB")}`}
                        style={{
                          position: "absolute",
                          left,
                          top: BAR_TOP,
                          width,
                          height: BAR_HEIGHT,
                          background: phase.color,
                          borderRadius: 4,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        {width > 50 && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: phase.color === "#ffd43b" ? "#7a6400" : "white",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {phase.phaseName}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
