import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EpicTask, DisplayRow } from "../types";
import { theme } from "../styles/theme";

interface GanttChartProps {
  tasks: EpicTask[];
  displayRows: DisplayRow[];
}

type ZoomLevel = "day" | "week" | "month" | "quarter";

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
    subUnit: "day",
  },
  quarter: {
    dayWidth: 1.2,
    headerFormat: (d) => String(d.getFullYear()),
    subFormat: (d) => d.toLocaleDateString("en-GB", { month: "short" }),
    subUnit: "day",
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

interface AlertInfo {
  epicId: number;
  details: string[];
}

/**
 * Detect status/date mismatches based on today's date.
 * Rules:
 * - Analysis end date passed → status should NOT be "Backlog", "Scoping RFC", "In definition"
 * - Development start date passed → status should be at least "In Progress"
 * - QA start date passed → status should be at least "In Progress"
 * - Customer UAT start date passed → status should be "Pending Customer UAT" or "Pending Internal UAT"
 * - Pilot start date passed → project should be done with UAT
 */
function detectAlerts(tasks: EpicTask[]): Map<number, AlertInfo> {
  const result = new Map<number, AlertInfo>();
  const today = toDayValue(new Date());

  const PRE_ANALYSIS = ["Backlog", "Scoping RFC", "In definition", "To Do"];
  const PRE_DEV = ["Backlog", "Scoping RFC", "In definition", "To Do"];
  const PRE_UAT = ["Backlog", "Scoping RFC", "In definition", "To Do", "In Progress"];

  for (const epic of tasks) {
    const phaseMap = new Map(epic.phases.map((p) => [p.phaseName, p]));
    const status = epic.status.trim();
    const details: string[] = [];

    // Analysis should be done → status should not be pre-analysis
    const analysis = phaseMap.get("Analysis");
    if (analysis && toDayValue(analysis.endDate) < today && PRE_ANALYSIS.includes(status)) {
      details.push(`Analysis ended ${analysis.endDate.toLocaleDateString("en-GB")} but status is still "${status}"`);
    }

    // Dev should have started → status should be at least In Progress
    const dev = phaseMap.get("Development");
    if (dev && toDayValue(dev.startDate) < today && PRE_DEV.includes(status)) {
      details.push(`Development started ${dev.startDate.toLocaleDateString("en-GB")} but status is still "${status}"`);
    }

    // QA should have started → status should be at least In Progress
    const qa = phaseMap.get("QA / Test");
    if (qa && toDayValue(qa.startDate) < today && PRE_DEV.includes(status)) {
      details.push(`QA started ${qa.startDate.toLocaleDateString("en-GB")} but status is still "${status}"`);
    }

    // UAT should have started → status should be Pending Customer UAT or Pending Internal UAT
    const uat = phaseMap.get("Customer UAT");
    if (uat && toDayValue(uat.startDate) < today && PRE_UAT.includes(status)) {
      details.push(`Customer UAT started ${uat.startDate.toLocaleDateString("en-GB")} but status is still "${status}"`);
    }

    // Pilot should have started → status should not be pre-UAT
    const pilot = phaseMap.get("Pilot");
    if (pilot && toDayValue(pilot.startDate) < today && PRE_UAT.includes(status)) {
      details.push(`Pilot started ${pilot.startDate.toLocaleDateString("en-GB")} but status is still "${status}"`);
    }

    if (details.length > 0) {
      result.set(epic.id, { epicId: epic.id, details });
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

export function GanttChart({ tasks, displayRows }: GanttChartProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const [showInconsistencies, setShowInconsistencies] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverInfo | null>(null);
  const [colWidths, setColWidths] = useState({ product: 100, acto: 80, epicName: 250, status: 120 });
  const scrollRef = useRef<HTMLDivElement>(null);

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
  const alerts = useMemo(() => detectAlerts(tasks), [tasks]);

  // Scroll to the phase closest to today for a given epic
  function scrollToClosestPhase(epic: EpicTask) {
    if (!scrollRef.current || epic.phases.length === 0) return;
    const today = new Date().getTime();
    let closestPhase = epic.phases[0];
    let closestDist = Infinity;
    for (const phase of epic.phases) {
      // Distance = 0 if today is within the phase, otherwise distance to nearest edge
      const start = phase.startDate.getTime();
      const end = phase.endDate.getTime();
      const dist = today >= start && today <= end ? 0 : Math.min(Math.abs(today - start), Math.abs(today - end));
      if (dist < closestDist) {
        closestDist = dist;
        closestPhase = phase;
      }
    }
    const phaseMiddle = dayOffset(new Date((closestPhase.startDate.getTime() + closestPhase.endDate.getTime()) / 2));
    const containerWidth = scrollRef.current.clientWidth;
    scrollRef.current.scrollLeft = phaseMiddle - containerWidth / 2;
  }

  // Check if an epic is currently in a given phase (today is between start and end)
  const isInPhaseToday = useCallback((epic: EpicTask, phaseName: string): boolean => {
    const today = new Date();
    const phase = epic.phases.find((p) => p.phaseName === phaseName);
    if (!phase) return false;
    return today >= phase.startDate && today <= phase.endDate;
  }, []);

  const displayedRows: DisplayRow[] = useMemo(() => {
    let rows = displayRows;
    if (showInconsistencies) {
      rows = rows.filter((r) => {
        if (r.type === "initiative") {
          return r.children?.some((c) => inconsistencies.has(c.id));
        }
        return inconsistencies.has(r.epic.id);
      });
    }
    if (showAlerts) {
      rows = rows.filter((r) => {
        if (r.type === "initiative") {
          return r.children?.some((c) => alerts.has(c.id));
        }
        return alerts.has(r.epic.id);
      });
    }
    if (phaseFilter) {
      rows = rows.filter((r) => {
        if (r.type === "initiative") {
          return r.children?.some((c) => isInPhaseToday(c, phaseFilter));
        }
        return isInPhaseToday(r.epic, phaseFilter);
      });
    }
    return rows;
  }, [displayRows, showInconsistencies, showAlerts, phaseFilter, inconsistencies, alerts, isInPhaseToday]);

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
  const { yearHeaders, quarterHeaders, mainHeaders, subHeaders } = useMemo(() => {
    const mains: { label: string; left: number; width: number }[] = [];
    const subs: { label: string; left: number; width: number }[] = [];

    if (zoom === "quarter") {
      // Quarter view: no main/sub headers beyond Year+Quarter (already handled)
    } else if (zoom === "month") {
      // Sub: months
      const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      while (cursor <= maxDate) {
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

    // Year headers (always top row)
    const yrs: { label: string; left: number; width: number }[] = [];
    const yCursor = new Date(minDate.getFullYear(), 0, 1);
    while (yCursor <= maxDate) {
      const yearStart = new Date(yCursor.getFullYear(), 0, 1);
      const yearEnd = new Date(yCursor.getFullYear() + 1, 0, 1);
      const yl = dayOffset(yearStart < minDate ? minDate : yearStart);
      const yr = dayOffset(yearEnd > maxDate ? maxDate : yearEnd);
      yrs.push({ label: String(yCursor.getFullYear()), left: yl, width: yr - yl });
      yCursor.setFullYear(yCursor.getFullYear() + 1);
    }

    // Quarter headers (always second row, just Q1/Q2/Q3/Q4)
    const qtrs: { label: string; left: number; width: number }[] = [];
    const qCursor = new Date(minDate.getFullYear(), Math.floor(minDate.getMonth() / 3) * 3, 1);
    while (qCursor <= maxDate) {
      const qEnd = new Date(qCursor.getFullYear(), qCursor.getMonth() + 3, 1);
      const ql = dayOffset(qCursor < minDate ? minDate : qCursor);
      const qr = dayOffset(qEnd > maxDate ? maxDate : qEnd);
      qtrs.push({
        label: `Q${Math.floor(qCursor.getMonth() / 3) + 1}`,
        left: ql,
        width: qr - ql,
      });
      qCursor.setMonth(qCursor.getMonth() + 3);
    }

    return { yearHeaders: yrs, quarterHeaders: qtrs, mainHeaders: mains, subHeaders: subs };
  }, [minDate, maxDate, zoom, config, totalDays]);

  // Weekly separator lines
  const weekLines = useMemo(() => {
    const lines: number[] = [];
    const cursor = new Date(minDate);
    // Advance to next Monday
    cursor.setDate(cursor.getDate() + ((8 - cursor.getDay()) % 7));
    while (cursor <= maxDate) {
      lines.push(dayOffset(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return lines;
  }, [minDate, maxDate, config.dayWidth]);

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

  // Scroll to today on initial load and when data changes
  useEffect(() => {
    if (scrollRef.current && displayedRows.length > 0) {
      const todayX = dayOffset(new Date());
      const containerWidth = scrollRef.current.clientWidth;
      scrollRef.current.scrollLeft = todayX - containerWidth / 3;
    }
  }, [displayedRows.length, zoom]);

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

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
            {popover.phaseName === "QA / Test" ? "QA" : popover.phaseName}
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
        {(["day", "week", "month", "quarter"] as const).map((level) => (
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
            {level === "day" ? "Day" : level === "week" ? "Week" : level === "month" ? "Month" : "Quarter"}
          </button>
        ))}
        {/* Go to today */}
        <button
          onClick={() => {
            if (scrollRef.current) {
              const todayX = dayOffset(new Date());
              const containerWidth = scrollRef.current.clientWidth;
              scrollRef.current.scrollLeft = todayX - containerWidth / 2;
            }
          }}
          style={{
            marginLeft: 16,
            padding: "4px 14px",
            borderRadius: 6,
            border: `1px solid #e03131`,
            background: "white",
            color: "#e03131",
            fontSize: 12,
            cursor: "pointer",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>|</span> Today
        </button>

        {/* Inconsistency toggle */}
        <button
          onClick={() => {
            setShowInconsistencies(!showInconsistencies);
            if (!showInconsistencies) setShowAlerts(false);
          }}
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

        {/* Alert toggle */}
        <button
          onClick={() => {
            setShowAlerts(!showAlerts);
            if (!showAlerts) setShowInconsistencies(false);
          }}
          style={{
            padding: "4px 14px",
            borderRadius: 6,
            border: showAlerts ? "2px solid #e67700" : `1px solid ${theme.borderLight}`,
            background: showAlerts ? "#fff8e1" : "white",
            color: showAlerts ? "#e67700" : theme.textDark,
            fontSize: 12,
            cursor: "pointer",
            fontWeight: showAlerts ? 600 : 400,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {showAlerts ? `🔔 ${alerts.size} alerts` : "🔔 Alerts"}
        </button>

        {/* Legend — clickable to filter by phase */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          {[
            { label: "Analysis", color: "#ffd43b" },
            { label: "Development", color: "#ff922b" },
            { label: "QA / Test", color: "#51cf66", displayLabel: "QA" },
            { label: "Customer UAT", color: "#339af0" },
            { label: "Pilot", color: "#1864ab" },
          ].map((p) => {
            const active = phaseFilter === p.label;
            return (
              <button
                key={p.label}
                onClick={() => {
                  setPhaseFilter(active ? null : p.label);
                  if (!active) {
                    setShowInconsistencies(false);
                    setShowAlerts(false);
                    // Scroll to today
                    if (scrollRef.current) {
                      const todayX = dayOffset(new Date());
                      const containerWidth = scrollRef.current.clientWidth;
                      scrollRef.current.scrollLeft = todayX - containerWidth / 2;
                    }
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  color: active ? "white" : theme.textDark,
                  background: active ? p.color : "transparent",
                  border: active ? `2px solid ${p.color}` : "1px solid transparent",
                  borderRadius: 6,
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span style={{ width: 12, height: 12, background: active ? "white" : p.color, borderRadius: 2, display: "inline-block", flexShrink: 0 }} />
                {"displayLabel" in p ? p.displayLabel : p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Fixed headers row */}
      <div style={{ display: "flex", flexShrink: 0, borderBottom: `2px solid ${theme.borderLight}` }}>
        {/* Grid header */}
        <div
          style={{
            width: gridTotalWidth,
            flexShrink: 0,
            display: "flex",
            background: "white",
            borderRight: `2px solid ${theme.borderLight}`,
            height: 22 * 2 + (mainHeaders.length > 0 ? 22 : 0) + (subHeaders.length > 0 ? 22 : 0) + 2,
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
            Project Name
            <div style={RESIZE_HANDLE} onMouseDown={(e) => startResize("epicName", e)} />
          </div>
          <div style={{ width: colWidths.status, position: "relative", padding: "0 8px", fontWeight: 700, fontSize: 12, color: theme.textDark, textAlign: "left", height: "100%", display: "flex", alignItems: "center" }}>
            Status
            <div style={RESIZE_HANDLE} onMouseDown={(e) => startResize("status", e)} />
          </div>
        </div>
        {/* Timeline header — synced with horizontal scroll */}
        <div
          ref={timelineHeaderRef}
          style={{ flex: 1, overflow: "hidden" }}
        >
          <div style={{ width: totalWidth, position: "relative" }}>
            {/* Year row */}
            <div style={{ height: 22, position: "relative", borderBottom: `1px solid ${theme.borderLight}` }}>
              {yearHeaders.map((h, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: h.left,
                    width: h.width,
                    height: 22,
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
            {/* Quarter row */}
            <div style={{ height: 22, position: "relative", borderBottom: `1px solid ${theme.borderLight}` }}>
              {quarterHeaders.map((h, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: h.left,
                    width: h.width,
                    height: 22,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: theme.primary,
                    borderRight: `1px solid ${theme.borderLight}`,
                    background: theme.filterBarBg,
                  }}
                >
                  {h.label}
                </div>
              ))}
            </div>
            {/* Main headers (month names for week/day views) */}
            {mainHeaders.length > 0 && (
              <div style={{ height: 22, position: "relative", borderBottom: `1px solid ${theme.borderLight}` }}>
                {mainHeaders.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: h.left,
                      width: h.width,
                      height: 22,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 600,
                      color: theme.textDark,
                      borderRight: `1px solid ${theme.borderLight}`,
                      background: "white",
                    }}
                  >
                    {h.label}
                  </div>
                ))}
              </div>
            )}
            {/* Sub headers (months, weeks, or days) */}
            {subHeaders.length > 0 && (
              <div style={{ height: 22, position: "relative" }}>
                {subHeaders.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: h.left,
                      width: h.width,
                      height: 22,
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
            )}
          </div>
        </div>
      </div>

      {/* Single scroll container — grid sticky left, headers sticky top */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflow: "auto" }}
      >
        <div style={{ display: "inline-flex", minWidth: "100%", minHeight: "min-content" }}>
          {/* Left grid — sticky left */}
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
            {displayedRows.map((row, i) => {
              const epic = row.epic;
              const isInitiative = row.type === "initiative";
              const isInconsistent = showInconsistencies && inconsistencies.has(epic.id);
              const info = isInconsistent ? inconsistencies.get(epic.id) : null;
              const isAlerted = showAlerts && alerts.has(epic.id);
              const alertInfo = isAlerted ? alerts.get(epic.id) : null;
              const isHighlighted = isInconsistent || isAlerted;
              const highlightColor = isInconsistent ? "#e03131" : "#e67700";
              const highlightBg = isInconsistent ? "#fff0f0" : "#fff8e1";
              const defaultBg = isInitiative ? "#f0ecff" : i % 2 === 0 ? "white" : theme.rowAlt;
              return (
                <div
                  key={`grid-${row.type}-${epic.id}`}
                  title={info ? info.details.join("\n") : alertInfo ? alertInfo.details.join("\n") : undefined}
                  onClick={() => !isInitiative && scrollToClosestPhase(epic)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    height: ROW_HEIGHT,
                    borderBottom: `1px solid ${theme.borderRow}`,
                    background: isHighlighted ? highlightBg : defaultBg,
                    borderLeft: isHighlighted ? `3px solid ${highlightColor}` : isInitiative ? `3px solid ${theme.primary}` : "3px solid transparent",
                    cursor: isInitiative ? "default" : "pointer",
                  }}
                >
                  <div
                    style={{
                      width: colWidths.product,
                      fontSize: 11,
                      fontWeight: isInitiative ? 700 : 400,
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
                    {isInitiative ? "" : (epic.rawData["Custom field (Product)"] || "—")}
                  </div>
                  <div
                    style={{
                      width: colWidths.acto,
                      fontSize: 11,
                      fontWeight: isInitiative ? 700 : 400,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      paddingLeft: 8,
                      paddingRight: 8,
                      borderRight: `1px solid ${theme.borderRow}`,
                    }}
                    title={epic.epicKey || ""}
                  >
                    {epic.epicKey ? (
                      <a
                        href={`https://imawebgroup.atlassian.net/browse/${epic.epicKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          color: theme.primary,
                          textDecoration: "none",
                          fontWeight: isInitiative ? 700 : 500,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                        onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                      >
                        {epic.epicKey}
                      </a>
                    ) : "—"}
                  </div>
                  <div
                    style={{
                      width: colWidths.epicName,
                      fontSize: 13,
                      fontWeight: isInitiative ? 700 : 500,
                      color: isHighlighted ? highlightColor : isInitiative ? theme.primary : theme.textDark,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      padding: isInitiative ? "0 12px" : "0 12px 0 24px",
                      borderRight: `1px solid ${theme.borderRow}`,
                      boxSizing: "border-box",
                    }}
                    title={epic.epicName}
                  >
                    {epic.epicName}
                  </div>
                  <div style={{ width: colWidths.status, textAlign: "left", padding: "0 8px", boxSizing: "border-box" }}>
                    {epic.status && (
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
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Timeline */}
          <div style={{ width: totalWidth, position: "relative" }}>
            {/* Today indicator */}
            {(() => {
              const todayX = dayOffset(new Date());
              if (todayX >= 0 && todayX <= totalWidth) {
                return (
                  <div
                    style={{
                      position: "absolute",
                      left: todayX,
                      top: 0,
                      height: displayedRows.length * ROW_HEIGHT,
                      width: 2,
                      background: "#e03131",
                      zIndex: 5,
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -6,
                        left: -4,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "#e03131",
                      }}
                    />
                  </div>
                );
              }
              return null;
            })()}

            {/* Weekly separator lines */}
            {weekLines.map((x, idx) => (
              <div
                key={`wl-${idx}`}
                style={{
                  position: "absolute",
                  left: x,
                  top: 0,
                  height: displayedRows.length * ROW_HEIGHT,
                  width: 1,
                  background: theme.borderRow,
                  zIndex: 0,
                  pointerEvents: "none",
                }}
              />
            ))}

            {displayedRows.map((row, i) => {
              const epic = row.epic;
              const isInitiative = row.type === "initiative";
              const isInconsistent = showInconsistencies && inconsistencies.has(epic.id);
              const info = isInconsistent ? inconsistencies.get(epic.id) : null;
              const isAlerted = showAlerts && alerts.has(epic.id);
              const isHighlighted = isInconsistent || isAlerted;
              const highlightBg = isInconsistent ? "#fff0f0" : "#fff8e1";
              const defaultBg = isInitiative ? "#f0ecff" : i % 2 === 0 ? "white" : theme.rowAlt;
              return (
                <div
                  key={`tl-${row.type}-${epic.id}`}
                  style={{
                    height: ROW_HEIGHT,
                    position: "relative",
                    borderBottom: `1px solid ${theme.borderRow}`,
                    background: isHighlighted ? highlightBg : defaultBg,
                  }}
                >
                  {/* Initiative: show a bar spanning all children phases */}
                  {isInitiative && epic.phases.length > 0 && (() => {
                    const allDates = epic.phases.flatMap((p) => [p.startDate, p.endDate]);
                    const minLeft = dayOffset(new Date(Math.min(...allDates.map((d) => d.getTime()))));
                    const maxRight = dayOffset(new Date(Math.max(...allDates.map((d) => d.getTime()))));
                    const w = maxRight - minLeft;
                    if (w <= 0) return null;
                    return (
                      <div
                        style={{
                          position: "absolute",
                          left: minLeft,
                          top: BAR_TOP,
                          width: w,
                          height: BAR_HEIGHT,
                          borderRadius: 4,
                          background: `${theme.primary}30`,
                          border: `2px solid ${theme.primary}`,
                          pointerEvents: "none",
                          zIndex: 1,
                        }}
                      />
                    );
                  })()}
                  {/* Epic: show individual phase bars */}
                  {!isInitiative && (
                    <>
                      {/* Project outline spanning all visible phases */}
                      {epic.phases.length > 0 && (() => {
                        const visible = epic.phases
                          .filter((p) => dayOffset(p.endDate) - dayOffset(p.startDate) > 0)
                          .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
                        if (visible.length < 2) return null;
                        const minLeft = dayOffset(visible[0].startDate);
                        const maxRight = dayOffset(visible[visible.length - 1].endDate);
                        return (
                          <div
                            style={{
                              position: "absolute",
                              left: minLeft - 2,
                              top: BAR_TOP - 2,
                              width: maxRight - minLeft + 4,
                              height: BAR_HEIGHT + 4,
                              borderRadius: 6,
                              border: `1.5px solid ${isInconsistent ? "#e03131" : "#c9c9d0"}`,
                              pointerEvents: "none",
                              zIndex: 0,
                            }}
                          />
                        );
                      })()}
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
                              setPopover(
                                popover?.phaseId === phase.id
                                  ? null
                                  : {
                                      phaseId: phase.id,
                                      phaseName: phase.phaseName,
                                      startDate: phase.startDate,
                                      endDate: phase.endDate,
                                      x: e.clientX,
                                      y: e.clientY - 10,
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
                    </>
                  )}
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
