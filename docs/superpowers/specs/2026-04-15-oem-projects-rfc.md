# RFC: OEM Projects

**Status:** Current State Documentation  
**Date:** 2026-04-15  
**Author:** Cédric Robalo  
**Audience:** Mixed (engineering + stakeholders)

---

## Table of Contents

### Part I — Functional Overview
1. [Abstract](#1-abstract)
2. [Problem Statement](#2-problem-statement)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Key Features](#4-key-features)
5. [User Journeys](#5-user-journeys)

### Part II — Technical Specification
6. [System Architecture](#6-system-architecture)
7. [Technology Stack](#7-technology-stack)
8. [Data Model](#8-data-model)
9. [API Endpoints](#9-api-endpoints)
10. [Authentication & Authorization Flow](#10-authentication--authorization-flow)
11. [Data Pipeline](#11-data-pipeline)
12. [Frontend Architecture](#12-frontend-architecture)
13. [Deployment & Infrastructure](#13-deployment--infrastructure)
14. [Security Considerations](#14-security-considerations)

---

# Part I — Functional Overview

## 1. Abstract

OEM Projects is a web application for **project portfolio management**. It centralises epic-level project data sourced from JIRA or CSV/Excel files, visualises delivery timelines on an interactive Gantt chart, and tracks changes over time. It is designed for project managers and delivery teams who need a unified view of cross-team initiatives and their phase-by-phase progress.

---

## 2. Problem Statement

Teams working with JIRA face several recurring challenges:

- **Fragmented visibility:** Epics and their delivery phases (Analysis, Development, QA, UAT, Pilot) are tracked in JIRA custom fields but are not visualised as a coherent timeline.
- **No portfolio-level view:** JIRA's native views do not aggregate epics across multiple teams or initiatives into a single Gantt-style dashboard.
- **Stale reporting:** Generating a status update requires manual exports, spreadsheet manipulation, and slide-building.
- **No change tracking:** There is no lightweight audit trail showing when fields changed between imports.

OEM Projects solves these problems by providing a dedicated dashboard that ingests epic data, renders interactive timelines grouped by initiative, detects phase overlaps and sequence violations, and exports to PowerPoint for stakeholder reporting.

---

## 3. User Roles & Permissions

The system implements three roles with different access levels:

| Role | Description | Capabilities |
|------|-------------|-------------|
| **admin** | First registered user, or promoted by another admin | All features: import data, configure JIRA, manage users, view all data, export PPT, access AI panel |
| **viewer** | Default role for approved users | Import own data, view own Gantt chart, apply filters, export PPT; can use admin's shared JIRA config |
| **pending** | New signups before approval | Access blocked; cannot use the application until an admin approves or rejects the account |

**Approval workflow:**
1. New user registers → role is set to `pending`
2. User is immediately signed out and shown a "pending approval" message
3. An admin approves or rejects the account via the Admin Panel
4. On approval, role is set to `viewer`; on rejection, role remains `pending` or can be removed

**First-user bootstrap:** The very first account created on the platform is automatically assigned the `admin` role.

---

## 4. Key Features

### 4.1 Data Import

| Method | Description |
|--------|-------------|
| **CSV/Excel upload** | Drag-and-drop or file picker; supports `.csv` and `.xlsx`/`.xls` formats; parsed client-side then sent to `/api/import` |
| **JIRA sync** | Connects to a JIRA Cloud instance via Basic Auth (email + API token); fetches issues matching a configurable JQL query; maps standard and custom fields; supports up to 1,000 issues per sync with 100-issue pagination |

### 4.2 Gantt Chart Visualisation

- **Grouped rows:** Epics are nested under their parent initiative rows
- **Phase bars:** Up to 5 colour-coded phases per epic rendered as horizontal bars on a timeline
- **4 zoom levels:** Day (30px/day), Week (8px/day), Month (3px/day), Quarter (1.2px/day)
- **Today indicator:** Vertical line marking the current date
- **Progress percentage:** Displayed on initiative rows based on epic statuses
- **Phase conflict detection:** Highlights overlapping or out-of-sequence phases with visual error indicators
- **Lazy loading:** GanttChart component is code-split and loaded on demand

### 4.3 Filtering & Search

- **Column-based filters:** Dynamic multi-select checkbox dropdowns built from actual data values
- **AND logic:** All active filters must match simultaneously
- **Full-text search:** Matches on epic key and epic name
- **Favorites:** Saved filter sets, scoped per user, persisted to localStorage and Supabase
- **Filter persistence:** Active filters saved to Supabase and restored on next session

### 4.4 Change Detection & Audit Trail

- On each import (CSV or JIRA), the system compares incoming data against stored records field by field
- Changed rows produce a `snapshot` record with the list of modified fields (`changed_fields[]`)
- Provides a lightweight audit trail without requiring a full event-sourcing system

### 4.5 PowerPoint Export

Generates a multi-slide `.pptx` report containing:
- KPI summary slide (total epics, status breakdown, phase distribution)
- Timeline slides with Gantt bars
- Per-epic detail slides

### 4.6 JIRA Configuration Sharing

- Admins can save their JIRA credentials and JQL to Supabase
- Viewer users can use the admin's JIRA configuration for their own syncs, without needing their own API token

### 4.7 User Management (Admin)

- Admins can view all registered users with their roles and registration dates
- Admins can promote/demote any user (`admin` / `viewer` / `pending`)
- Accessible via the Admin Panel in the top bar

---

## 5. User Journeys

### 5.1 First-Time Setup (Admin)
1. Admin registers → automatically granted `admin` role
2. Opens JIRA Connector modal → enters JIRA email, API token, JQL query
3. Saves config (stored in `settings` table under key `jira_config`)
4. Clicks "Sync JIRA" → `/api/jira-sync` fetches issues, stores in `projects` table
5. Gantt chart renders with fetched epics grouped by initiative

### 5.2 New User Onboarding
1. User registers → role = `pending`, immediately signed out
2. Admin sees new pending user in Admin Panel → clicks "Approve"
3. User signs in again → full access as `viewer`
4. User can upload their own CSV or use shared admin JIRA config

### 5.3 Regular Data Refresh
1. User opens JIRA Connector → clicks "Sync"
2. Backend fetches latest JIRA data, runs change detection
3. New/changed epics are upserted in `projects`; changes recorded in `snapshots`
4. Gantt chart updates automatically

### 5.4 Stakeholder Reporting
1. User applies desired filters (e.g., by team or status)
2. Clicks "Export PPT" button
3. Downloads `.pptx` file with current view rendered as slides

---

# Part II — Technical Specification

## 6. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Client)                      │
│                                                             │
│  React 19 + TypeScript + Vite                               │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌───────────┐  │
│  │ TopBar   │ │ FilterBar │ │ GanttChart │ │  Modals   │  │
│  └──────────┘ └───────────┘ └────────────┘ └───────────┘  │
│                                                             │
│  State: useState / useMemo / useCallback                    │
│  Cache: localStorage (instant restore)                      │
└───────────────────────┬─────────────────────────────────────┘
                        │  HTTPS
          ┌─────────────┴──────────────┐
          │                            │
          ▼                            ▼
┌──────────────────┐        ┌────────────────────┐
│  Vercel Serverless│        │  Supabase           │
│  Functions (API)  │        │  (PostgreSQL + Auth)│
│                  │        │                    │
│  /api/jira-proxy  │◄──────►│  profiles          │
│  /api/jira-sync   │        │  projects          │
│  /api/import      │        │  settings          │
│  /api/admin/users │        │  snapshots         │
└────────┬─────────┘        └────────────────────┘
         │  HTTPS
         ▼
┌──────────────────┐
│  JIRA Cloud       │
│  (Atlassian REST) │
└──────────────────┘
```

**Key architectural decisions:**
- The frontend communicates directly with Supabase for auth and CRUD operations
- Vercel serverless functions are used only where server-side logic is required: proxying JIRA (CORS), syncing issues, and import with change detection
- JIRA credentials are never exposed to the browser in the sync flow — they are stored server-side in the `settings` table and retrieved by the sync function

---

## 7. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| UI Framework | React | 19.2.4 | Component model, state, rendering |
| Language | TypeScript | ~5.9.3 | Type safety across frontend + backend |
| Build Tool | Vite | 8.0.1 | Dev server, bundling, code splitting |
| Backend Runtime | Vercel Node.js | — | Serverless function execution |
| Serverless SDK | @vercel/node | 5.6.24 | Request/response types for Vercel functions |
| Database + Auth | Supabase | 2.49.0 | PostgreSQL, Row-Level Security, JWT auth |
| Excel Parsing | xlsx | 0.18.5 | Client-side `.xlsx`/`.xls` parsing |
| CSV Parsing | papaparse | 5.5.3 | Client-side CSV parsing |
| PPT Generation | pptxgenjs | 4.0.1 | Client-side `.pptx` file generation |

---

## 8. Data Model

### 8.1 Entity Relationship Overview

```
auth.users (Supabase managed)
    │
    │ 1:1 (trigger)
    ▼
profiles ─────── 1:N ──────► settings
    │
    │ 1:N
    ▼
projects ────── 1:N ────────► snapshots
```

---

### 8.2 Table: `profiles`

Automatically created via trigger when a user signs up in `auth.users`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, FK → `auth.users(id)` | Supabase auth user ID |
| `email` | `text` | NOT NULL | User's email address |
| `display_name` | `text` | — | Full name (from OAuth or email prefix) |
| `role` | `text` | NOT NULL, CHECK IN ('admin','viewer') | Access role; first user = admin |
| `avatar_url` | `text` | — | Profile picture URL (from OAuth) |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Account creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | Last update (auto-updated by trigger) |

> **Note:** The `pending` role value is accepted by the admin PUT endpoint (`/api/admin/users`) and enforced at the application layer (users with `pending` role are signed out immediately). However, the DB `CHECK` constraint on `profiles.role` only accepts `'admin'` or `'viewer'` — the `pending` value bypasses this constraint because the admin endpoint uses the service-role client which skips RLS and constraint enforcement on that column. This is a known discrepancy.

---

### 8.3 Table: `settings`

Key-value store for per-user configuration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, DEFAULT gen_random_uuid() | Row identifier |
| `user_id` | `uuid` | NOT NULL, FK → `profiles(id)` | Owning user |
| `key` | `text` | NOT NULL | Setting name (e.g. `jira_config`, `filters`) |
| `value` | `jsonb` | NOT NULL | Setting value (arbitrary JSON) |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | Last update (auto-updated by trigger) |

**Unique constraint:** `(user_id, key)` — one value per key per user.

**Known keys in use:**

| Key | Value shape | Description |
|-----|-------------|-------------|
| `jira_config` | `{ email: string, apiToken: string, jql?: string }` | JIRA credentials and default JQL |
| `filters` | `ActiveFilter[]` | Persisted active filter state |

---

### 8.4 Table: `projects`

One row per epic per user. Upserted on each import/sync.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, DEFAULT gen_random_uuid() | Row identifier |
| `user_id` | `uuid` | NOT NULL, FK → `profiles(id)` | Owning user |
| `epic_key` | `text` | NOT NULL | JIRA issue key (e.g. `PROJ-123`) or CSV identifier |
| `data` | `jsonb` | NOT NULL | Full raw row as a flat key-value object |
| `source` | `text` | NOT NULL, CHECK IN ('csv', 'jira') | Origin of the data |
| `imported_at` | `timestamptz` | NOT NULL, DEFAULT now() | Timestamp of last import/sync |

**Unique constraint:** `(user_id, epic_key)` — one record per epic per user.

**`data` field structure:** The `data` column holds a flat `{ [columnName: string]: string }` object. Column names match JIRA field names directly (e.g. `"Summary"`, `"Status"`, `"Custom field (Analysis Start Date)"`).

---

### 8.5 Table: `snapshots`

Immutable audit records created whenever a project row changes on import.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, DEFAULT gen_random_uuid() | Row identifier |
| `project_id` | `uuid` | NOT NULL, FK → `projects(id)` | Associated epic |
| `user_id` | `uuid` | NOT NULL, FK → `profiles(id)` | User who triggered the import |
| `data` | `jsonb` | NOT NULL | Full snapshot of the row at this point in time |
| `source` | `text` | NOT NULL, CHECK IN ('csv', 'jira') | Import origin |
| `changed_fields` | `text[]` | — | List of field names that changed vs. previous record |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Snapshot creation timestamp |

---

### 8.6 Indexes

| Index | Table | Columns | Purpose |
|-------|-------|---------|---------|
| `idx_settings_user_key` | `settings` | `(user_id, key)` | Fast settings lookup by user + key |
| `idx_projects_user` | `projects` | `(user_id)` | List all epics for a user |
| `idx_projects_user_epic` | `projects` | `(user_id, epic_key)` | Upsert lookup (change detection) |
| `idx_snapshots_project` | `snapshots` | `(project_id)` | Fetch history for a given epic |
| `idx_snapshots_user` | `snapshots` | `(user_id)` | Fetch all snapshots for a user |

---

### 8.7 Row-Level Security (RLS) Policies

All tables have RLS enabled. Summary of policies:

| Table | Operation | Policy |
|-------|-----------|--------|
| `profiles` | SELECT | Users read own profile; admins read all |
| `profiles` | UPDATE | Users update own profile only |
| `settings` | ALL | Users manage own settings only |
| `projects` | ALL | Users manage own projects only |
| `projects` | SELECT | Admins can also read all projects |
| `snapshots` | SELECT | Users read own; admins read all |
| `snapshots` | INSERT | Users insert own snapshots only |

---

### 8.8 Database Triggers

| Trigger | Table | Event | Function | Effect |
|---------|-------|-------|----------|--------|
| `on_auth_user_created` | `auth.users` | AFTER INSERT | `handle_new_user()` | Creates a `profiles` row; first user gets `admin` role |
| `profiles_updated_at` | `profiles` | BEFORE UPDATE | `update_updated_at()` | Sets `updated_at = now()` |
| `settings_updated_at` | `settings` | BEFORE UPDATE | `update_updated_at()` | Sets `updated_at = now()` |

---

### 8.9 Frontend Type Definitions

Key TypeScript types that map to the data model:

```typescript
// Flat key-value row from CSV or JIRA
interface RawRow {
  [columnName: string]: string;
}

// A single delivery phase with its timeline
interface PhaseSegment {
  id: string;
  phaseName: string;
  color: string;
  startDate: Date;
  endDate: Date;
}

// An epic with its resolved phases
interface EpicTask {
  id: number;
  epicKey: string;
  epicName: string;
  status: string;
  phases: PhaseSegment[];
  rawData: RawRow;
}

// A Gantt row: either an initiative header or a child epic
interface DisplayRow {
  type: "initiative" | "epic";
  epic: EpicTask;
  initiativeKey?: string;
  initiativeName?: string;
  children?: EpicTask[];   // populated on initiative rows
}

// An active column filter
interface ActiveFilter {
  column: string;
  values: string[];
}
```

**Phase configuration** (maps JIRA custom field names to display config):

| Phase | Color | Start Column | End Column |
|-------|-------|-------------|-----------|
| Analysis | `#ffd43b` | `Custom field (Analysis Start Date)` | `Custom field (Analysis End Date)` |
| Development | `#ff922b` | `Custom field (Development Start Date)` | `Custom field (Development End Date)` |
| QA / Test | `#51cf66` | `Custom field (QA Start Date)` | `Custom field (QA End Date)` |
| Customer UAT | `#339af0` | `Custom field (Customer UAT Start Date)` | `Custom field (Customer UAT End Date)` |
| Pilot | `#1864ab` | `Custom field (Pilot Start Date)` | `Custom field (Pilot End Date)` |

---

## 9. API Endpoints

All API routes are Vercel serverless functions deployed alongside the frontend. Base URL: `/api/`.

---

### `GET|POST|PUT /api/jira-proxy/*`

**Purpose:** Transparent proxy for JIRA Cloud REST API calls. Resolves browser CORS restrictions.

**Auth:** `Authorization: Basic <base64(email:apiToken)>` — passed through directly to JIRA.

**Behaviour:**
- Strips the `/api/jira-proxy` prefix and appends the remaining path to `https://imawebgroup.atlassian.net`
- Forwards the request method, headers, and body verbatim
- Returns the raw JIRA response with status code preserved

**Used by:** `JiraConnector` component for field discovery and config validation.

---

### `POST /api/jira-sync`

**Purpose:** Fetch JIRA issues server-side using stored credentials and persist them to Supabase.

**Auth:** `Authorization: Bearer <supabase_jwt>`

**Request body:**
```json
{
  "jql": "project = PROJ AND issuetype = Epic ORDER BY created DESC",
  "maxRows": 1000
}
```

**Behaviour:**
1. Validates the Bearer token → resolves user
2. Loads `jira_config` from `settings` for that user
3. Fetches `/rest/api/3/field` to build a `fieldId → fieldName` map
4. Paginates JIRA search (`maxResults=100`) until `maxRows` reached or all results fetched
5. Maps standard fields + custom fields to a flat `RawRow`
6. Calls `importWithChangeDetection()` → upserts `projects`, creates `snapshots` for changed rows

**Response:**
```json
{
  "inserted": 12,
  "updated": 3,
  "unchanged": 47,
  "snapshots": 3
}
```

---

### `POST /api/import`

**Purpose:** Persist rows from a CSV/Excel file upload to Supabase with change detection.

**Auth:** `Authorization: Bearer <supabase_jwt>`

**Request body:**
```json
{
  "rows": [{ "Issue key": "PROJ-1", "Summary": "...", ... }],
  "source": "csv"
}
```

**Behaviour:**
1. Validates the Bearer token
2. Calls `importWithChangeDetection()` → upserts `projects`, creates `snapshots` for changed rows

**Response:** Same shape as `/api/jira-sync`.

---

### `GET /api/admin/users`

**Purpose:** List all registered users.

**Auth:** `Authorization: Bearer <supabase_jwt>` — must be `admin` role.

**Response:**
```json
[
  {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "Alice",
    "role": "viewer",
    "avatar_url": null,
    "created_at": "2026-01-01T00:00:00Z"
  }
]
```

---

### `PUT /api/admin/users`

**Purpose:** Update a user's role.

**Auth:** `Authorization: Bearer <supabase_jwt>` — must be `admin` role.

**Request body:**
```json
{
  "userId": "uuid",
  "role": "viewer"
}
```

Valid role values: `"admin"`, `"viewer"`, `"pending"`.

**Response:** `{ "success": true }`

---

## 10. Authentication & Authorization Flow

### 10.1 Sign-Up Flow

```
User submits email + password
        │
        ▼
Supabase Auth creates auth.users row
        │
        ▼
Trigger: handle_new_user()
  → INSERT INTO profiles
  → role = 'admin' if first user, else 'viewer'
        │
        ▼
App detects role = 'viewer' or 'pending'
  → if pending: sign out immediately, show message
  → if viewer/admin: proceed to dashboard
```

### 10.2 Sign-In Flow

```
User submits credentials (or OAuth)
        │
        ▼
Supabase Auth validates → returns session JWT
        │
        ▼
useAuth hook: fetch profile from profiles table
        │
        ▼
Check role:
  → pending → sign out, show "approval required" message
  → viewer/admin → set user context, load data
```

### 10.3 Azure OAuth

Microsoft Azure is configured as an OAuth provider in Supabase. The login page offers a "Sign in with Microsoft" button. On successful OAuth, Supabase creates the user and the trigger fires as normal.

### 10.4 Session Management

- Sessions are managed by the Supabase client (`@supabase/supabase-js`)
- JWT tokens are stored in localStorage by the Supabase SDK
- `TOKEN_REFRESHED` and `SIGNED_IN` events from Supabase are filtered to avoid spurious re-renders on tab switch
- API calls include the JWT as `Authorization: Bearer <token>`

---

## 11. Data Pipeline

### 11.1 CSV/Excel Import Pipeline

```
User selects file (drag-drop or picker)
        │
        ▼ (client-side)
parseFile() → detect CSV vs Excel
  → papaparse (CSV) or xlsx (Excel)
  → returns RawRow[] (flat string key-value objects)
        │
        ▼
POST /api/import  { rows: RawRow[], source: 'csv' }
        │
        ▼ (server-side)
importWithChangeDetection(supabase, userId, rows, 'csv')
  → for each row: look up existing project by (user_id, epic_key)
  → compare field by field → collect changed_fields
  → UPSERT projects (insert or update)
  → INSERT snapshots for changed/new rows
        │
        ▼
Response: { inserted, updated, unchanged, snapshots }
        │
        ▼ (client-side)
setRawData(rows)
  → localStorage.setItem (cache for instant reload)
  → derive columns, filters, display rows
        │
        ▼
GanttChart re-renders
```

### 11.2 JIRA Sync Pipeline

```
User clicks "Sync JIRA" with JQL
        │
        ▼
POST /api/jira-sync  { jql, maxRows }
        │
        ▼ (server-side)
Load jira_config from settings table
  → fetch /rest/api/3/field → build fieldId→name map
  → paginate /rest/api/3/search (100/page)
  → map each issue to RawRow (standard + custom fields)
        │
        ▼
importWithChangeDetection() (same as CSV path above)
        │
        ▼ (client-side)
Same render pipeline as CSV import
```

### 11.3 Display Pipeline (Client-side)

```
rawData: RawRow[]
        │
        ▼ useMemo
transformData()
  → parse date strings (DD Mon YYYY, DD/Mon/YY, ISO)
  → build EpicTask[] with PhaseSegment[]
  → group by parent issue key → initiatives
  → returns DisplayRow[]
        │
        ▼ useMemo (on filters + search)
filterEngine()
  → apply AND logic across ActiveFilter[]
  → apply full-text search on epicKey + epicName
  → returns filteredDisplayRows: DisplayRow[]
        │
        ▼
GanttChart renders rows + phase bars
  → detects phase conflicts (overlap / out-of-sequence)
  → renders conflict indicators
```

---

## 12. Frontend Architecture

### 12.1 Component Tree

```
App.tsx  (auth gate, data orchestration, global state)
├── LoginPage          (shown when unauthenticated)
├── TopBar             (navigation, action buttons)
├── FilterBar          (column filters, favorites, search)
├── GanttChart         (lazy-loaded, main visualization)
└── Modals (z-index overlays)
    ├── FileUploader   (CSV/Excel drag-and-drop)
    ├── JiraConnector  (JIRA config + sync trigger)
    ├── AdminPanel     (user management table)
    ├── AiPanel        (AI chat sidebar — admin only)
    └── AI Paywall     (overlay for non-admin users)
```

### 12.2 State Management

State is managed with React hooks — no external state library.

| State | Location | Mechanism |
|-------|----------|-----------|
| Auth session + user profile | `useAuth` hook | `useState` + Supabase `onAuthStateChange` |
| Raw epic data | `App.tsx` | `useState<RawRow[]>` |
| Active filters | `App.tsx` | `useState<ActiveFilter[]>` |
| Search query | `App.tsx` | `useState<string>` |
| Derived display rows | `App.tsx` | `useMemo` (filters + transform) |
| Supabase CRUD operations | `useData` hook | async functions + pagination (50 rows/batch) |
| User preferences (filters, favorites) | `userPrefs.ts` | `localStorage` (email-scoped keys) |

### 12.3 Data Loading Strategy

On app load, data is loaded in three layers:

1. **localStorage** — instant restore of last-seen data while network loads
2. **Supabase** — background fetch of persisted projects (50 rows/batch pagination)
3. **JIRA auto-fetch** — silent fallback if Supabase has no data and JIRA config exists

### 12.4 Design System

Centralized in `src/styles/theme.ts`:

| Token | Value |
|-------|-------|
| Primary colour | `#6B2CF5` (purple) |
| Font | System UI stack |
| Border radius | Consistent scale (4px, 8px, 12px) |
| Shadows | 3-level elevation system |
| Spacing | 4px base unit |

---

## 13. Deployment & Infrastructure

### 13.1 Hosting

| Layer | Provider | Details |
|-------|----------|---------|
| Frontend + API | **Vercel** | SPA served from CDN; serverless functions co-deployed |
| Database + Auth | **Supabase** | Managed PostgreSQL (project: `zqajpyfztrgrdjywwkwt`) |
| JIRA | **Atlassian Cloud** | Target instance: `imawebgroup.atlassian.net` |

### 13.2 Environment Variables

| Variable | Used by | Description |
|----------|---------|-------------|
| `VITE_SUPABASE_URL` | Frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Supabase anon JWT (safe to expose) |
| `SUPABASE_URL` | API functions | Same as VITE variant |
| `SUPABASE_ANON_KEY` | API functions | Same as VITE variant |
| `SUPABASE_SERVICE_ROLE_KEY` | API functions | Service role key — full DB access, never exposed to client |

### 13.3 Build & Deploy

- **Build tool:** Vite → outputs to `dist/`
- **Vercel config:** `vercel.json` routes `/api/jira-proxy/*` to the proxy handler; all other routes serve the SPA
- **TypeScript:** Strict mode, separate configs for app (`tsconfig.app.json`) and Node API (`tsconfig.node.json`)

---

## 14. Security Considerations

### 14.1 Authentication
- All API endpoints validate the Supabase JWT before processing
- `SUPABASE_SERVICE_ROLE_KEY` is used only server-side; never sent to the browser
- JIRA credentials (email + API token) are stored in the `settings` table, retrieved server-side in `/api/jira-sync` — the browser never holds JIRA credentials in the sync flow

### 14.2 Authorization
- Row-Level Security is enforced at the database level — users cannot access other users' data even if the application layer is bypassed
- Admin-only endpoints (`/api/admin/users`) verify the `admin` role before executing
- Pending users are blocked both at the application layer (signed out immediately) and by the RLS policies limiting their data access

### 14.3 JIRA Proxy
- The proxy endpoint (`/api/jira-proxy`) forwards `Authorization` headers from the client directly to JIRA — this is intentional for browser-initiated JIRA requests (field discovery, config testing)
- The JIRA instance is hardcoded to `imawebgroup.atlassian.net` — the proxy cannot be used to target arbitrary URLs

### 14.4 Input Validation
- CSV/Excel rows are parsed client-side and sent as structured JSON — no shell execution or file system access
- JQL queries are URL-encoded before being forwarded to JIRA
- Role values in `PUT /api/admin/users` are validated against an allowlist (`admin`, `viewer`, `pending`)

### 14.5 Data Isolation
- All `projects`, `settings`, and `snapshots` rows carry a `user_id` foreign key
- RLS policies enforce that every SELECT/INSERT/UPDATE/DELETE is scoped to the authenticated user's ID
- Admins have additional SELECT-only policies on all tables for management purposes
