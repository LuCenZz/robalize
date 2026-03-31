# OEM Projects Portal — Design Spec

## Overview

A web portal that loads JIRA Epic data from CSV/Excel files and displays all projects in an interactive Gantt chart with dynamic filters on all available fields.

**Target**: POC, local usage only (single user).

## Data Source

- **Input**: CSV or Excel file exported from JIRA (drag & drop or file picker)
- **Reference file**: `iCar OEM PROJECTS (Jira).csv` (~975 rows, hundreds of columns)
- Each row represents one **Epic** (= one project)
- The portal auto-detects all columns for filtering

## Gantt Chart

### Layout

- **Single line per Epic**: each Epic is one row in the Gantt
- **5 colored phase segments** per row, based on date pairs from the CSV:

| Phase | Color | Start Column | End Column |
|-------|-------|-------------|------------|
| Analysis | `#ffd43b` (yellow) | `Custom field (Analysis Start Date)` | `Custom field (Analysis End Date)` |
| Development | `#ff922b` (orange) | `Custom field (Development Start Date)` | `Custom field (Development End Date)` |
| QA / Test | `#51cf66` (green) | `Custom field (QA Start Date)` | `Custom field (QA End Date)` |
| Customer UAT | `#339af0` (blue) | `Custom field (Customer UAT Start Date)` | `Custom field (Customer UAT End Date)` |
| Pilot | `#1864ab` (dark blue) | `Custom field (Pilot Start Date)` | `Custom field (Pilot End Date)` |

- Phases with missing dates are simply not displayed for that Epic
- Bars have slight shadow for visibility on white background

### Left Panel

- **Epic Name** (from `Summary` column)
- **Status** badge (colored pill matching current phase)
- Scrollable, synced with Gantt rows

### Timeline Header

- White background, dark text
- Month-based columns (Mar 2026, Apr 2026, etc.)
- Zoom levels: Day / Week / Month
- Horizontal scroll for navigation

### Interactions

- Hover on bar: tooltip with phase name, start date, end date
- Zoom in/out on timeline
- Scroll sync between left panel and timeline

## Filters

- **Dynamic generation**: all columns from the CSV are available as filters
- **"+ Add filter" button**: opens a dropdown listing all CSV columns not yet active
- Each filter is a dropdown/multi-select with unique values from that column
- **"Reset" button**: clears all active filters
- Filters update the Gantt in real-time (client-side filtering)
- Filter bar sits between the top navigation and the Gantt chart

## UI Design

### Branding

- **Nextlane corporate design**: primary color `#6B2CF5` (purple)
- Top navigation bar: Nextlane purple with white text
- "nextlane | OEM Projects" branding in top-left
- Upload button: white with purple text, rounded (pill shape)

### Color Palette

- Primary: `#6B2CF5` (Nextlane purple)
- Background: `#ffffff` (white)
- Gantt headers: white background, dark text, purple border separators (`#e8e0ff`)
- Filter bar background: `#f8f6ff` (very light purple)
- Row alternation: white / `#fdfcff`
- Borders: `#ece8f8` (light purple-tinted)

### Typography

- System font stack (`system-ui, sans-serif`)
- Headers: bold, dark (`#1a1a2e`)
- No grey backgrounds — keep everything bright and readable

## Tech Stack

- **Frontend**: React (Vite)
- **Gantt library**: DHTMLX Gantt (GPL version for POC)
- **File parsing**: Papa Parse (CSV), SheetJS/xlsx (Excel)
- **No backend server needed for POC** — all processing client-side
- **Node.js**: dev server only (Vite dev server)

## Architecture

```
oem-projects-portal/
├── public/
├── src/
│   ├── components/
│   │   ├── App.tsx              # Main layout
│   │   ├── TopBar.tsx           # Nextlane branded nav bar + upload button
│   │   ├── FilterBar.tsx        # Dynamic filter controls
│   │   ├── GanttChart.tsx       # DHTMLX Gantt wrapper
│   │   └── FileUploader.tsx     # Drag & drop / file picker
│   ├── utils/
│   │   ├── parseFile.ts         # CSV/Excel parsing
│   │   ├── transformData.ts     # Map CSV columns to Gantt tasks
│   │   └── filterEngine.ts      # Client-side filtering logic
│   ├── types/
│   │   └── index.ts             # TypeScript interfaces
│   ├── styles/
│   │   └── theme.ts             # Nextlane color constants
│   ├── main.tsx
│   └── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Data Flow

1. User uploads CSV/Excel file via `FileUploader`
2. `parseFile.ts` reads the file and returns an array of objects (one per row)
3. `transformData.ts` extracts the 5 date pairs and maps them to DHTMLX Gantt task format (one task per Epic, with sub-segments for each phase)
4. `FilterBar` auto-generates filter dropdowns from all column names and their unique values
5. When filters change, `filterEngine.ts` filters the dataset and updates the Gantt
6. `GanttChart` renders the filtered data using DHTMLX Gantt

## DHTMLX Gantt Configuration

- Use "project" task type with multiple segments per task (one segment per phase)
- Custom task rendering to apply phase colors
- Scale configuration: month/week/day zoom
- Read-only mode (no drag to edit)
- Columns in left grid: Epic Name, Status

## Out of Scope (for POC)

- JIRA API integration (future)
- Multi-user / authentication
- Data persistence (reload = re-upload)
- Server-side deployment
- Export functionality
