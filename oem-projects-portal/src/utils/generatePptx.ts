import PptxGenJS from "pptxgenjs";
import type { EpicTask } from "../types";

// Colors matching the original iCar Roadmap slide exactly
const TITLE_COLOR = "7B2D8E"; // purple for title
const BAR_COLOR = "26C6DA"; // cyan/teal for project bars
const DOT_COLOR = "4CAF50"; // green end dot
const HEADER_BG = "BDBDBD"; // gray header background
const HEADER_TEXT = "424242"; // dark gray header text
const TODAY_COLOR = "8B0000"; // dark red for TODAY line
const CLIENT_BG = "B2EBF2"; // light cyan for client column
const CLIENT_TEXT = "006064"; // dark teal for client text
const WHITE = "FFFFFF";

// Slide dimensions (widescreen 13.33 x 7.5)
const SLIDE_W = 13.33;
const SLIDE_H = 7.5;

// Layout
const TITLE_Y = 0.2;
const TITLE_H = 0.7;
const HEADER_Y = TITLE_Y + TITLE_H + 0.1;
const Q_ROW_H = 0.32;
const M_ROW_H = 0.32;
const HEADER_TOTAL_H = Q_ROW_H + M_ROW_H;
const CHART_Y = HEADER_Y + HEADER_TOTAL_H;
const CHART_BOTTOM = SLIDE_H - 0.4;
const CHART_H = CHART_BOTTOM - CHART_Y;
const LEFT_COL_W = 1.0;
const CHART_X = LEFT_COL_W;
const CHART_W = SLIDE_W - CHART_X - 0.15;

interface ProjectBar {
  epicName: string;
  client: string;
  startDate: Date;
  endDate: Date;
}

export function generatePptx(tasks: EpicTask[]) {
  const bars: ProjectBar[] = [];

  for (const epic of tasks) {
    if (epic.phases.length === 0) continue;

    let minStart: Date | null = null;
    let uatStart: Date | null = null;

    for (const phase of epic.phases) {
      if (!minStart || phase.startDate < minStart) minStart = phase.startDate;
      if (phase.phaseName === "Customer UAT") {
        uatStart = phase.startDate;
      }
    }

    if (!minStart) continue;

    let endDate = uatStart;
    if (!endDate) {
      for (const phase of epic.phases) {
        if (!endDate || phase.endDate > endDate) endDate = phase.endDate;
      }
    }

    const client =
      epic.rawData["Custom field (Client)"]?.trim() || "Other";

    bars.push({
      epicName: epic.epicName,
      client,
      startDate: minStart,
      endDate: endDate!,
    });
  }

  bars.sort((a, b) => {
    const cmp = a.client.localeCompare(b.client);
    if (cmp !== 0) return cmp;
    return a.startDate.getTime() - b.startDate.getTime();
  });

  // Timeline range: round to quarter boundaries
  let timelineStart: Date;
  let timelineEnd: Date;

  if (bars.length > 0) {
    const minTime = Math.min(...bars.map((b) => b.startDate.getTime()));
    const maxTime = Math.max(...bars.map((b) => b.endDate.getTime()));
    const minD = new Date(minTime);
    const maxD = new Date(maxTime);
    const startQ = Math.floor(minD.getMonth() / 3) * 3;
    timelineStart = new Date(minD.getFullYear(), startQ, 1);
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

  const totalDays =
    (timelineEnd.getTime() - timelineStart.getTime()) / 86400000;

  function dateToX(date: Date): number {
    const days = (date.getTime() - timelineStart.getTime()) / 86400000;
    return CHART_X + (days / totalDays) * CHART_W;
  }

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";

  const rowH = Math.min(0.38, CHART_H / Math.max(bars.length, 1));
  const maxRowsPerSlide = Math.floor(CHART_H / rowH);

  const pages: ProjectBar[][] = [];
  for (let i = 0; i < bars.length; i += maxRowsPerSlide) {
    pages.push(bars.slice(i, i + maxRowsPerSlide));
  }
  if (pages.length === 0) pages.push([]);

  // Quarter & month header data
  const quarters: { label: string; x: number; w: number }[] = [];
  const monthHeaders: { label: string; x: number; w: number }[] = [];

  const qCursor = new Date(timelineStart);
  while (qCursor < timelineEnd) {
    const qMonth = qCursor.getMonth();
    const qEnd = new Date(qCursor.getFullYear(), qMonth + 3, 1);
    const qLabel = `Q${Math.floor(qMonth / 3) + 1} ${qCursor.getFullYear()}`;
    const x1 = dateToX(qCursor < timelineStart ? timelineStart : qCursor);
    const x2 = dateToX(qEnd > timelineEnd ? timelineEnd : qEnd);
    quarters.push({ label: qLabel, x: x1, w: x2 - x1 });

    for (let m = 0; m < 3; m++) {
      const mStart = new Date(qCursor.getFullYear(), qMonth + m, 1);
      const mEnd = new Date(qCursor.getFullYear(), qMonth + m + 1, 1);
      if (mStart >= timelineEnd) break;
      const mx1 = dateToX(mStart < timelineStart ? timelineStart : mStart);
      const mx2 = dateToX(mEnd > timelineEnd ? timelineEnd : mEnd);
      monthHeaders.push({
        label: mStart.toLocaleDateString("en-GB", { month: "short" }),
        x: mx1,
        w: mx2 - mx1,
      });
    }
    qCursor.setMonth(qCursor.getMonth() + 3);
  }

  const today = new Date();
  const todayX =
    today >= timelineStart && today <= timelineEnd ? dateToX(today) : null;

  for (const pageBars of pages) {
    const slide = pptx.addSlide();
    slide.background = { color: WHITE };

    // ─── Title (italic bold purple) ───
    slide.addText("iCar Roadmap – OEM Projects", {
      x: 0.3,
      y: TITLE_Y,
      w: SLIDE_W - 0.6,
      h: TITLE_H,
      fontSize: 32,
      fontFace: "Arial",
      bold: true,
      italic: true,
      color: TITLE_COLOR,
    });

    // ─── Quarter header row ───
    for (const q of quarters) {
      slide.addShape(pptx.ShapeType.rect, {
        x: q.x,
        y: HEADER_Y,
        w: q.w,
        h: Q_ROW_H,
        fill: { color: HEADER_BG },
        line: { color: WHITE, width: 1.5 },
      });
      slide.addText(q.label, {
        x: q.x,
        y: HEADER_Y,
        w: q.w,
        h: Q_ROW_H,
        fontSize: 12,
        fontFace: "Arial",
        bold: true,
        color: HEADER_TEXT,
        align: "center",
        valign: "middle",
      });
    }

    // ─── Month header row ───
    for (const m of monthHeaders) {
      slide.addShape(pptx.ShapeType.rect, {
        x: m.x,
        y: HEADER_Y + Q_ROW_H,
        w: m.w,
        h: M_ROW_H,
        fill: { color: HEADER_BG },
        line: { color: WHITE, width: 1.5 },
      });
      slide.addText(m.label, {
        x: m.x,
        y: HEADER_Y + Q_ROW_H,
        w: m.w,
        h: M_ROW_H,
        fontSize: 10,
        fontFace: "Arial",
        bold: true,
        color: HEADER_TEXT,
        align: "center",
        valign: "middle",
      });
    }

    // ─── Client column: group bars by client ───
    let currentClient = "";
    let clientStartRow = 0;
    const barH = 0.18;

    for (let r = 0; r < pageBars.length; r++) {
      const bar = pageBars[r];
      const rowY = CHART_Y + r * rowH;

      // Client grouping
      if (bar.client !== currentClient) {
        if (currentClient !== "") {
          drawClientLabel(
            slide,
            pptx,
            currentClient,
            CHART_Y + clientStartRow * rowH,
            (r - clientStartRow) * rowH
          );
        }
        currentClient = bar.client;
        clientStartRow = r;
      }

      // ─── Project bar ───
      const barStart =
        bar.startDate < timelineStart ? timelineStart : bar.startDate;
      const barEnd =
        bar.endDate > timelineEnd ? timelineEnd : bar.endDate;
      const x1 = dateToX(barStart);
      const x2 = dateToX(barEnd);
      const barW = Math.max(x2 - x1, 0.15);
      const barPadY = (rowH - barH) / 2;

      // Cyan rounded bar
      slide.addShape(pptx.ShapeType.roundRect, {
        x: x1,
        y: rowY + barPadY,
        w: barW,
        h: barH,
        fill: { color: BAR_COLOR },
        rectRadius: 0.04,
        line: { width: 0 },
      });

      // Green end dot
      const dotSize = 0.14;
      slide.addShape(pptx.ShapeType.ellipse, {
        x: x1 + barW - dotSize / 2,
        y: rowY + barPadY + (barH - dotSize) / 2,
        w: dotSize,
        h: dotSize,
        fill: { color: DOT_COLOR },
        line: { width: 0 },
      });

      // Project name on the bar
      const shortName = bar.epicName
        .replace(/^ICAR\s*[-–—]?\s*/i, "")
        .trim();
      const labelW = barW - 0.15;
      if (labelW > 0.3) {
        slide.addText(shortName, {
          x: x1 + 0.05,
          y: rowY + barPadY,
          w: labelW,
          h: barH,
          fontSize: 7,
          fontFace: "Arial",
          bold: true,
          color: WHITE,
          valign: "middle",
        });
      }
    }

    // Draw last client label
    if (currentClient !== "") {
      drawClientLabel(
        slide,
        pptx,
        currentClient,
        CHART_Y + clientStartRow * rowH,
        (pageBars.length - clientStartRow) * rowH
      );
    }

    // ─── TODAY dashed line ───
    if (todayX !== null) {
      const lineTop = HEADER_Y;
      const lineBottom = CHART_Y + pageBars.length * rowH + 0.1;
      const segH = 0.12;
      const gapH = 0.08;
      for (let y = lineTop; y < lineBottom; y += segH + gapH) {
        const h = Math.min(segH, lineBottom - y);
        slide.addShape(pptx.ShapeType.rect, {
          x: todayX - 0.015,
          y: y,
          w: 0.03,
          h: h,
          fill: { color: TODAY_COLOR },
          line: { width: 0 },
        });
      }
      slide.addText("TODAY", {
        x: todayX - 0.3,
        y: lineBottom,
        w: 0.6,
        h: 0.2,
        fontSize: 8,
        fontFace: "Arial",
        bold: true,
        color: TODAY_COLOR,
        align: "center",
      });
    }
  }

  pptx.writeFile({ fileName: "iCar_Roadmap_OEM_Projects.pptx" });
}

function drawClientLabel(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  client: string,
  y: number,
  h: number
) {
  // Light cyan background rectangle with rounded corners
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.08,
    y: y + 0.04,
    w: LEFT_COL_W - 0.16,
    h: h - 0.08,
    fill: { color: CLIENT_BG },
    rectRadius: 0.06,
    line: { width: 0 },
  });

  // Client name (rotated vertically)
  slide.addText(client, {
    x: 0.08,
    y: y + 0.04,
    w: LEFT_COL_W - 0.16,
    h: h - 0.08,
    fontSize: 11,
    fontFace: "Arial",
    bold: true,
    color: CLIENT_TEXT,
    align: "center",
    valign: "middle",
    rotate: 270,
  });
}
