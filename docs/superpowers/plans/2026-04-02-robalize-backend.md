# Robalize Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the OEM Projects Portal into "Robalize" — a full-stack app with Supabase auth, persistent data storage, change tracking, and Vercel deployment.

**Architecture:** React SPA at repo root, Vercel API routes in `/api`, Supabase for auth (Microsoft OAuth + email/password) and PostgreSQL database. Data flows from CSV/JIRA → API route → Supabase DB → client. User settings persisted in DB instead of localStorage.

**Tech Stack:** React 18, TypeScript, Vite, Supabase (Auth + PostgreSQL), Vercel (hosting + serverless functions), @supabase/supabase-js

---

## File Structure

```
robalize/                           (repo root = current "OEM PROJECTS")
├── api/                            # NEW: Vercel API routes
│   ├── import.ts                   # POST: CSV import + change detection
│   ├── jira-sync.ts                # POST: JIRA sync + change detection
│   ├── admin/
│   │   └── users.ts                # GET/PUT: admin user management
│   └── _lib/
│       ├── supabase-admin.ts       # Supabase service-role client
│       ├── auth.ts                 # JWT validation helper
│       └── change-detection.ts     # Compare + snapshot logic
├── src/                            # MOVED from oem-projects-portal/src/
│   ├── components/
│   │   ├── App.tsx                 # MODIFIED: useAuth/useData integration
│   │   ├── TopBar.tsx              # MODIFIED: Robalize branding
│   │   ├── LoginPage.tsx           # REWRITTEN: Supabase auth
│   │   ├── AdminPanel.tsx          # NEW: user management UI
│   │   ├── GanttChart.tsx          # UNCHANGED
│   │   ├── FilterBar.tsx           # UNCHANGED
│   │   ├── FileUploader.tsx        # UNCHANGED
│   │   ├── JiraConnector.tsx       # MODIFIED: uses server-side sync
│   │   └── AiPanel.tsx             # UNCHANGED
│   ├── lib/
│   │   └── supabase.ts             # NEW: client-side Supabase init
│   ├── hooks/
│   │   ├── useAuth.ts              # NEW: auth state management
│   │   └── useData.ts              # NEW: project + settings persistence
│   ├── utils/                      # MOVED, mostly unchanged
│   ├── types/
│   │   └── index.ts                # MODIFIED: add DB types
│   ├── styles/
│   │   └── theme.ts                # UNCHANGED
│   ├── App.css                     # UNCHANGED
│   └── main.tsx                    # UNCHANGED
├── supabase/
│   └── migrations/
│       └── 001_initial.sql         # NEW: full schema
├── public/                         # MOVED from oem-projects-portal/public/
├── index.html                      # MOVED from oem-projects-portal/
├── package.json                    # NEW: merged, add supabase deps
├── tsconfig.json                   # MOVED + adapted
├── vite.config.ts                  # MOVED + adapted
├── vercel.json                     # NEW
├── .env.example                    # NEW
├── .env.local                      # NEW (not committed)
└── .gitignore                      # MODIFIED
```

---

### Task 1: Restructure repo — move frontend to root

**Files:**
- Move: `oem-projects-portal/src/` → `src/`
- Move: `oem-projects-portal/public/` → `public/`
- Move: `oem-projects-portal/index.html` → `index.html`
- Move: `oem-projects-portal/vite.config.ts` → `vite.config.ts`
- Move: `oem-projects-portal/tsconfig.json` → `tsconfig.json`
- Move: `oem-projects-portal/tsconfig.app.json` → `tsconfig.app.json` (if exists)
- Move: `oem-projects-portal/tsconfig.node.json` → `tsconfig.node.json` (if exists)
- Create: `package.json` (new, at root)
- Create: `vercel.json`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Move all frontend files to repo root**

```bash
cd "/Users/cedricr/OEM PROJECTS"
# Remove root package.json and start.command (old shortcuts)
rm -f package.json start.command
# Move frontend to root
cp -r oem-projects-portal/src ./src
cp -r oem-projects-portal/public ./public
cp oem-projects-portal/index.html ./index.html
cp oem-projects-portal/vite.config.ts ./vite.config.ts
cp oem-projects-portal/tsconfig.json ./tsconfig.json
cp oem-projects-portal/tsconfig.app.json ./tsconfig.app.json 2>/dev/null
cp oem-projects-portal/tsconfig.node.json ./tsconfig.node.json 2>/dev/null
cp oem-projects-portal/eslint.config.js ./eslint.config.js 2>/dev/null
```

- [ ] **Step 2: Create new root package.json**

```json
{
  "name": "robalize",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint ."
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "papaparse": "^5.5.3",
    "pptxgenjs": "^4.0.1",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@types/papaparse": "^5.5.2",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "typescript": "~5.9.3",
    "vite": "^8.0.1"
  }
}
```

- [ ] **Step 3: Create vercel.json**

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 4: Create .env.example**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- [ ] **Step 5: Update .gitignore**

Add to `.gitignore`:
```
node_modules/
dist/
.env.local
.env
.superpowers/
oem-projects-portal/
```

- [ ] **Step 6: Install dependencies and verify build**

```bash
cd "/Users/cedricr/OEM PROJECTS"
npm install
npm run build
```

Expected: Build succeeds, `dist/` folder created.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move frontend to repo root, rename to Robalize"
```

---

### Task 2: Supabase migration — schema, RLS, triggers

**Files:**
- Create: `supabase/migrations/001_initial.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================
-- Robalize: Initial Schema
-- ============================================

-- Profiles (auto-created via trigger on auth.users)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Settings (user preferences as key-value)
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

-- Projects (one row per epic per user)
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  epic_key text NOT NULL,
  data jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('csv', 'jira')),
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, epic_key)
);

-- Snapshots (change history)
CREATE TABLE public.snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('csv', 'jira')),
  changed_fields text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_settings_user_key ON public.settings(user_id, key);
CREATE INDEX idx_projects_user ON public.projects(user_id);
CREATE INDEX idx_projects_user_epic ON public.projects(user_id, epic_key);
CREATE INDEX idx_snapshots_project ON public.snapshots(project_id);
CREATE INDEX idx_snapshots_user ON public.snapshots(user_id);

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;

-- Profiles: read own, admins read all
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Settings: full CRUD on own
CREATE POLICY "Users can manage own settings"
  ON public.settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Projects: CRUD own, admins read all
CREATE POLICY "Users can manage own projects"
  ON public.projects FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all projects"
  ON public.projects FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Snapshots: read own, admins read all, insert own
CREATE POLICY "Users can read own snapshots"
  ON public.snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all snapshots"
  ON public.snapshots FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can insert own snapshots"
  ON public.snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Trigger: auto-create profile on signup
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
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
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at auto-update
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/
git commit -m "feat: add Supabase migration — profiles, settings, projects, snapshots"
```

**Note:** Run this migration in Supabase dashboard (SQL Editor) or via `supabase db push` after setting up the Supabase project.

---

### Task 3: Supabase client + useAuth hook

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/hooks/useAuth.ts`

- [ ] **Step 1: Create Supabase client**

```typescript
// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 2: Create useAuth hook**

```typescript
// src/hooks/useAuth.ts
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "viewer";
  avatar_url: string | null;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user);
      else setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user) fetchProfile(session.user);
        else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(user: User) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!error && data) {
      setProfile(data as Profile);
    }
    setLoading(false);
  }

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signInWithMicrosoft = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email profile openid",
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  return {
    session,
    profile,
    loading,
    isAdmin: profile?.role === "admin",
    signInWithEmail,
    signUpWithEmail,
    signInWithMicrosoft,
    signOut,
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/ src/hooks/useAuth.ts
git commit -m "feat: add Supabase client and useAuth hook"
```

---

### Task 4: useData hook — project + settings persistence

**Files:**
- Create: `src/hooks/useData.ts`

- [ ] **Step 1: Create useData hook**

```typescript
// src/hooks/useData.ts
import { useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { RawRow } from "../types";

export function useData(userId: string | undefined) {
  // ── Projects ──

  const loadProjects = useCallback(async (): Promise<RawRow[]> => {
    if (!userId) return [];
    const { data, error } = await supabase
      .from("projects")
      .select("epic_key, data")
      .eq("user_id", userId)
      .order("imported_at", { ascending: true });

    if (error) {
      console.error("Failed to load projects:", error);
      return [];
    }
    return (data || []).map((row) => row.data as RawRow);
  }, [userId]);

  const saveProjects = useCallback(async (rows: RawRow[], source: "csv" | "jira"): Promise<{ imported: number; changed: number }> => {
    if (!userId) return { imported: 0, changed: 0 };

    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) throw new Error("Not authenticated");

    const res = await fetch("/api/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ rows, source }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Import failed" }));
      throw new Error(err.error || "Import failed");
    }

    return res.json();
  }, [userId]);

  // ── Settings ──

  const loadSetting = useCallback(async <T>(key: string, fallback: T): Promise<T> => {
    if (!userId) return fallback;
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", key)
      .single();

    if (error || !data) return fallback;
    return data.value as T;
  }, [userId]);

  const saveSetting = useCallback(async (key: string, value: unknown): Promise<void> => {
    if (!userId) return;
    await supabase
      .from("settings")
      .upsert(
        { user_id: userId, key, value },
        { onConflict: "user_id,key" }
      );
  }, [userId]);

  // ── JIRA Sync ──

  const jiraSync = useCallback(async (jql: string, maxRows: number): Promise<{ imported: number; changed: number }> => {
    if (!userId) return { imported: 0, changed: 0 };

    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) throw new Error("Not authenticated");

    const res = await fetch("/api/jira-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jql, maxRows }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Sync failed" }));
      throw new Error(err.error || "Sync failed");
    }

    return res.json();
  }, [userId]);

  return {
    loadProjects,
    saveProjects,
    loadSetting,
    saveSetting,
    jiraSync,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useData.ts
git commit -m "feat: add useData hook for project and settings persistence"
```

---

### Task 5: API route helpers — auth + change detection

**Files:**
- Create: `api/_lib/supabase-admin.ts`
- Create: `api/_lib/auth.ts`
- Create: `api/_lib/change-detection.ts`

- [ ] **Step 1: Create server-side Supabase client**

```typescript
// api/_lib/supabase-admin.ts
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key);
}
```

- [ ] **Step 2: Create auth validation helper**

```typescript
// api/_lib/auth.ts
import { createClient } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export async function validateAuth(authHeader: string | null): Promise<AuthUser> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.replace("Bearer ", "");
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) throw new Error("Missing Supabase config");

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Invalid token");

  // Get profile for role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email || "",
    role: profile?.role || "viewer",
  };
}
```

- [ ] **Step 3: Create change detection logic**

```typescript
// api/_lib/change-detection.ts
import type { SupabaseClient } from "@supabase/supabase-js";

interface ImportRow {
  [key: string]: string;
}

interface ImportResult {
  imported: number;
  changed: number;
  created: number;
}

export async function importWithChangeDetection(
  supabase: SupabaseClient,
  userId: string,
  rows: ImportRow[],
  source: "csv" | "jira"
): Promise<ImportResult> {
  // Fetch existing projects for this user
  const { data: existing } = await supabase
    .from("projects")
    .select("id, epic_key, data")
    .eq("user_id", userId);

  const existingMap = new Map(
    (existing || []).map((p) => [p.epic_key, p])
  );

  let changed = 0;
  let created = 0;

  for (const row of rows) {
    const epicKey = row["Issue key"] || "";
    if (!epicKey) continue;

    const prev = existingMap.get(epicKey);

    if (prev) {
      // Check if data changed
      const changedFields = detectChangedFields(prev.data as ImportRow, row);
      if (changedFields.length > 0) {
        // Insert snapshot
        await supabase.from("snapshots").insert({
          project_id: prev.id,
          user_id: userId,
          data: prev.data,
          source,
          changed_fields: changedFields,
        });
        changed++;
      }
    } else {
      created++;
    }

    // Upsert project
    await supabase
      .from("projects")
      .upsert(
        {
          user_id: userId,
          epic_key: epicKey,
          data: row,
          source,
          imported_at: new Date().toISOString(),
        },
        { onConflict: "user_id,epic_key" }
      );
  }

  return { imported: rows.length, changed, created };
}

function detectChangedFields(oldData: ImportRow, newData: ImportRow): string[] {
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  for (const key of allKeys) {
    const oldVal = (oldData[key] || "").trim();
    const newVal = (newData[key] || "").trim();
    if (oldVal !== newVal) {
      changed.push(key);
    }
  }

  return changed;
}
```

- [ ] **Step 4: Commit**

```bash
git add api/
git commit -m "feat: add API route helpers — auth, supabase-admin, change detection"
```

---

### Task 6: API routes — import, jira-sync, admin

**Files:**
- Create: `api/import.ts`
- Create: `api/jira-sync.ts`
- Create: `api/admin/users.ts`

- [ ] **Step 1: Create import API route**

```typescript
// api/import.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validateAuth } from "./_lib/auth.js";
import { createAdminClient } from "./_lib/supabase-admin.js";
import { importWithChangeDetection } from "./_lib/change-detection.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await validateAuth(req.headers.authorization as string);
    const { rows, source = "csv" } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows provided" });
    }

    const supabase = createAdminClient();
    const result = await importWithChangeDetection(supabase, user.id, rows, source);

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("Import error:", err);
    return res.status(err.message.includes("token") ? 401 : 500).json({
      error: err.message || "Import failed",
    });
  }
}
```

- [ ] **Step 2: Create jira-sync API route**

```typescript
// api/jira-sync.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validateAuth } from "./_lib/auth.js";
import { createAdminClient } from "./_lib/supabase-admin.js";
import { importWithChangeDetection } from "./_lib/change-detection.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await validateAuth(req.headers.authorization as string);
    const { jql, maxRows = 1000 } = req.body;

    if (!jql) {
      return res.status(400).json({ error: "JQL query required" });
    }

    const supabase = createAdminClient();

    // Load JIRA config from settings
    const { data: setting } = await supabase
      .from("settings")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", "jira_config")
      .single();

    if (!setting?.value) {
      return res.status(400).json({ error: "JIRA not configured. Save your JIRA config first." });
    }

    const config = setting.value as { email: string; apiToken: string };
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");

    // Fetch fields metadata
    const fieldsRes = await fetch(
      `https://imaweb.atlassian.net/rest/api/3/field`,
      { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } }
    );
    if (!fieldsRes.ok) throw new Error("Failed to fetch JIRA fields");
    const fields = await fieldsRes.json();
    const fieldMap = new Map<string, string>();
    for (const f of fields) {
      fieldMap.set(f.id, f.name);
    }

    // Fetch issues with pagination
    const allRows: Record<string, string>[] = [];
    let startAt = 0;
    const pageSize = 100;

    while (allRows.length < maxRows) {
      const searchRes = await fetch(
        `https://imaweb.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${Math.min(pageSize, maxRows - allRows.length)}&expand=names`,
        { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } }
      );
      if (!searchRes.ok) throw new Error("JIRA search failed");
      const searchData = await searchRes.json();

      for (const issue of searchData.issues || []) {
        const row: Record<string, string> = {
          "Summary": issue.fields?.summary || "",
          "Issue key": issue.key || "",
          "Issue id": String(issue.id || ""),
          "Issue Type": issue.fields?.issuetype?.name || "",
          "Status": issue.fields?.status?.name || "",
          "Priority": issue.fields?.priority?.name || "",
          "Assignee": issue.fields?.assignee?.displayName || "",
          "Reporter": issue.fields?.reporter?.displayName || "",
          "Created": issue.fields?.created || "",
          "Updated": issue.fields?.updated || "",
          "Project key": issue.fields?.project?.key || "",
          "Project name": issue.fields?.project?.name || "",
          "Parent key": issue.fields?.parent?.key || "",
          "Parent summary": issue.fields?.parent?.fields?.summary || "",
          "Status Category": issue.fields?.status?.statusCategory?.name || "",
        };

        // Map custom fields
        for (const [fieldId, value] of Object.entries(issue.fields || {})) {
          if (fieldId.startsWith("customfield_") && value != null) {
            const name = fieldMap.get(fieldId) || fieldId;
            const colName = `Custom field (${name})`;
            if (typeof value === "string") {
              row[colName] = value;
            } else if (typeof value === "number") {
              row[colName] = String(value);
            } else if (typeof value === "object" && value !== null) {
              if ("value" in value) row[colName] = String(value.value);
              else if ("name" in value) row[colName] = String(value.name);
              else if (Array.isArray(value)) row[colName] = value.map((v: any) => v?.name || v?.value || String(v)).join(", ");
            }
          }
        }

        allRows.push(row);
      }

      if (searchData.issues.length < pageSize || allRows.length >= searchData.total) break;
      startAt += pageSize;
    }

    const result = await importWithChangeDetection(supabase, user.id, allRows, "jira");

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("JIRA sync error:", err);
    return res.status(err.message.includes("token") ? 401 : 500).json({
      error: err.message || "Sync failed",
    });
  }
}
```

- [ ] **Step 3: Create admin users API route**

```typescript
// api/admin/users.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validateAuth } from "../_lib/auth.js";
import { createAdminClient } from "../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await validateAuth(req.headers.authorization as string);

    if (user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const supabase = createAdminClient();

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, display_name, role, avatar_url, created_at")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === "PUT") {
      const { userId, role } = req.body;
      if (!userId || !["admin", "viewer"].includes(role)) {
        return res.status(400).json({ error: "Invalid userId or role" });
      }

      const { error } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", userId);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    return res.status(err.message.includes("Admin") ? 403 : 500).json({
      error: err.message || "Server error",
    });
  }
}
```

- [ ] **Step 4: Install Vercel types**

```bash
npm install -D @vercel/node
```

- [ ] **Step 5: Commit**

```bash
git add api/ package.json package-lock.json
git commit -m "feat: add API routes — import, jira-sync, admin users"
```

---

### Task 7: Rewrite LoginPage for Supabase auth

**Files:**
- Modify: `src/components/LoginPage.tsx`

- [ ] **Step 1: Rewrite LoginPage**

```tsx
// src/components/LoginPage.tsx
import { useState } from "react";
import { theme } from "../styles/theme";

interface LoginPageProps {
  onSignInEmail: (email: string, password: string) => Promise<void>;
  onSignUpEmail: (email: string, password: string) => Promise<void>;
  onSignInMicrosoft: () => Promise<void>;
}

export function LoginPage({ onSignInEmail, onSignUpEmail, onSignInMicrosoft }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSignUp) {
        await onSignUpEmail(email, password);
      } else {
        await onSignInEmail(email, password);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: theme.gradient.subtle,
      fontFamily: theme.fontFamily,
    }}>
      <div style={{
        background: theme.surface,
        borderRadius: theme.radius.xl,
        padding: 48,
        width: 420,
        boxShadow: theme.shadow.lg,
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{
            fontSize: 32,
            fontWeight: 800,
            color: theme.primary,
            letterSpacing: -1,
            margin: 0,
          }}>
            Robalize
          </h1>
          <p style={{ color: theme.textMuted, fontSize: 14, marginTop: 8 }}>
            Project Portfolio Management
          </p>
        </div>

        {/* Microsoft OAuth */}
        <button
          onClick={() => { setError(""); onSignInMicrosoft(); }}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.borderLight}`,
            background: theme.surface,
            color: theme.textDark,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginBottom: 24,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
          Sign in with Microsoft
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ flex: 1, height: 1, background: theme.borderLight }} />
          <span style={{ color: theme.textMuted, fontSize: 12 }}>or</span>
          <div style={{ flex: 1, height: 1, background: theme.borderLight }} />
        </div>

        {/* Email/password form */}
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: theme.radius.md,
              border: `1px solid ${theme.borderLight}`,
              fontSize: 14,
              marginBottom: 12,
              outline: "none",
              boxSizing: "border-box",
              fontFamily: theme.fontFamily,
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: theme.radius.md,
              border: `1px solid ${theme.borderLight}`,
              fontSize: 14,
              marginBottom: 16,
              outline: "none",
              boxSizing: "border-box",
              fontFamily: theme.fontFamily,
            }}
          />

          {error && (
            <p style={{ color: "#e03131", fontSize: 13, marginBottom: 12 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: theme.radius.md,
              border: "none",
              background: theme.gradient.primary,
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.7 : 1,
              fontFamily: theme.fontFamily,
            }}
          >
            {loading ? "..." : isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: theme.textMuted }}>
          {isSignUp ? "Already have an account? " : "No account? "}
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(""); }}
            style={{
              background: "none",
              border: "none",
              color: theme.primary,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
              fontFamily: theme.fontFamily,
            }}
          >
            {isSignUp ? "Sign in" : "Create one"}
          </button>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LoginPage.tsx
git commit -m "feat: rewrite LoginPage with Supabase auth (Microsoft + email/password)"
```

---

### Task 8: Wire auth + data into App.tsx

**Files:**
- Modify: `src/components/App.tsx`
- Modify: `src/components/TopBar.tsx`

- [ ] **Step 1: Update App.tsx**

Replace the current auth/data loading logic in App.tsx. The key changes:
- Import and use `useAuth` and `useData` hooks
- Replace localStorage calls with Supabase calls
- Show `LoginPage` when not authenticated
- Load data from Supabase on login
- Save data to Supabase on import
- Rebrand to "Robalize"

The App.tsx is 17KB so we modify specific sections:

**At the top**, replace localStorage imports with hooks:
```typescript
import { useAuth } from "../hooks/useAuth";
import { useData } from "../hooks/useData";
```

Remove the `SESSION_KEY`, `saveSession`, `loadSession` functions.

**In the component body**, add:
```typescript
const { session, profile, loading: authLoading, isAdmin, signInWithEmail, signUpWithEmail, signInWithMicrosoft, signOut } = useAuth();
const { loadProjects, saveProjects, loadSetting, saveSetting } = useData(profile?.id);
```

**Replace** the localStorage-based data loading `useEffect` with:
```typescript
useEffect(() => {
  if (!profile) return;
  loadProjects().then((rows) => {
    if (rows.length > 0) {
      setRawData(rows);
      setColumns(extractColumns(rows));
    }
  });
}, [profile, loadProjects]);
```

**Replace** `loadData` to save to Supabase:
```typescript
const loadData = useCallback(async (rows: RawRow[], silent = false) => {
  setRawData(rows);
  setColumns(extractColumns(rows));
  if (!silent) {
    setActiveFilters([]);
    setSearchTerm("");
  }
  // Persist to Supabase
  try {
    await saveProjects(rows, "csv");
  } catch (err) {
    console.error("Failed to save projects:", err);
  }
}, [saveProjects]);
```

**Show login page** when not authenticated:
```typescript
if (authLoading) return <div style={{ ... }}>Loading...</div>;
if (!session) return (
  <LoginPage
    onSignInEmail={signInWithEmail}
    onSignUpEmail={signUpWithEmail}
    onSignInMicrosoft={signInWithMicrosoft}
  />
);
```

**Pass** profile info to TopBar:
```typescript
<TopBar
  ...
  userName={profile?.display_name || profile?.email}
  onLogout={signOut}
  ...
/>
```

- [ ] **Step 2: Update TopBar branding**

In TopBar.tsx, replace "nextlane" with "Robalize":
```typescript
<span style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.8, textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
  Robalize
</span>
```

Remove the "| OEM Projects" divider and text.

- [ ] **Step 3: Update index.html title**

```html
<title>Robalize — Project Portfolio Management</title>
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: integrate Supabase auth + data persistence into App"
```

---

### Task 9: AdminPanel component

**Files:**
- Create: `src/components/AdminPanel.tsx`

- [ ] **Step 1: Create AdminPanel**

```tsx
// src/components/AdminPanel.tsx
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { theme } from "../styles/theme";
import type { Profile } from "../hooks/useAuth";

interface AdminPanelProps {
  open: boolean;
  onClose: () => void;
}

export function AdminPanel({ open, onClose }: AdminPanelProps) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;

    const res = await fetch("/api/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setUsers(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) fetchUsers();
  }, [open, fetchUsers]);

  async function updateRole(userId: string, role: string) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;

    await fetch("/api/admin/users", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId, role }),
    });
    fetchUsers();
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        fontFamily: theme.fontFamily,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: theme.surface,
          borderRadius: theme.radius.lg,
          padding: 32,
          width: 600,
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: theme.shadow.lg,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ color: theme.textDark, margin: "0 0 24px 0", fontSize: 20 }}>
          User Management
        </h2>

        {loading ? (
          <p style={{ color: theme.textMuted }}>Loading...</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: `2px solid ${theme.borderLight}`, fontSize: 12, color: theme.textMuted }}>User</th>
                <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: `2px solid ${theme.borderLight}`, fontSize: 12, color: theme.textMuted }}>Role</th>
                <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: `2px solid ${theme.borderLight}`, fontSize: 12, color: theme.textMuted }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.borderRow}` }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: theme.textDark }}>{u.display_name || u.email}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>{u.email}</div>
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.borderRow}` }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "3px 10px",
                      borderRadius: theme.radius.pill,
                      background: u.role === "admin" ? `${theme.primary}22` : theme.rowAlt,
                      color: u.role === "admin" ? theme.primary : theme.textSecondary,
                    }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.borderRow}`, textAlign: "right" }}>
                    <button
                      onClick={() => updateRole(u.id, u.role === "admin" ? "viewer" : "admin")}
                      style={{
                        padding: "5px 12px",
                        borderRadius: theme.radius.sm,
                        border: `1px solid ${theme.borderLight}`,
                        background: theme.surface,
                        color: theme.textSecondary,
                        fontSize: 11,
                        cursor: "pointer",
                        fontFamily: theme.fontFamily,
                      }}
                    >
                      {u.role === "admin" ? "Demote to viewer" : "Promote to admin"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire AdminPanel into App.tsx**

Add an "Admin" button in the TopBar (visible only for admins), and render `<AdminPanel>` in App.

- [ ] **Step 3: Commit**

```bash
git add src/components/AdminPanel.tsx
git commit -m "feat: add AdminPanel for user management (admin only)"
```

---

### Task 10: Deployment — Vercel + Supabase setup

**Files:**
- No code changes — configuration steps

- [ ] **Step 1: Create Supabase project**

Go to https://supabase.com/dashboard, create a new project named "robalize". Note the project URL and keys.

- [ ] **Step 2: Run migration**

In Supabase dashboard → SQL Editor, paste the content of `supabase/migrations/001_initial.sql` and run it.

- [ ] **Step 3: Configure Microsoft OAuth in Supabase**

In Supabase dashboard → Authentication → Providers → Azure:
- Enable Azure provider
- Set up an Azure AD app registration in Azure Portal
- Configure redirect URL: `https://<your-supabase-url>/auth/v1/callback`
- Add client ID and secret to Supabase

- [ ] **Step 4: Create .env.local**

```bash
cp .env.example .env.local
```

Fill in the actual values from the Supabase dashboard.

- [ ] **Step 5: Push to GitHub**

```bash
git remote add origin <your-github-repo-url>
git push -u origin main
```

- [ ] **Step 6: Deploy to Vercel**

- Import the GitHub repo in Vercel dashboard
- Set environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Deploy

- [ ] **Step 7: Test the full flow**

1. Open the deployed URL
2. Sign up with email/password → should be admin (first user)
3. Upload a CSV → data persists on refresh
4. Configure JIRA → sync works via server-side API
5. Sign out, sign back in → data is still there
6. Open Admin panel → manage users

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "chore: deployment configuration complete"
```
