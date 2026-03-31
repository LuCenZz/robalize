import { useEffect, useMemo, useRef, useState } from "react";
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

// Expected phase order: each phase must start after the previous one starts,
// and must start after the previous one ends.
const PHASE_ORDER = ["Analysis", "Development", "QA / Test", "Customer UAT", "Pilot"];

interface InconsistencyInfo {
  epicId: number;
  conflictingPhases: Set<string>; // phase names involved in conflicts
  details: string[];
}

function toDayValue(d: Date): number {
  return Math.floor(d.getTime() / 86400000);
}

function detectInconsistencies(tasks: EpicTask[]): Map<number, InconsistencyInfo> {
  const result = new Map<number, InconsistencyInfo>();
  const today = toDayValue(new Date());

  for (const epic of tasks) {
    // Skip epics where all phases are in the past
    const lastEnd = Math.max(...epic.phases.map((p) => toDayValue(p.endDate)));
    if (lastEnd < today) continue;

    const phaseMap = new Map(epic.phases.map((p) => [p.phaseName, p]));
    const presentPhases = PHASE_ORDER.filter((name) => phaseMap.has(name));
    const conflicts = new Set<string>();
    const details: string[] = [];

    for (let i = 0; i < presentPhases.length - 1; i++) {
      const current = phaseMap.get(presentPhases[i])!;
      const next = phaseMap.get(presentPhases[i + 1])!;

      const curStart = toDayValue(current.startDate);
      const curEnd = toDayValue(current.endDate);
      const nextStart = toDayValue(next.startDate);

      // Rule 1: next phase starts before current phase starts
      if (nextStart < curStart) {
        conflicts.add(current.phaseName);
        conflicts.add(next.phaseName);
        details.push(
          `${next.phaseName} starts before ${current.phaseName} starts`
        );
      }

      // Rule 2: next phase starts strictly before current phase ends (same day is OK)
      if (nextStart < curEnd) {
        conflicts.add(current.phaseName);
        conflicts.add(next.phaseName);
        details.push(
          `${next.phaseName} starts before ${current.phaseName} ends`
        );
      }
    }

    if (conflicts.size > 0) {
      result.set(epic.id, { epicId: epic.id, conflictingPhases: conflicts, details });
    }
  }

  return result;
}

interface PopoverInfo {
  phaseId: string;
  phaseName: string;
  startDate: Date;
  endDate: Date;
  x: number;
  y: number;
}

const RESIZE_HANDLE: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: 0,
  bottom: 0,
  width: 5,
  cursor: "col-resize",
  zIndex: 2,
};

export function GanttChart({ tasks }: GanttChartProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const [showInconsistencies, setShowInconsistencies] = useState(false);
  const [popover, setPopover] = useState<PopoverInfo | null>(null);
  const [colWidths, setColWidths] = useState({ product: 100, acto: 80, epicName: 250, status: 120 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const timelineHeaderRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ col: keyof typeof colWidths; startX: number; startW: number } | null>(null);

  const gridTotalWidth = colWidths.product + colWidths.acto + colWidths.epicName + colWidths.status;

  function startResize(col: keyof typeof colWidths, e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { col, startX: e.clientX, startW: colWidths[col] };
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const newW = Math.max(40, dragRef.current.startW + ev.clientX - dragRef.current.startX);
      setColWidths((prev) => ({ ...prev, [dragRef.current!.col]: newW }));
    }
    function onUp() {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const inconsistencies = useMemo(() => detectInconsistencies(tasks), [tasks]);

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


  // Close popover on click outside
  useEffect(() => {
    if (!popover) return;
    function handleClick() {
      setPopover(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popover]);

  // Close popover on scroll
  useEffect(() => {
    if (!popover) return;
    function handleScroll() {
      setPopover(null);
    }
    const el = scrollRef.current;
    el?.addEventListener("scroll", handleScroll);
    return () => el?.removeEventListener("scroll", handleScroll);
  }, [popover]);

  const formatDate = (d: Date) =>
    d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

  const durationDays = (start: Date, end: Date) =>
    Math.round((end.getTime() - start.getTime()) / 86400000);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Phase popover */}
      {popover && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: popover.x,
            top: popover.y - 8,
            transform: "translate(-50%, -100%)",
            background: "white",
            borderRadius: 10,
            boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
            border: `1px solid ${theme.borderLight}`,
            padding: "12px 16px",
            zIndex: 1000,
            minWidth: 200,
            fontFamily: theme.fontFamily,
          }}
        >
          {/* Arrow */}
          <div
            style={{
              position: "absolute",
              bottom: -6,
              left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              width: 12,
              height: 12,
              background: "white",
              borderRight: `1px solid ${theme.borderLight}`,
              borderBottom: `1px solid ${theme.borderLight}`,
            }}
          />
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.textDark, marginBottom: 8 }}>
            {popover.phaseName}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 12 }}>
              <span style={{ color: theme.textMuted }}>Start</span>
              <span style={{ fontWeight: 500, color: theme.textDark }}>{formatDate(popover.startDate)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 12 }}>
              <span style={{ color: theme.textMuted }}>End</span>
              <span style={{ fontWeight: 500, color: theme.textDark }}>{formatDate(popover.endDate)}</span>
            </div>
            <div
              style={{
                marginTop: 4,
                paddingTop: 6,
                borderTop: `1px solid ${theme.borderLight}`,
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                fontSize: 12,
              }}
            >
              <span style={{ color: theme.textMuted }}>Duration</span>
              <span style={{ fontWeight: 500, color: theme.primary }}>
                {durationDays(popover.startDate, popover.endDate)} days
              </span>
            </div>
          </div>
        </div>
      )}

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
        {/* Inconsistency toggle */}
        <button
          onClick={() => setShowInconsistencies(!showInconsistencies)}
          style={{
            marginLeft: 16,
            padding: "4px 14px",
            borderRadius: 6,
            border: showInconsistencies ? "2px solid #e03131" : `1px solid ${theme.borderLight}`,
            background: showInconsistencies ? "#fff5f5" : "white",
            color: showInconsistencies ? "#e03131" : theme.textDark,
            fontSize: 12,
            cursor: "pointer",
            fontWeight: showInconsistencies ? 600 : 400,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {showInconsistencies ? `⚠ ${inconsistencies.size} inconsistencies` : "⚠ Check dates"}
        </button>

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

      {/* Single scroll container — grid is sticky left, timeline scrolls horizontally */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          if (timelineHeaderRef.current) {
            timelineHeaderRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
        style={{ flex: 1, overflow: "auto" }}
      >
        <div style={{ display: "inline-flex", minWidth: "100%", minHeight: "min-content" }}>
          {/* Left grid — sticky */}
          <div
            style={{
              position: "sticky",
              left: 0,
              zIndex: 10,
              width: gridTotalWidth,
              flexShrink: 0,
              background: "white",
              borderRight: `2px solid ${theme.borderLight}`,
            }}
          >
            {/* Grid header */}
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 12,
                display: "flex",
                background: "white",
                borderBottom: `2px solid ${theme.borderLight}`,
                height: 54,
                alignItems: "center",
              }}
            >
              <div style={{ width: colWidths.product, position: "relative", padding: "0 8px", fontWeight: 700, fontSize: 11, color: theme.textDark, borderRight: `1px solid ${theme.borderRow}`, height: "100%", display: "flex", alignItems: "center" }}>
                Product
                <div style={RESIZE_HANDLE} onMouseDown={(e) => startResize("product", e)} />
              </div>
              <div style={{ width: colWidths.acto, position: "relative", padding: "0 8px", fontWeight: 700, fontSize: 11, color: theme.textDark, borderRight: `1px solid ${theme.borderRow}`, height: "100%", display: "flex", alignItems: "center" }}>
                ACTO
                <div style={RESIZE_HANDLE} onMouseDown={(e) => startResize("acto", e)} />
              </div>
              <div style={{ width: colWidths.epicName, position: "relative", padding: "0 12px", fontWeight: 700, fontSize: 12, color: theme.textDark, borderRight: `1px solid ${theme.borderRow}`, height: "100%", display: "flex", alignItems: "center" }}>
                Epic Name
                <div style={RESIZE_HANDLE} onMouseDown={(e) => startResize("epicName", e)} />
              </div>
              <div style={{ width: colWidths.status, position: "relative", padding: "0 8px", fontWeight: 700, fontSize: 12, color: theme.textDark, textAlign: "left", height: "100%", display: "flex", alignItems: "center" }}>
                Status
                <div style={RESIZE_HANDLE} onMouseDown={(e) => startResize("status", e)} />
              </div>
            </div>
            {/* Grid rows */}
            {tasks.map((epic, i) => {
              const isInconsistent = showInconsistencies && inconsistencies.has(epic.id);
              const info = isInconsistent ? inconsistencies.get(epic.id) : null;
              const defaultBg = i % 2 === 0 ? "white" : theme.rowAlt;
              return (
                <div
                  key={epic.id}
                  title={info ? info.details.join("\n") : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    height: ROW_HEIGHT,
                    borderBottom: `1px solid ${theme.borderRow}`,
                    background: isInconsistent ? "#fff0f0" : defaultBg,
                    borderLeft: isInconsistent ? "3px solid #e03131" : "3px solid transparent",
                  }}
                >
                  <div
                    style={{
                      width: colWidths.product,
                      fontSize: 11,
                      color: theme.textDark,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      padding: "0 8px",
                      borderRight: `1px solid ${theme.borderRow}`,
                      boxSizing: "border-box",
                    }}
                    title={epic.rawData["Custom field (Product)"] || ""}
                  >
                    {epic.rawData["Custom field (Product)"] || "—"}
                  </div>
                  <div
                    style={{
                      width: colWidths.acto,
                      fontSize: 11,
                      color: theme.textDark,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      paddingLeft: 8,
                      paddingRight: 8,
                      borderRight: `1px solid ${theme.borderRow}`,
                    }}
                    title={epic.rawData["Issue key"] || ""}
                  >
                    {epic.rawData["Issue key"] || "—"}
                  </div>
                  <div
                    style={{
                      width: colWidths.epicName,
                      fontSize: 13,
                      fontWeight: 500,
                      color: isInconsistent ? "#e03131" : theme.textDark,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      padding: "0 12px",
                      borderRight: `1px solid ${theme.borderRow}`,
                      boxSizing: "border-box",
                    }}
                    title={epic.epicName}
                  >
                    {epic.epicName}
                  </div>
                  <div style={{ width: colWidths.status, textAlign: "left", padding: "0 8px", boxSizing: "border-box" }}>
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
              );
            })}
          </div>

          {/* Right: Timeline */}
          <div style={{ width: totalWidth }}>
            {/* Timeline header — sticky top */}
            <div
              ref={timelineHeaderRef}
              style={{
                position: "sticky",
                top: 0,
                zIndex: 11,
                background: "white",
                borderBottom: `2px solid ${theme.borderLight}`,
              }}
            >
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
              <div style={{ height: 26, position: "relative" }}>
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

            {/* Timeline rows */}
            {tasks.map((epic, i) => {
              const isInconsistent = showInconsistencies && inconsistencies.has(epic.id);
              const info = isInconsistent ? inconsistencies.get(epic.id) : null;
              const defaultBg = i % 2 === 0 ? "white" : theme.rowAlt;
              return (
                <div
                  key={epic.id}
                  style={{
                    height: ROW_HEIGHT,
                    position: "relative",
                    borderBottom: `1px solid ${theme.borderRow}`,
                    background: isInconsistent ? "#fff0f0" : defaultBg,
                  }}
                >
                  {epic.phases.map((phase) => {
                    const left = dayOffset(phase.startDate);
                    const width = dayOffset(phase.endDate) - left;
                    if (width <= 0) return null;
                    const isConflicting = info?.conflictingPhases.has(phase.phaseName);
                    return (
                      <div
                        key={phase.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setPopover(
                            popover?.phaseId === phase.id
                              ? null
                              : {
                                  phaseId: phase.id,
                                  phaseName: phase.phaseName,
                                  startDate: phase.startDate,
                                  endDate: phase.endDate,
                                  x: rect.left + rect.width / 2,
                                  y: rect.top,
                                }
                          );
                        }}
                        style={{
                          position: "absolute",
                          left,
                          top: BAR_TOP,
                          width,
                          height: BAR_HEIGHT,
                          background: phase.color,
                          borderRadius: 4,
                          boxShadow: popover?.phaseId === phase.id ? `0 0 0 2px ${theme.primary}` : "0 1px 3px rgba(0,0,0,0.12)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                          border: isConflicting ? "2px solid #e03131" : "none",
                        }}
                      >
                      </div>
                    );
                  })}
                </div>
              );
            })}
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
