# Robalize — Backend + Auth + Data Persistence Design

## Overview

Transform the current client-only SPA ("OEM Projects Portal") into a full-stack application named **Robalize**, with Supabase for auth and database, Vercel for hosting and API routes, and persistent data storage replacing localStorage.

## Decisions

- **App name**: Robalize
- **Auth**: Microsoft OAuth + email/password (via Supabase Auth)
- **Roles**: admin (manage users + settings) / viewer (read-only). First user = admin.
- **Backend**: Vercel API routes (serverless, same repo)
- **Database**: Supabase PostgreSQL
- **Change tracking**: Snapshot per epic (full data copy) on each import/sync when changes detected
- **Deployment**: Vercel + Supabase (hosted)

## Repo Structure (Option A — frontend at root)

```
robalize/
├── api/                        # Vercel serverless API routes
│   ├── import.ts               # CSV/Excel import + change detection
│   ├── jira-sync.ts            # JIRA fetch + change detection
│   └── admin/
│       └── users.ts            # Admin: list/update user roles
├── src/                        # React frontend (migrated from oem-projects-portal/)
│   ├── components/
│   │   ├── App.tsx
│   │   ├── TopBar.tsx
│   │   ├── GanttChart.tsx
│   │   ├── FilterBar.tsx
│   │   ├── FileUploader.tsx
│   │   ├── JiraConnector.tsx
│   │   ├── LoginPage.tsx       # Rewritten: Supabase auth
│   │   ├── AiPanel.tsx
│   │   └── AdminPanel.tsx      # New: user management
│   ├── utils/
│   │   ├── parseFile.ts
│   │   ├── transformData.ts
│   │   ├── filterEngine.ts
│   │   ├── generatePptx.ts
│   │   └── jiraFetch.ts        # Kept for client-side JIRA config UI
│   ├── lib/
│   │   └── supabase.ts         # Supabase client initialization
│   ├── hooks/
│   │   ├── useAuth.ts          # Auth state, login, logout, session
│   │   └── useData.ts          # Load/save projects + settings from Supabase
│   ├── types/
│   │   └── index.ts
│   ├── styles/
│   │   └── theme.ts
│   ├── App.css
│   └── main.tsx
├── supabase/
│   └── migrations/
│       └── 001_initial.sql     # Tables + RLS + trigger
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vercel.json
├── .env.local                  # Local env vars (not committed)
└── .env.example                # Template for env vars
```

## Supabase Schema

### Table `profiles`

Automatically populated via trigger on `auth.users` insert.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | | References `auth.users.id` |
| email | text NOT NULL | | |
| display_name | text | | Extracted from email or OAuth profile |
| role | text NOT NULL | 'viewer' | 'admin' or 'viewer' |
| avatar_url | text | | From OAuth provider |
| created_at | timestamptz | now() | |
| updated_at | timestamptz | now() | |

### Table `settings`

User preferences stored as key-value pairs with JSONB values.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | gen_random_uuid() | |
| user_id | uuid NOT NULL | | FK → profiles.id |
| key | text NOT NULL | | e.g. 'jira_config', 'filter_favorites', 'col_widths' |
| value | jsonb NOT NULL | | |
| updated_at | timestamptz | now() | |

**Unique constraint**: `(user_id, key)`

Known setting keys:
- `jira_config` — `{ email, apiToken, jql, maxRows, refreshInterval }`
- `filter_favorites` — `["Status", "Custom field (Client)", ...]`
- `col_widths` — `{ product: 100, acto: 80, epicName: 250, status: 120, progress: 70 }`
- `active_filters` — `[{ column, values }]`
- `search_term` — `"search text"`

### Table `projects`

One row per epic per user. Upserted on each import/sync.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | gen_random_uuid() | |
| user_id | uuid NOT NULL | | FK → profiles.id |
| epic_key | text NOT NULL | | e.g. 'ACTO-12345' |
| data | jsonb NOT NULL | | Full CSV/JIRA row as key-value pairs |
| source | text NOT NULL | | 'csv' or 'jira' |
| imported_at | timestamptz | now() | |

**Unique constraint**: `(user_id, epic_key)`

### Table `snapshots`

Historical record. One snapshot per epic each time a change is detected.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | gen_random_uuid() | |
| project_id | uuid NOT NULL | | FK → projects.id |
| user_id | uuid NOT NULL | | FK → profiles.id (denormalized for RLS) |
| data | jsonb NOT NULL | | Full epic data at this point in time |
| source | text NOT NULL | | 'csv' or 'jira' |
| changed_fields | text[] | | List of field names that changed vs previous |
| created_at | timestamptz | now() | |

### Row Level Security (RLS)

All tables have RLS enabled:

- **profiles**: Users can read their own profile. Admins can read all profiles.
- **settings**: Users can CRUD their own settings only.
- **projects**: Users can CRUD their own projects. Admins can read all.
- **snapshots**: Users can read their own snapshots. Admins can read all. Insert via API only.

### Trigger: auto-create profile

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    CASE WHEN (SELECT count(*) FROM public.profiles) = 0 THEN 'admin' ELSE 'viewer' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

## Auth Flow

1. **Login page** (`/login`): Robalize branded, three options:
   - "Sign in with Microsoft" button → Supabase `signInWithOAuth({ provider: 'azure' })`
   - Email + password form → Supabase `signInWithPassword()` or `signUp()`
2. **Session**: Supabase manages JWT tokens, auto-refresh
3. **Protected routes**: `useAuth` hook checks session. No session → redirect to login.
4. **Profile creation**: Automatic via trigger (first user = admin)
5. **Logout**: Supabase `signOut()`, clear local state, redirect to login

## API Routes

### `POST /api/import`

Receives parsed CSV/Excel data from the client, compares with existing projects in DB, creates snapshots for changes, upserts projects.

**Request body**: `{ rows: RawRow[] }`
**Auth**: Requires valid Supabase JWT (passed via `Authorization: Bearer <token>`)
**Logic**:
1. Validate JWT, get user_id
2. Fetch existing projects for this user from `projects` table
3. For each incoming row:
   - Find existing project by `epic_key`
   - If exists and data differs → insert snapshot with `changed_fields`
   - Upsert project with new data
4. Return `{ imported: number, changed: number, new: number }`

### `POST /api/jira-sync`

Server-side JIRA fetch (moves JIRA credentials out of the client for security).

**Request body**: `{ jql: string, maxRows: number }`
**Auth**: Requires valid Supabase JWT
**Logic**:
1. Validate JWT, get user_id
2. Read JIRA config from `settings` table for this user
3. Fetch from JIRA API (paginated)
4. Transform JIRA response to flat rows (same format as CSV)
5. Run same import logic (compare, snapshot, upsert)
6. Return `{ imported, changed, new }`

### `GET/PUT /api/admin/users`

Admin-only endpoint to list users and update roles.

**Auth**: Requires valid JWT + admin role
**GET**: Returns all profiles
**PUT**: Update a user's role `{ userId, role }`

## Data Flow Changes

### Before (current)
```
CSV/JIRA → client parsing → localStorage → GanttChart
```

### After
```
CSV → client parsing → POST /api/import → Supabase DB → client load → GanttChart
JIRA → POST /api/jira-sync → Supabase DB → client load → GanttChart
Settings → Supabase settings table (via client SDK)
```

### Client-side changes
- `useAuth` hook replaces current `LoginPage` logic
- `useData` hook replaces `localStorage` read/write with Supabase queries
- `loadData()` in App.tsx → calls `useData.saveProjects()` then reloads from DB
- Settings (filters, col widths, JIRA config) → `useData.saveSetting()` / `useData.loadSetting()`
- JIRA credentials move from client to server (stored in `settings`, used by API route)

## Migration from Current State

1. Move `oem-projects-portal/src/` → `src/` at repo root
2. Move `oem-projects-portal/public/` → `public/`
3. Move `oem-projects-portal/index.html` → `index.html`
4. Update `package.json`, `tsconfig.json`, `vite.config.ts` at root
5. Add `vercel.json` for API routes config
6. Add `supabase/` directory with migrations
7. Add `.env.example` with required vars
8. Rebrand: "nextlane OEM Projects" → "Robalize" in TopBar, title, login page
9. Replace localStorage usage with Supabase calls
10. Rewrite LoginPage for Supabase auth

## Environment Variables

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Server-side only, for API routes
VITE_SUPABASE_URL=https://xxx.supabase.co         # Client-side
VITE_SUPABASE_ANON_KEY=eyJ...                     # Client-side
```

## Out of Scope (for this phase)

- Real-time collaboration (multiple users editing simultaneously)
- File storage in Supabase Storage (CSV files themselves)
- Email notifications
- Audit log UI for viewing snapshots/change history
- Team/organization concept (multi-tenancy)
