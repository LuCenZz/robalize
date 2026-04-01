import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EpicTask, DisplayRow } from "../types";
import { theme } from "../styles/theme";

interface GanttChartProps {
  tasks: EpicTask[];
  displayRows: DisplayRow[];
  resetKey?: number;
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

export function GanttChart({ tasks, displayRows, resetKey }: GanttChartProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const [showInconsistencies, setShowInconsistencies] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverInfo | null>(null);
  const [gridCollapsed, setGridCollapsed] = useState(false);

  // Reset internal filters when resetKey changes (triggered by FilterBar "Reset")
  useEffect(() => {
    setPhaseFilter(null);
    setShowInconsistencies(false);
    setShowAlerts(false);
    setSortCol(null);
    setSortDir(null);
    setColFilters({});
    setFilterDropdown(null);
  }, [resetKey]);
  const [colWidths, setColWidths] = useState({ product: 100, acto: 80, epicName: 250, status: 120, progress: 50 });
  const scrollRef = useRef<HTMLDivElement>(null);

  const timelineHeaderRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ col: keyof typeof colWidths; startX: number; startW: number } | null>(null);

  // Sort & quick filter state
  type SortDir = "asc" | "desc" | null;
  type ColKey = keyof typeof colWidths;
  const [sortCol, setSortCol] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});
  const [filterDropdown, setFilterDropdown] = useState<{ col: ColKey; rect: DOMRect } | null>(null);

  // Get cell text for a column
  function getCellText(epic: EpicTask, col: ColKey, isInitiative: boolean): string {
    if (isInitiative && col !== "epicName") return "";
    switch (col) {
      case "product": return epic.rawData["Custom field (Product)"] || "";
      case "acto": return epic.epicKey || "";
      case "epicName": return epic.epicName || "";
      case "status": return epic.status || "";
      case "progress": {
        const raw = epic.rawData["Custom field (% of progress)"];
        if (!raw || !raw.trim() || isInitiative) return "";
        const val = Math.round(parseFloat(raw));
        return isNaN(val) ? "" : String(val);
      }
      default: return "";
    }
  }

  const gridTotalWidth = colWidths.product + colWidths.acto + colWidths.epicName + colWidths.status + colWidths.progress;

  // Auto-fit column width on double-click
  function autoFitColumn(col: ColKey) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const fontSize = col === "epicName" ? 13 : 11;
    const fontWeight = 500;
    ctx.font = `${fontWeight} ${fontSize}px ${theme.fontFamily}`;
    let maxW = 0;
    // Measure header text
    const headerLabels: Record<ColKey, string> = { product: "Product", acto: "ACTO", epicName: "Project Name", status: "Status", progress: "%" };
    ctx.font = `700 ${fontSize}px ${theme.fontFamily}`;
    maxW = ctx.measureText(headerLabels[col]).width;
    ctx.font = `${fontWeight} ${fontSize}px ${theme.fontFamily}`;
    for (const row of displayRows) {
      const text = getCellText(row.epic, col, row.type === "initiative");
      const w = ctx.measureText(text).width;
      if (w > maxW) maxW = w;
    }
    const padding = col === "epicName" ? 36 : col === "status" ? 28 : 20;
    const newW = Math.max(40, Math.ceil(maxW + padding));
    setColWidths((prev) => ({ ...prev, [col]: newW }));
  }

  function startResize(col: ColKey, e: React.MouseEvent) {
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

  // Toggle sort on column header click
  function toggleSort(col: ColKey) {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortCol(null); setSortDir(null); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  // Open filter dropdown
  function openFilterDropdown(col: ColKey, e: React.MouseEvent) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setFilterDropdown((prev) => prev?.col === col ? null : { col, rect });
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
    // Apply column quick filters
    for (const [col, values] of Object.entries(colFilters)) {
      if (values.size === 0) continue;
      rows = rows.filter((r) => {
        if (r.type === "initiative") {
          return r.children?.some((c) => values.has(getCellText(c, col as ColKey, false)));
        }
        return values.has(getCellText(r.epic, col as ColKey, false));
      });
    }
    // Apply sort — keep initiative + children groups together
    if (sortCol && sortDir) {
      const col = sortCol;
      const dir = sortDir === "asc" ? 1 : -1;

      // Group rows: [initiative + its children] or [standalone epic]
      const groups: DisplayRow[][] = [];
      let i = 0;
      while (i < rows.length) {
        if (rows[i].type === "initiative") {
          const group = [rows[i]];
          const initKey = rows[i].initiativeKey;
          i++;
          while (i < rows.length && rows[i].type === "epic" && rows[i].initiativeKey === initKey) {
            group.push(rows[i]);
            i++;
          }
          groups.push(group);
        } else {
          groups.push([rows[i]]);
          i++;
        }
      }

      // Sort groups by their first meaningful row
      groups.sort((ga, gb) => {
        const a = ga[0];
        const b = gb[0];
        const ta = getCellText(a.epic, col, a.type === "initiative").toLowerCase();
        const tb = getCellText(b.epic, col, b.type === "initiative").toLowerCase();
        if (col === "progress") {
          const na = parseFloat(ta) || 0;
          const nb = parseFloat(tb) || 0;
          return (na - nb) * dir;
        }
        return ta < tb ? -dir : ta > tb ? dir : 0;
      });

      rows = groups.flat();
    }
    return rows;
  }, [displayRows, showInconsistencies, showAlerts, phaseFilter, inconsistencies, alerts, isInPhaseToday, colFilters, sortCol, sortDir]);

  // Compute global date range — clamped to reasonable bounds
  const { minDate, maxDate } = useMemo(() => {
    const now = new Date();
    const lowerBound = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const upperBound = new Date(now.getFullYear() + 2, now.getMonth(), 1);

    let min: Date | null = null;
    let max: Date | null = null;
    for (const task of tasks) {
      for (const phase of task.phases) {
        const s = phase.startDate < lowerBound ? lowerBound : phase.startDate;
        const e = phase.endDate > upperBound ? upperBound : phase.endDate;
        if (!min || s < min) min = s;
        if (!max || e > max) max = e;
      }
    }
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

  // Sync timeline header horizontal scroll with body scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function handleScroll() {
      if (timelineHeaderRef.current && el) {
        timelineHeaderRef.current.scrollLeft = el.scrollLeft;
      }
    }
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

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

      {/* Toolbar */}
      <div
        style={{
          padding: "10px 24px",
          display: "flex",
          gap: 6,
          alignItems: "center",
          borderBottom: `1px solid ${theme.borderLight}`,
          background: theme.surface,
          flexShrink: 0,
          boxShadow: theme.shadow.sm,
        }}
      >
        {/* Zoom group */}
        <div style={{ display: "flex", background: "#F3F0FA", borderRadius: theme.radius.md, padding: 2, gap: 1 }}>
          {(["day", "week", "month", "quarter"] as const).map((level) => (
            <button
              key={level}
              onClick={() => setZoom(level)}
              style={{
                padding: "5px 14px",
                borderRadius: theme.radius.sm,
                border: "none",
                background: zoom === level ? theme.primary : "transparent",
                color: zoom === level ? "white" : theme.textSecondary,
                fontSize: 11,
                cursor: "pointer",
                fontWeight: 600,
                letterSpacing: 0.3,
              }}
            >
              {level === "day" ? "Day" : level === "week" ? "Week" : level === "month" ? "Month" : "Quarter"}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: theme.borderLight, margin: "0 8px" }} />

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
            padding: "5px 14px",
            borderRadius: theme.radius.sm,
            border: "none",
            background: "#FEF2F2",
            color: "#DC2626",
            fontSize: 11,
            cursor: "pointer",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 5,
            letterSpacing: 0.2,
          }}
        >
          <div style={{ width: 3, height: 14, background: "#DC2626", borderRadius: 2 }} />
          Today
        </button>

        <div style={{ width: 1, height: 24, background: theme.borderLight, margin: "0 8px" }} />

        {/* Inconsistency toggle */}
        <button
          onClick={() => {
            setShowInconsistencies(!showInconsistencies);
            if (!showInconsistencies) setShowAlerts(false);
          }}
          style={{
            padding: "5px 14px",
            borderRadius: theme.radius.sm,
            border: showInconsistencies ? "1.5px solid #DC2626" : `1px solid ${theme.borderLight}`,
            background: showInconsistencies ? "#FEF2F2" : theme.surface,
            color: showInconsistencies ? "#DC2626" : theme.textSecondary,
            fontSize: 11,
            cursor: "pointer",
            fontWeight: showInconsistencies ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: 5,
            letterSpacing: 0.2,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          {showInconsistencies ? `${inconsistencies.size} issues` : "Check dates"}
        </button>

        {/* Alert toggle */}
        <button
          onClick={() => {
            setShowAlerts(!showAlerts);
            if (!showAlerts) setShowInconsistencies(false);
          }}
          style={{
            padding: "5px 14px",
            borderRadius: theme.radius.sm,
            border: showAlerts ? "1.5px solid #D97706" : `1px solid ${theme.borderLight}`,
            background: showAlerts ? "#FFFBEB" : theme.surface,
            color: showAlerts ? "#D97706" : theme.textSecondary,
            fontSize: 11,
            cursor: "pointer",
            fontWeight: showAlerts ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: 5,
            letterSpacing: 0.2,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
          {showAlerts ? `${alerts.size} alerts` : "Alerts"}
        </button>

        {/* Legend — clickable to filter by phase */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 3, alignItems: "center", background: "#F3F0FA", borderRadius: theme.radius.md, padding: 2 }}>
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
                  gap: 5,
                  fontSize: 11,
                  color: active ? "white" : theme.textSecondary,
                  background: active ? p.color : "transparent",
                  border: "none",
                  borderRadius: theme.radius.sm,
                  padding: "5px 10px",
                  cursor: "pointer",
                  fontWeight: active ? 600 : 500,
                  letterSpacing: 0.2,
                  boxShadow: active ? `0 2px 8px ${p.color}44` : "none",
                }}
              >
                <span style={{ width: 10, height: 10, background: active ? "rgba(255,255,255,0.9)" : p.color, borderRadius: 3, display: "inline-block", flexShrink: 0 }} />
                {"displayLabel" in p ? p.displayLabel : p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Fixed headers row */}
      <div style={{ display: "flex", flexShrink: 0, borderBottom: `2px solid ${theme.borderLight}`, position: "relative" }}>
        {/* Grid header */}
        {!gridCollapsed && (
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
          {([
            { col: "product" as ColKey, label: "Product", fontSize: 11 },
            { col: "acto" as ColKey, label: "ACTO", fontSize: 11 },
            { col: "epicName" as ColKey, label: "Project Name", fontSize: 12 },
            { col: "status" as ColKey, label: "Status", fontSize: 12 },
            { col: "progress" as ColKey, label: "%", fontSize: 11 },
          ]).map(({ col, label, fontSize }) => {
            const isSorted = sortCol === col;
            const hasFilter = colFilters[col]?.size > 0;
            return (
              <div
                key={col}
                style={{
                  width: colWidths[col],
                  position: "relative",
                  padding: col === "epicName" ? "0 12px" : "0 8px",
                  fontWeight: 700,
                  fontSize,
                  color: theme.textDark,
                  borderRight: col === "progress" ? undefined : `1px solid ${theme.borderRow}`,
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: col === "progress" ? "center" : undefined,
                  cursor: "pointer",
                  userSelect: "none",
                  gap: 3,
                }}
                onClick={() => toggleSort(col)}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{label}</span>
                {isSorted && (
                  <span style={{ fontSize: 9, opacity: 0.6, flexShrink: 0 }}>
                    {sortDir === "asc" ? "\u25B2" : "\u25BC"}
                  </span>
                )}
                <span
                  onClick={(e) => openFilterDropdown(col, e)}
                  style={{
                    fontSize: 9,
                    flexShrink: 0,
                    width: 14,
                    height: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 3,
                    background: hasFilter ? theme.primary : "transparent",
                    color: hasFilter ? "white" : theme.textMuted,
                    cursor: "pointer",
                  }}
                  title="Filter"
                >
                  &#9660;
                </span>
                <div style={RESIZE_HANDLE} onMouseDown={(e) => startResize(col, e)} onDoubleClick={(e) => { e.stopPropagation(); autoFitColumn(col); }} />
              </div>
            );
          })}
        </div>
        )}
        {/* Timeline header — synced with horizontal scroll */}
        <div
          ref={timelineHeaderRef}
          style={{ flex: 1, overflow: "hidden" }}
        >
          <div style={{ width: totalWidth + 24, position: "relative", paddingLeft: 24 }}>
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
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Collapse/expand toggle — vertically centered on the border */}
        <div
          onClick={() => setGridCollapsed(!gridCollapsed)}
          style={{
            position: "absolute",
            left: gridCollapsed ? 0 : gridTotalWidth,
            top: "50%",
            transform: "translateY(-50%)",
            width: 16,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            background: theme.gradient.primary,
            color: "white",
            borderRadius: "0 8px 8px 0",
            fontSize: 9,
            fontWeight: 700,
            zIndex: 30,
            boxShadow: theme.shadow.md,
            userSelect: "none",
            transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          title={gridCollapsed ? "Show columns" : "Hide columns"}
        >
          {gridCollapsed ? "▶" : "◀"}
        </div>
        <div
          ref={scrollRef}
          style={{ width: "100%", height: "100%", overflow: "auto" }}
        >
        <div style={{ display: "inline-flex", minWidth: "100%", minHeight: "min-content" }}>
          {/* Left grid — sticky left */}
          {!gridCollapsed && (
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
                    width: gridTotalWidth,
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
                      flexShrink: 0,
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
                      flexShrink: 0,
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
                      flexShrink: 0,
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
                  <div style={{ width: colWidths.status, flexShrink: 0, textAlign: "left", padding: "0 8px", boxSizing: "border-box", borderRight: `1px solid ${theme.borderRow}` }}>
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
                  <div style={{ width: colWidths.progress, flexShrink: 0, textAlign: "center", padding: "0 4px", boxSizing: "border-box", fontSize: 11, color: theme.textDark }}>
                    {(() => {
                      const raw = epic.rawData["Custom field (% of progress)"];
                      if (!raw || !raw.trim() || isInitiative) return "";
                      const val = Math.round(parseFloat(raw));
                      if (isNaN(val)) return "";
                      return `${val}%`;
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
          )}

          {/* Right: Timeline */}
          <div style={{ width: totalWidth + 24, position: "relative", paddingLeft: 24 }}>
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
                    const client = row.children?.[0]?.rawData["Custom field (Client)"]?.trim() || "";
                    const label = `${epic.epicKey} — ${epic.epicName}${client ? ` [${client}]` : ""}`;
                    return (
                      <div
                        style={{
                          position: "absolute",
                          left: minLeft,
                          top: BAR_TOP,
                          width: w,
                          height: BAR_HEIGHT,
                          borderRadius: 4,
                          background: `${theme.primary}20`,
                          border: `2px solid ${theme.primary}`,
                          pointerEvents: "none",
                          zIndex: 1,
                          display: "flex",
                          alignItems: "center",
                          paddingLeft: 8,
                          overflow: "hidden",
                        }}
                      >
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: theme.primary,
                          whiteSpace: "nowrap",
                        }}>
                          {label}
                        </span>
                      </div>
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
      {/* Column filter dropdown */}
      {filterDropdown && (() => {
        const col = filterDropdown.col;
        const uniqueVals = new Set<string>();
        for (const row of displayRows) {
          if (row.type === "initiative") continue;
          const v = getCellText(row.epic, col, false);
          if (v) uniqueVals.add(v);
        }
        const sorted = [...uniqueVals].sort((a, b) => a.localeCompare(b));
        const selected = colFilters[col] || new Set<string>();
        return (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 999 }}
              onClick={() => setFilterDropdown(null)}
            />
            <div
              style={{
                position: "fixed",
                top: filterDropdown.rect.bottom + 2,
                left: filterDropdown.rect.left,
                zIndex: 1000,
                background: "white",
                border: `1px solid ${theme.borderLight}`,
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                padding: 8,
                minWidth: 160,
                maxHeight: 300,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 4px", borderBottom: `1px solid ${theme.borderLight}` }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: theme.textDark }}>Filter</span>
                {selected.size > 0 && (
                  <span
                    onClick={() => { setColFilters((prev) => { const next = { ...prev }; delete next[col]; return next; }); setFilterDropdown(null); }}
                    style={{ fontSize: 10, color: theme.primary, cursor: "pointer", fontWeight: 600 }}
                  >
                    Clear
                  </span>
                )}
              </div>
              <div style={{ overflow: "auto", maxHeight: 240 }}>
                {sorted.map((val) => {
                  const checked = selected.has(val);
                  return (
                    <label
                      key={val}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "3px 4px",
                        fontSize: 11,
                        color: theme.textDark,
                        cursor: "pointer",
                        borderRadius: 4,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = theme.rowAlt)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setColFilters((prev) => {
                            const cur = new Set(prev[col] || []);
                            if (cur.has(val)) cur.delete(val);
                            else cur.add(val);
                            const next = { ...prev };
                            if (cur.size === 0) delete next[col];
                            else next[col] = cur;
                            return next;
                          });
                        }}
                        style={{ margin: 0 }}
                      />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{val}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
