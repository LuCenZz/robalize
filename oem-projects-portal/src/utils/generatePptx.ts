import PptxGenJS from "pptxgenjs";
import type { EpicTask } from "../types";

const PURPLE = "6B2CF5";
const CYAN = "00BCD4";
const GREEN = "4CAF50";
const GRAY_BG = "E0E0E0";
const GRAY_HEADER = "9E9E9E";
const RED = "C62828";
const WHITE = "FFFFFF";

// Slide dimensions in inches (widescreen 16:9)
const SLIDE_W = 13.33;
const SLIDE_H = 7.5;

// Layout constants
const TITLE_H = 0.8;
const HEADER_Y = TITLE_H + 0.1;
const HEADER_H = 0.7; // quarter + month rows
const CHART_Y = HEADER_Y + HEADER_H;
const CHART_H = SLIDE_H - CHART_Y - 0.3;
const LEFT_COL_W = 1.2; // Client label column
const CHART_X = LEFT_COL_W;
const CHART_W = SLIDE_W - CHART_X - 0.2;

interface ProjectBar {
  epicName: string;
  client: string;
  startDate: Date;
  endDate: Date; // UAT start or last available phase start
}

export function generatePptx(tasks: EpicTask[]) {
  // Build project bars: from earliest phase start to UAT start date (or latest available)
  const bars: ProjectBar[] = [];

  for (const epic of tasks) {
    if (epic.phases.length === 0) continue;

    let minStart: Date | null = null;
    let uatStart: Date | null = null;

    for (const phase of epic.phases) {
      if (!minStart || phase.startDate < minStart) minStart = phase.startDate;
      // Use Customer UAT start as end point
      if (phase.phaseName === "Customer UAT") {
        uatStart = phase.startDate;
      }
    }

    if (!minStart) continue;

    // If no UAT, use the latest phase end date
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

  // Sort by client alphabetically, then by start date
  bars.sort((a, b) => {
    const cmp = a.client.localeCompare(b.client);
    if (cmp !== 0) return cmp;
    return a.startDate.getTime() - b.startDate.getTime();
  });

  // Determine timeline range
  let timelineStart: Date;
  let timelineEnd: Date;

  if (bars.length > 0) {
    const allStarts = bars.map((b) => b.startDate.getTime());
    const allEnds = bars.map((b) => b.endDate.getTime());
    const minTime = Math.min(...allStarts);
    const maxTime = Math.max(...allEnds);
    // Round to quarter boundaries
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

  // Create presentation
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";

  // How many rows per slide
  const rowH = 0.35;
  const maxRowsPerSlide = Math.floor(CHART_H / rowH);

  // Split bars into pages
  const pages: ProjectBar[][] = [];
  for (let i = 0; i < bars.length; i += maxRowsPerSlide) {
    pages.push(bars.slice(i, i + maxRowsPerSlide));
  }

  if (pages.length === 0) pages.push([]);

  // Build quarter/month headers data
  const quarters: { label: string; x: number; w: number }[] = [];
  const months: { label: string; x: number; w: number }[] = [];

  const qCursor = new Date(timelineStart);
  while (qCursor < timelineEnd) {
    const qStart = new Date(qCursor);
    const qMonth = qCursor.getMonth();
    const qEnd = new Date(
      qCursor.getFullYear(),
      qMonth + 3,
      1
    );
    const qLabel = `Q${Math.floor(qMonth / 3) + 1} ${qCursor.getFullYear()}`;
    const x1 = dateToX(qStart < timelineStart ? timelineStart : qStart);
    const x2 = dateToX(qEnd > timelineEnd ? timelineEnd : qEnd);
    quarters.push({ label: qLabel, x: x1, w: x2 - x1 });

    // Months within this quarter
    for (let m = 0; m < 3; m++) {
      const mStart = new Date(qCursor.getFullYear(), qMonth + m, 1);
      const mEnd = new Date(qCursor.getFullYear(), qMonth + m + 1, 1);
      if (mStart >= timelineEnd) break;
      const mx1 = dateToX(mStart < timelineStart ? timelineStart : mStart);
      const mx2 = dateToX(mEnd > timelineEnd ? timelineEnd : mEnd);
      const monthName = mStart.toLocaleDateString("en-GB", { month: "short" });
      months.push({ label: monthName, x: mx1, w: mx2 - mx1 });
    }

    qCursor.setMonth(qCursor.getMonth() + 3);
  }

  // Today line position
  const today = new Date();
  const todayX =
    today >= timelineStart && today <= timelineEnd ? dateToX(today) : null;

  for (const pageBars of pages) {
    const slide = pptx.addSlide();
    slide.background = { color: WHITE };

    // Title
    slide.addText("iCar Roadmap – OEM Projects", {
      x: 0.4,
      y: 0.15,
      w: SLIDE_W - 0.8,
      h: TITLE_H - 0.15,
      fontSize: 28,
      fontFace: "Arial",
      bold: true,
      color: PURPLE,
    });

    // Quarter headers
    for (const q of quarters) {
      slide.addShape(pptx.ShapeType.rect, {
        x: q.x,
        y: HEADER_Y,
        w: q.w,
        h: 0.35,
        fill: { color: GRAY_BG },
        line: { color: WHITE, width: 1 },
      });
      slide.addText(q.label, {
        x: q.x,
        y: HEADER_Y,
        w: q.w,
        h: 0.35,
        fontSize: 11,
        fontFace: "Arial",
        bold: true,
        color: GRAY_HEADER,
        align: "center",
        valign: "middle",
      });
    }

    // Month headers
    for (const m of months) {
      slide.addShape(pptx.ShapeType.rect, {
        x: m.x,
        y: HEADER_Y + 0.35,
        w: m.w,
        h: 0.35,
        fill: { color: GRAY_BG },
        line: { color: WHITE, width: 1 },
      });
      slide.addText(m.label, {
        x: m.x,
        y: HEADER_Y + 0.35,
        w: m.w,
        h: 0.35,
        fontSize: 10,
        fontFace: "Arial",
        bold: true,
        color: GRAY_HEADER,
        align: "center",
        valign: "middle",
      });
    }

    // Client label column background
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: CHART_Y,
      w: LEFT_COL_W,
      h: pageBars.length * rowH,
      fill: { color: "F3EEFE" },
      line: { width: 0 },
    });

    // Draw project bars
    let currentClient = "";
    let clientStartRow = 0;

    for (let r = 0; r < pageBars.length; r++) {
      const bar = pageBars[r];
      const rowY = CHART_Y + r * rowH;

      // Track client groups for label
      if (bar.client !== currentClient) {
        if (currentClient !== "") {
          // Draw previous client label
          drawClientLabel(
            slide,
            currentClient,
            CHART_Y + clientStartRow * rowH,
            (r - clientStartRow) * rowH
          );
        }
        currentClient = bar.client;
        clientStartRow = r;
      }

      // Bar
      const barStart = bar.startDate < timelineStart ? timelineStart : bar.startDate;
      const barEnd = bar.endDate > timelineEnd ? timelineEnd : bar.endDate;
      const x1 = dateToX(barStart);
      const x2 = dateToX(barEnd);
      const barW = Math.max(x2 - x1, 0.1);
      const barPadY = (rowH - 0.2) / 2;

      // Bar shape
      slide.addShape(pptx.ShapeType.roundRect, {
        x: x1,
        y: rowY + barPadY,
        w: barW,
        h: 0.2,
        fill: { color: CYAN },
        rectRadius: 0.05,
        line: { width: 0 },
      });

      // End dot (green circle)
      slide.addShape(pptx.ShapeType.ellipse, {
        x: x1 + barW - 0.1,
        y: rowY + barPadY + 0.02,
        w: 0.16,
        h: 0.16,
        fill: { color: GREEN },
        line: { width: 0 },
      });

      // Epic name label on the bar
      const labelW = barW - 0.15;
      if (labelW > 0.3) {
        slide.addText(bar.epicName.replace(/^ICAR\s*/i, ""), {
          x: x1 + 0.05,
          y: rowY + barPadY,
          w: labelW,
          h: 0.2,
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
        currentClient,
        CHART_Y + clientStartRow * rowH,
        (pageBars.length - clientStartRow) * rowH
      );
    }

    // TODAY line
    if (todayX !== null) {
      // Dashed line effect: multiple small segments
      const lineTop = HEADER_Y;
      const lineBottom = CHART_Y + pageBars.length * rowH;
      const segH = 0.15;
      const gapH = 0.1;
      for (let y = lineTop; y < lineBottom; y += segH + gapH) {
        const h = Math.min(segH, lineBottom - y);
        slide.addShape(pptx.ShapeType.rect, {
          x: todayX - 0.02,
          y: y,
          w: 0.04,
          h: h,
          fill: { color: RED },
          line: { width: 0 },
        });
      }
      slide.addText("TODAY", {
        x: todayX - 0.35,
        y: lineBottom,
        w: 0.7,
        h: 0.25,
        fontSize: 9,
        fontFace: "Arial",
        bold: true,
        color: RED,
        align: "center",
      });
    }
  }

  // Save
  pptx.writeFile({ fileName: "iCar_Roadmap_OEM_Projects.pptx" });
}

function drawClientLabel(
  slide: PptxGenJS.Slide,
  client: string,
  y: number,
  h: number
) {
  slide.addShape(("rect" as unknown) as PptxGenJS.ShapeType, {
    x: 0.05,
    y: y,
    w: LEFT_COL_W - 0.1,
    h: h,
    fill: { color: "E8E0FF" },
    rectRadius: 0.05,
    line: { width: 0 },
  });
  slide.addText(client, {
    x: 0.05,
    y: y,
    w: LEFT_COL_W - 0.1,
    h: h,
    fontSize: 10,
    fontFace: "Arial",
    bold: true,
    color: "6B2CF5",
    align: "center",
    valign: "middle",
    rotate: 270,
  });
}
