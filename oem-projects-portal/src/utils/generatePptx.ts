import PptxGenJS from "pptxgenjs";
import type { EpicTask } from "../types";

// ── Colors from original slide ──
const PURPLE = "6B2CF5"; // title
const BAR_COLOR = "87CEEB"; // light sky blue bars
const DOT_BLUE = "1E90FF"; // blue dot (delivery complete)
const DOT_GREEN = "2E8B57"; // green dot (on schedule)
const HEADER_BG = "B0B0B0"; // gray header background
const HEADER_TEXT = "FFFFFF"; // white header text
const TODAY_COLOR = "8B0000"; // dark red
const CLIENT_BG = "A8E0F0"; // light cyan for client column
const CLIENT_TEXT = "333333"; // dark text for client
const WHITE = "FFFFFF";
const BLACK = "333333";

// ── Layout ──
const SLIDE_W = 13.33;
const SLIDE_H = 7.5;
const TITLE_Y = 0.1;
const TITLE_H = 0.65;
const HEADER_Y = TITLE_Y + TITLE_H + 0.05;
const Q_ROW_H = 0.35;
const M_ROW_H = 0.35;
const CHART_Y = HEADER_Y + Q_ROW_H + M_ROW_H + 0.05;
const LEGEND_H = 0.65;
const CHART_BOTTOM = SLIDE_H - LEGEND_H - 0.15;
const LEFT_COL_W = 0.9;
const CHART_X = LEFT_COL_W;
const CHART_W = SLIDE_W - CHART_X - 0.1;
const MAX_ROWS_PER_SLIDE = 10;

interface ProjectBar {
  epicName: string;
  client: string;
  startDate: Date;
  endDate: Date;
  hasUat: boolean;
}

export function generatePptx(tasks: EpicTask[]) {
  const bars: ProjectBar[] = [];

  for (const epic of tasks) {
    if (epic.phases.length === 0) continue;

    let minStart: Date | null = null;
    let uatStart: Date | null = null;

    for (const phase of epic.phases) {
      if (!minStart || phase.startDate < minStart) minStart = phase.startDate;
      if (phase.phaseName === "Customer UAT") uatStart = phase.startDate;
    }

    if (!minStart) continue;

    let endDate = uatStart;
    if (!endDate) {
      for (const phase of epic.phases) {
        if (!endDate || phase.endDate > endDate) endDate = phase.endDate;
      }
    }

    bars.push({
      epicName: epic.epicName,
      client: epic.rawData["Custom field (Client)"]?.trim() || "Other",
      startDate: minStart,
      endDate: endDate!,
      hasUat: !!uatStart,
    });
  }

  bars.sort((a, b) => {
    const cmp = a.client.localeCompare(b.client);
    if (cmp !== 0) return cmp;
    return a.startDate.getTime() - b.startDate.getTime();
  });

  // ── Timeline range (quarter boundaries) ──
  let timelineStart: Date;
  let timelineEnd: Date;

  if (bars.length > 0) {
    const minTime = Math.min(...bars.map((b) => b.startDate.getTime()));
    const maxTime = Math.max(...bars.map((b) => b.endDate.getTime()));
    const minD = new Date(minTime);
    const maxD = new Date(maxTime);
    timelineStart = new Date(minD.getFullYear(), Math.floor(minD.getMonth() / 3) * 3, 1);
    const endQ = Math.ceil((maxD.getMonth() + 1) / 3) * 3;
    timelineEnd = new Date(
      endQ > 11 ? maxD.getFullYear() + 1 : maxD.getFullYear(),
      endQ > 11 ? endQ - 12 : endQ,
      1
    );
  } else {
    timelineStart = new Date();
    timelineEnd = new Date();
    timelineEnd.setFullYear(timelineEnd.getFullYear() + 1);
  }

  const totalDays = (timelineEnd.getTime() - timelineStart.getTime()) / 86400000;

  function dateToX(date: Date): number {
    const days = (date.getTime() - timelineStart.getTime()) / 86400000;
    return CHART_X + (days / totalDays) * CHART_W;
  }

  // ── Quarter & month headers ──
  const quarters: { label: string; x: number; w: number }[] = [];
  const months: { label: string; x: number; w: number }[] = [];

  const qCursor = new Date(timelineStart);
  while (qCursor < timelineEnd) {
    const qMonth = qCursor.getMonth();
    const qEnd = new Date(qCursor.getFullYear(), qMonth + 3, 1);
    quarters.push({
      label: `Q${Math.floor(qMonth / 3) + 1} ${qCursor.getFullYear()}`,
      x: dateToX(qCursor),
      w: dateToX(qEnd > timelineEnd ? timelineEnd : qEnd) - dateToX(qCursor),
    });
    for (let m = 0; m < 3; m++) {
      const mStart = new Date(qCursor.getFullYear(), qMonth + m, 1);
      const mEnd = new Date(qCursor.getFullYear(), qMonth + m + 1, 1);
      if (mStart >= timelineEnd) break;
      months.push({
        label: mStart.toLocaleDateString("en-GB", { month: "short" }),
        x: dateToX(mStart),
        w: dateToX(mEnd > timelineEnd ? timelineEnd : mEnd) - dateToX(mStart),
      });
    }
    qCursor.setMonth(qCursor.getMonth() + 3);
  }

  const today = new Date();
  const todayInRange = today >= timelineStart && today <= timelineEnd;
  const todayX = todayInRange ? dateToX(today) : null;

  // ── Paginate: 10 per slide ──
  const pages: ProjectBar[][] = [];
  for (let i = 0; i < bars.length; i += MAX_ROWS_PER_SLIDE) {
    pages.push(bars.slice(i, i + MAX_ROWS_PER_SLIDE));
  }
  if (pages.length === 0) pages.push([]);

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";

  for (const pageBars of pages) {
    const slide = pptx.addSlide();
    slide.background = { color: WHITE };

    const chartH = CHART_BOTTOM - CHART_Y;
    const rowH = Math.min(chartH / pageBars.length, 0.5);
    const barH = rowH * 0.45;

    // ═══ Title ═══
    slide.addText("iCar Roadmap – OEM Projects", {
      x: 0.3,
      y: TITLE_Y,
      w: SLIDE_W - 0.6,
      h: TITLE_H,
      fontSize: 36,
      fontFace: "Arial",
      bold: true,
      italic: true,
      color: PURPLE,
    });

    // ═══ Quarter headers ═══
    for (const q of quarters) {
      slide.addShape(pptx.ShapeType.rect, {
        x: q.x, y: HEADER_Y, w: q.w, h: Q_ROW_H,
        fill: { color: HEADER_BG },
        line: { color: WHITE, width: 1.5 },
      });
      slide.addText(q.label, {
        x: q.x, y: HEADER_Y, w: q.w, h: Q_ROW_H,
        fontSize: 14, fontFace: "Arial", bold: true,
        color: HEADER_TEXT, align: "center", valign: "middle",
      });
    }

    // ═══ Month headers ═══
    for (const m of months) {
      slide.addShape(pptx.ShapeType.rect, {
        x: m.x, y: HEADER_Y + Q_ROW_H, w: m.w, h: M_ROW_H,
        fill: { color: HEADER_BG },
        line: { color: WHITE, width: 1.5 },
      });
      slide.addText(m.label, {
        x: m.x, y: HEADER_Y + Q_ROW_H, w: m.w, h: M_ROW_H,
        fontSize: 11, fontFace: "Arial", bold: true,
        color: HEADER_TEXT, align: "center", valign: "middle",
      });
    }

    // ═══ Client column ═══
    let currentClient = "";
    let clientStartRow = 0;

    for (let r = 0; r < pageBars.length; r++) {
      const bar = pageBars[r];

      if (bar.client !== currentClient) {
        if (currentClient !== "") {
          addClientBlock(slide, pptx, currentClient, CHART_Y + clientStartRow * rowH, (r - clientStartRow) * rowH);
        }
        currentClient = bar.client;
        clientStartRow = r;
      }

      // ═══ Project bar ═══
      const rowY = CHART_Y + r * rowH;
      const bStart = bar.startDate < timelineStart ? timelineStart : bar.startDate;
      const bEnd = bar.endDate > timelineEnd ? timelineEnd : bar.endDate;
      const x1 = dateToX(bStart);
      const x2 = dateToX(bEnd);
      const barW = Math.max(x2 - x1, 0.2);
      const barPadY = (rowH - barH) / 2;

      // Bar
      slide.addShape(pptx.ShapeType.roundRect, {
        x: x1, y: rowY + barPadY, w: barW, h: barH,
        fill: { color: BAR_COLOR },
        rectRadius: 0.03,
        line: { width: 0 },
      });

      // End dot: green if has UAT (on schedule), blue otherwise (complete)
      const dotSize = barH * 0.85;
      const dotColor = bar.hasUat ? DOT_GREEN : DOT_BLUE;
      slide.addShape(pptx.ShapeType.ellipse, {
        x: x1 + barW - dotSize * 0.4,
        y: rowY + barPadY + (barH - dotSize) / 2,
        w: dotSize, h: dotSize,
        fill: { color: dotColor },
        line: { width: 0 },
      });

      // Project name — on the bar in bold
      const shortName = bar.epicName.replace(/^ICAR\s*[-–—]?\s*/i, "").trim();
      slide.addText(shortName, {
        x: x1 + 0.08,
        y: rowY + barPadY - 0.01,
        w: Math.max(barW - 0.2, 1.5),
        h: barH + 0.02,
        fontSize: 8,
        fontFace: "Arial",
        bold: true,
        color: BLACK,
        valign: "middle",
      });
    }

    // Last client block
    if (currentClient !== "") {
      addClientBlock(slide, pptx, currentClient, CHART_Y + clientStartRow * rowH, (pageBars.length - clientStartRow) * rowH);
    }

    // ═══ TODAY line ═══
    if (todayX !== null) {
      const lineTop = HEADER_Y;
      const lineBottom = CHART_Y + pageBars.length * rowH;
      const segH = 0.15;
      const gapH = 0.08;
      for (let y = lineTop; y < lineBottom; y += segH + gapH) {
        slide.addShape(pptx.ShapeType.rect, {
          x: todayX - 0.02, y, w: 0.04, h: Math.min(segH, lineBottom - y),
          fill: { color: TODAY_COLOR },
          line: { width: 0 },
        });
      }
      slide.addText("TODAY", {
        x: todayX - 0.3, y: lineBottom + 0.02, w: 0.6, h: 0.2,
        fontSize: 9, fontFace: "Arial", bold: true,
        color: TODAY_COLOR, align: "center",
      });
    }

    // ═══ Legend at bottom ═══
    const legendY = SLIDE_H - LEGEND_H;

    // Nextlane logo text
    slide.addText("nextlane", {
      x: 0.3, y: legendY + 0.05, w: 1.5, h: LEGEND_H - 0.1,
      fontSize: 18, fontFace: "Arial", bold: true, italic: true,
      color: PURPLE, valign: "middle",
    });

    // Key label
    slide.addText("Key:", {
      x: 2.2, y: legendY + 0.05, w: 0.5, h: 0.3,
      fontSize: 10, fontFace: "Arial", bold: true,
      color: BLACK, valign: "middle",
    });

    // Legend items
    const legendItems = [
      { color: DOT_BLUE, label: "Delivery Complete", row: 0 },
      { color: DOT_GREEN, label: "On Schedule", row: 1 },
    ];
    for (const item of legendItems) {
      const lx = 2.8;
      const ly = legendY + 0.05 + item.row * 0.28;
      slide.addShape(pptx.ShapeType.ellipse, {
        x: lx, y: ly + 0.04, w: 0.18, h: 0.18,
        fill: { color: item.color },
        line: { width: 0 },
      });
      slide.addText(item.label, {
        x: lx + 0.25, y: ly, w: 1.5, h: 0.26,
        fontSize: 9, fontFace: "Arial", color: BLACK, valign: "middle",
      });
    }
  }

  pptx.writeFile({ fileName: "iCar_Roadmap_OEM_Projects.pptx" });
}

function addClientBlock(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  client: string,
  y: number,
  h: number
) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.05, y: y + 0.03, w: LEFT_COL_W - 0.1, h: h - 0.06,
    fill: { color: CLIENT_BG },
    rectRadius: 0.05,
    line: { width: 0 },
  });
  slide.addText(client, {
    x: 0.05, y: y + 0.03, w: LEFT_COL_W - 0.1, h: h - 0.06,
    fontSize: 12, fontFace: "Arial", bold: true,
    color: CLIENT_TEXT, align: "center", valign: "middle",
    rotate: 270,
  });
}
