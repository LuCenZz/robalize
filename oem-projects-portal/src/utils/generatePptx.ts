import PptxGenJS from "pptxgenjs";
import type { EpicTask } from "../types";
import { PHASE_CONFIG } from "../types";

const PURPLE = "6B2CF5";
const WHITE = "FFFFFF";
const BLACK = "333333";
const LIGHT_GRAY = "F5F5F5";
const GRAY = "999999";
const TODAY_COLOR = "CC0000";

const PHASE_COLORS: Record<string, string> = {};
for (const p of PHASE_CONFIG) {
  PHASE_COLORS[p.name] = p.color.replace("#", "");
}

const SLIDE_W = 13.33;
const SLIDE_H = 7.5;
const MAX_ROWS = 10;

export function generatePptx(tasks: EpicTask[]) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "OEM Projects Portal";
  pptx.title = "OEM Projects Report";

  // ═══════════════════════════════════════
  // SLIDE 1: Dashboard / KPIs
  // ═══════════════════════════════════════
  const dashSlide = pptx.addSlide();
  dashSlide.background = { color: WHITE };

  // Title
  dashSlide.addText("OEM Projects — Dashboard", {
    x: 0.4, y: 0.3, w: SLIDE_W - 0.8, h: 0.6,
    fontSize: 28, fontFace: "Poppins", bold: true, color: PURPLE,
  });

  // Date
  dashSlide.addText(new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }), {
    x: 0.4, y: 0.85, w: 4, h: 0.3,
    fontSize: 11, fontFace: "Poppins", color: GRAY,
  });

  // KPI cards
  const statusCounts = new Map<string, number>();
  for (const t of tasks) {
    const s = t.status || "Unknown";
    statusCounts.set(s, (statusCounts.get(s) || 0) + 1);
  }

  // Phase distribution (which phase is each project currently in based on today)
  const today = new Date();
  const phaseCounts = new Map<string, number>();
  for (const t of tasks) {
    let currentPhase = "No dates";
    for (const p of t.phases) {
      if (today >= p.startDate && today <= p.endDate) {
        currentPhase = p.phaseName;
        break;
      }
    }
    // If no phase is current, check if all are past or future
    if (currentPhase === "No dates" && t.phases.length > 0) {
      const lastPhase = t.phases[t.phases.length - 1];
      const firstPhase = t.phases[0];
      if (today > lastPhase.endDate) currentPhase = "Completed";
      else if (today < firstPhase.startDate) currentPhase = "Not started";
    }
    phaseCounts.set(currentPhase, (phaseCounts.get(currentPhase) || 0) + 1);
  }

  // KPI cards — centered
  const sortedStatuses = [...statusCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topStatuses = sortedStatuses.slice(0, 4);
  const statusColors = ["3B82F6", "F59E0B", "10B981", "EF4444"];

  const allKpis = [
    { value: String(tasks.length), label: "Total Projects", color: PURPLE },
    ...topStatuses.map((s, i) => ({ value: String(s[1]), label: s[0], color: statusColors[i % statusColors.length] })),
  ];

  const kpiW = 2.2;
  const kpiH = 1.1;
  const kpiGap = 0.25;
  const totalKpiW = allKpis.length * kpiW + (allKpis.length - 1) * kpiGap;
  const kpiStartX = (SLIDE_W - totalKpiW) / 2;
  const kpiY = 1.4;

  for (let i = 0; i < allKpis.length; i++) {
    const kpi = allKpis[i];
    addKpiCard(dashSlide, pptx, kpiStartX + i * (kpiW + kpiGap), kpiY, kpiW, kpiH, kpi.value, kpi.label, kpi.color);
  }

  // Status breakdown table
  const tableY = 3.0;
  dashSlide.addText("Projects by Status", {
    x: 0.4, y: tableY, w: 6, h: 0.4,
    fontSize: 14, fontFace: "Poppins", bold: true, color: BLACK,
  });

  const statusRows: PptxGenJS.TableRow[] = [
    [
      { text: "Status", options: { bold: true, fontSize: 10, fill: { color: PURPLE }, color: WHITE, fontFace: "Poppins" } },
      { text: "Count", options: { bold: true, fontSize: 10, fill: { color: PURPLE }, color: WHITE, align: "center", fontFace: "Poppins" } },
      { text: "%", options: { bold: true, fontSize: 10, fill: { color: PURPLE }, color: WHITE, align: "center", fontFace: "Poppins" } },
    ],
  ];
  for (const [status, count] of sortedStatuses) {
    const pct = ((count / tasks.length) * 100).toFixed(0);
    statusRows.push([
      { text: status, options: { fontSize: 9, fontFace: "Poppins" } },
      { text: String(count), options: { fontSize: 9, align: "center", fontFace: "Poppins" } },
      { text: `${pct}%`, options: { fontSize: 9, align: "center", fontFace: "Poppins" } },
    ]);
  }

  dashSlide.addTable(statusRows, {
    x: 0.4, y: tableY + 0.45, w: 5.5,
    colW: [3, 1.2, 1.3],
    border: { type: "solid", pt: 0.5, color: "E0E0E0" },
    rowH: 0.3,
  });

  // Phase distribution table
  dashSlide.addText("Current Phase Distribution", {
    x: 6.5, y: tableY, w: 6, h: 0.4,
    fontSize: 14, fontFace: "Poppins", bold: true, color: BLACK,
  });

  const phaseRows: PptxGenJS.TableRow[] = [
    [
      { text: "Phase", options: { bold: true, fontSize: 10, fill: { color: PURPLE }, color: WHITE, fontFace: "Poppins" } },
      { text: "Count", options: { bold: true, fontSize: 10, fill: { color: PURPLE }, color: WHITE, align: "center", fontFace: "Poppins" } },
    ],
  ];
  const sortedPhases = [...phaseCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [phase, count] of sortedPhases) {
    phaseRows.push([
      { text: phase === "QA / Test" ? "QA" : phase, options: { fontSize: 9, fontFace: "Poppins" } },
      { text: String(count), options: { fontSize: 9, align: "center", fontFace: "Poppins" } },
    ]);
  }

  dashSlide.addTable(phaseRows, {
    x: 6.5, y: tableY + 0.45, w: 4,
    colW: [2.5, 1.5],
    border: { type: "solid", pt: 0.5, color: "E0E0E0" },
    rowH: 0.3,
  });

  // Footer
  addFooter(dashSlide);

  // ═══════════════════════════════════════
  // SLIDES 2+: Gantt view (10 per slide)
  // ═══════════════════════════════════════
  const sortedTasks = [...tasks].sort((a, b) => {
    const aStart = a.phases.length > 0 ? Math.min(...a.phases.map((p) => p.startDate.getTime())) : Infinity;
    const bStart = b.phases.length > 0 ? Math.min(...b.phases.map((p) => p.startDate.getTime())) : Infinity;
    return aStart - bStart;
  });

  // Timeline range: 6 months before today → 12 months after today
  const timelineStart = new Date(today.getFullYear(), today.getMonth() - 6, 1);
  const timelineEnd = new Date(today.getFullYear(), today.getMonth() + 13, 1);

  const totalDays = (timelineEnd.getTime() - timelineStart.getTime()) / 86400000;
  const CHART_X = 3.8;
  const CHART_W = SLIDE_W - CHART_X - 0.2;
  const HEADER_Y = 0.9;
  const CHART_Y = 1.7;

  function dateToX(date: Date): number {
    const days = (date.getTime() - timelineStart.getTime()) / 86400000;
    return CHART_X + (days / totalDays) * CHART_W;
  }

  // Year & month headers
  const years: { label: string; x: number; w: number }[] = [];
  const months: { label: string; x: number; w: number }[] = [];

  // Build months
  const mCursor = new Date(timelineStart);
  while (mCursor < timelineEnd) {
    const mEnd = new Date(mCursor.getFullYear(), mCursor.getMonth() + 1, 1);
    months.push({
      label: mCursor.toLocaleDateString("en-GB", { month: "short" }),
      x: dateToX(mCursor),
      w: dateToX(mEnd > timelineEnd ? timelineEnd : mEnd) - dateToX(mCursor),
    });
    mCursor.setMonth(mCursor.getMonth() + 1);
  }

  // Build years
  const startYear = timelineStart.getFullYear();
  const endYear = timelineEnd.getFullYear();
  for (let y = startYear; y <= endYear; y++) {
    const yStart = new Date(y, 0, 1);
    const yEnd = new Date(y + 1, 0, 1);
    const clampStart = yStart < timelineStart ? timelineStart : yStart;
    const clampEnd = yEnd > timelineEnd ? timelineEnd : yEnd;
    if (clampStart >= clampEnd) continue;
    years.push({
      label: String(y),
      x: dateToX(clampStart),
      w: dateToX(clampEnd) - dateToX(clampStart),
    });
  }

  const todayInRange = today >= timelineStart && today <= timelineEnd;
  const todayX = todayInRange ? dateToX(today) : null;

  // Paginate
  for (let page = 0; page < sortedTasks.length; page += MAX_ROWS) {
    const pageTasks = sortedTasks.slice(page, page + MAX_ROWS);
    const slide = pptx.addSlide();
    slide.background = { color: WHITE };

    // Title
    const pageNum = Math.floor(page / MAX_ROWS) + 1;
    const totalPages = Math.ceil(sortedTasks.length / MAX_ROWS);
    slide.addText(`OEM Projects — Gantt View (${pageNum}/${totalPages})`, {
      x: 0.4, y: 0.2, w: SLIDE_W - 0.8, h: 0.5,
      fontSize: 22, fontFace: "Poppins", bold: true, color: PURPLE,
    });

    // Year headers
    for (const yr of years) {
      slide.addShape(pptx.ShapeType.rect, {
        x: yr.x, y: HEADER_Y, w: yr.w, h: 0.3,
        fill: { color: PURPLE }, line: { color: WHITE, width: 1 },
      });
      slide.addText(yr.label, {
        x: yr.x, y: HEADER_Y, w: yr.w, h: 0.3,
        fontSize: 11, fontFace: "Poppins", bold: true, color: WHITE, align: "center", valign: "middle",
      });
    }

    // Month headers
    for (const m of months) {
      slide.addShape(pptx.ShapeType.rect, {
        x: m.x, y: HEADER_Y + 0.3, w: m.w, h: 0.35,
        fill: { color: "F0EBFF" }, line: { color: WHITE, width: 1 },
      });
      slide.addText(m.label, {
        x: m.x, y: HEADER_Y + 0.3, w: m.w, h: 0.35,
        fontSize: 9, fontFace: "Poppins", bold: true, color: PURPLE, align: "center", valign: "middle",
      });
    }

    // Column headers
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.2, y: HEADER_Y, w: 3.5, h: 0.65,
      fill: { color: LIGHT_GRAY },
    });
    slide.addText("ACTO", {
      x: 0.2, y: HEADER_Y, w: 1.0, h: 0.65,
      fontSize: 8, fontFace: "Poppins", bold: true, color: BLACK, align: "center", valign: "middle",
    });
    slide.addText("Project Name", {
      x: 1.2, y: HEADER_Y, w: 1.5, h: 0.65,
      fontSize: 8, fontFace: "Poppins", bold: true, color: BLACK, valign: "middle",
    });
    slide.addText("Status", {
      x: 2.7, y: HEADER_Y, w: 1.0, h: 0.65,
      fontSize: 8, fontFace: "Poppins", bold: true, color: BLACK, align: "center", valign: "middle",
    });

    // Rows
    const rowH = Math.min((SLIDE_H - CHART_Y - 1.2) / pageTasks.length, 0.5);
    const barH = rowH * 0.5;

    for (let r = 0; r < pageTasks.length; r++) {
      const epic = pageTasks[r];
      const rowY = CHART_Y + r * rowH;
      const bgColor = r % 2 === 0 ? WHITE : "FAFAFE";

      // Row background
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.2, y: rowY, w: SLIDE_W - 0.4, h: rowH,
        fill: { color: bgColor }, line: { width: 0 },
      });

      // ACTO
      slide.addText(epic.epicKey, {
        x: 0.2, y: rowY, w: 1.0, h: rowH,
        fontSize: 7, fontFace: "Poppins", color: PURPLE, align: "center", valign: "middle",
      });

      // Project name
      const name = epic.epicName.length > 30 ? epic.epicName.slice(0, 28) + "..." : epic.epicName;
      slide.addText(name, {
        x: 1.2, y: rowY, w: 1.5, h: rowH,
        fontSize: 7, fontFace: "Poppins", bold: true, color: BLACK, valign: "middle",
      });

      // Status
      slide.addText(epic.status, {
        x: 2.7, y: rowY, w: 1.0, h: rowH,
        fontSize: 6, fontFace: "Poppins", color: GRAY, align: "center", valign: "middle",
      });

      // Phase bars
      for (const phase of epic.phases) {
        const x1 = dateToX(phase.startDate < timelineStart ? timelineStart : phase.startDate);
        const x2 = dateToX(phase.endDate > timelineEnd ? timelineEnd : phase.endDate);
        const barW = Math.max(x2 - x1, 0.05);
        const color = PHASE_COLORS[phase.phaseName] || "CCCCCC";

        slide.addShape(pptx.ShapeType.roundRect, {
          x: x1, y: rowY + (rowH - barH) / 2, w: barW, h: barH,
          fill: { color }, rectRadius: 0.02, line: { width: 0 },
        });
      }
    }

    // Today line
    if (todayX !== null) {
      slide.addShape(pptx.ShapeType.rect, {
        x: todayX - 0.015, y: HEADER_Y, w: 0.03, h: CHART_Y + pageTasks.length * rowH - HEADER_Y,
        fill: { color: TODAY_COLOR }, line: { width: 0 },
      });
      slide.addText("TODAY", {
        x: todayX - 0.35, y: CHART_Y + pageTasks.length * rowH + 0.05, w: 0.7, h: 0.2,
        fontSize: 7, fontFace: "Poppins", bold: true, color: TODAY_COLOR, align: "center",
      });
    }

    // Legend
    const legendY = SLIDE_H - 0.55;
    const phases = [
      { name: "Analysis", color: "ffd43b" },
      { name: "Development", color: "ff922b" },
      { name: "QA", color: "51cf66" },
      { name: "Customer UAT", color: "339af0" },
      { name: "Pilot", color: "1864ab" },
    ];
    let lx = 0.4;
    for (const p of phases) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: lx, y: legendY + 0.08, w: 0.2, h: 0.2,
        fill: { color: p.color }, rectRadius: 0.03, line: { width: 0 },
      });
      slide.addText(p.name, {
        x: lx + 0.25, y: legendY, w: 1.2, h: 0.35,
        fontSize: 8, fontFace: "Poppins", color: BLACK, valign: "middle",
      });
      lx += 1.5;
    }

    addFooter(slide);
  }

  pptx.writeFile({ fileName: "OEM_Projects_Report.pptx" });
}

function addKpiCard(slide: PptxGenJS.Slide, pptx: PptxGenJS, x: number, y: number, w: number, h: number, value: string, label: string, color: string) {
  // Card background — light purple
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: "F0EBFF" },
    line: { color, width: 2 },
    rectRadius: 0.12,
  });
  // Value
  slide.addText(value, {
    x, y: y + 0.08, w, h: h * 0.55,
    fontSize: 32, fontFace: "Poppins", bold: true, color, align: "center", valign: "middle",
  });
  // Label
  slide.addText(label, {
    x: x + 0.1, y: y + h * 0.55, w: w - 0.2, h: h * 0.35,
    fontSize: 9, fontFace: "Poppins", color: "555555", align: "center", valign: "top",
  });
}

function addFooter(slide: PptxGenJS.Slide) {
  slide.addText("nextlane", {
    x: SLIDE_W - 2, y: SLIDE_H - 0.45, w: 1.5, h: 0.3,
    fontSize: 12, fontFace: "Poppins", bold: true, color: PURPLE, align: "right",
  });
}
