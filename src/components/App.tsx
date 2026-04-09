import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { TopBar } from "./TopBar";
import { FileUploader } from "./FileUploader";
import { JiraConnector } from "./JiraConnector";
import { LoginPage } from "./LoginPage";
import { AiPanel } from "./AiPanel";
import { FilterBar } from "./FilterBar";
import { AdminPanel } from "./AdminPanel";
import { parseFile } from "../utils/parseFile";
import { useAuth } from "../hooks/useAuth";
import { useData } from "../hooks/useData";

const GanttChart = lazy(() =>
  import("./GanttChart").then((m) => ({ default: m.GanttChart }))
);
import {
  transformToEpicTasks,
  buildDisplayRows,
  extractColumns,
  extractUniqueValues,
} from "../utils/transformData";
import { applyFilters } from "../utils/filterEngine";
import { generatePptx } from "../utils/generatePptx";
import { loadJiraConfig, saveJiraConfig, fetchJiraData } from "../utils/jiraFetch";
import type { RawRow, ActiveFilter, EpicTask } from "../types";
import { theme } from "../styles/theme";

export function App() {
  const {
    session,
    profile,
    loading: authLoading,
    isAdmin,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  } = useAuth();
  const { loadProjects, saveProjects, loadSetting, saveSetting, loadAdminJiraConfig } = useData(profile?.id);

  const [rawData, setRawData] = useState<RawRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [jiraOpen, setJiraOpen] = useState(false);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPaywall, setAiPaywall] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const handleLogout = useCallback(async () => {
    await signOut();
    setRawData([]);
    setColumns([]);
    setActiveFilters([]);
    setJiraConnected(false);
    setSearchTerm("");
    localStorage.removeItem("oem-session-data");
    localStorage.removeItem("oem-jira-config");
  }, [signOut]);

  const loadData = useCallback(async (rows: RawRow[], silent = false, source: "csv" | "jira" = "csv") => {
    setRawData(rows);
    setColumns(extractColumns(rows));
    if (!silent) {
      setActiveFilters([]);
      setSearchTerm("");
    }
    // Save to localStorage as immediate cache
    try {
      localStorage.setItem("oem-session-data", JSON.stringify(rows));
    } catch { /* quota */ }
    // Save to Supabase in background
    saveProjects(rows, source).catch((err) => {
      console.error("Failed to persist to Supabase:", err);
    });
  }, [saveProjects]);

  // Load projects on mount: localStorage (instant) → Supabase (background) → JIRA (fallback)
  const profileId = profile?.id;
  useEffect(() => {
    if (!profileId) return;

    async function init() {
      setInitializing(true);

      // 1. Try localStorage FIRST (instant display)
      let hasData = false;
      try {
        const cached = localStorage.getItem("oem-session-data");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRawData(parsed);
            setColumns(extractColumns(parsed));
            setJiraConnected(true);
            hasData = true;
          }
        }
      } catch { /* ignore */ }

      if (hasData) {
        setInitializing(false);
        // Refresh from Supabase in background (non-blocking)
        loadProjects().then((rows) => {
          if (rows.length > 0) {
            setRawData(rows);
            setColumns(extractColumns(rows));
          }
        }).catch(() => {});
        return;
      }

      // 2. No cache — try Supabase directly
      try {
        const rows = await loadProjects();
        if (rows.length > 0) {
          setRawData(rows);
          setColumns(extractColumns(rows));
          setJiraConnected(true);
          setInitializing(false);
          return;
        }
      } catch { /* timeout or error — continue */ }

      // 3. No data anywhere — auto-fetch JIRA silently
      setInitializing(false);
      try {
        let config = loadJiraConfig();
        if (!config || !config.email || !config.apiToken) {
          const adminConfig = await loadAdminJiraConfig();
          if (adminConfig) {
            config = adminConfig as any;
            saveJiraConfig(adminConfig as any);
          }
        }
        if (config && config.email && config.apiToken && config.jql) {
          const jiraRows = await fetchJiraData(config);
          if (jiraRows.length > 0) {
            await loadData(jiraRows, true, "jira");
            setJiraConnected(true);
          }
        }
      } catch (err) {
        console.error("Auto JIRA fetch failed:", err);
      }
    }

    init();
  }, [profileId, loadProjects]);

  // Load saved filters from Supabase
  useEffect(() => {
    if (!profileId) return;
    loadSetting("filters").then((saved) => {
      if (saved && Array.isArray(saved) && saved.length > 0) {
        setActiveFilters(saved as ActiveFilter[]);
      }
    });
  }, [profileId, loadSetting]);

  const handleFileSelected = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const rows = await parseFile(file);
      loadData(rows);
      setUploaderOpen(false);
    } catch (err) {
      console.error("Error parsing file:", err);
      alert("Error loading file. Please check the format.");
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  // Build all epics from ALL data (unfiltered) so initiatives are always available
  const allEpicTasks: EpicTask[] = useMemo(
    () => transformToEpicTasks(rawData),
    [rawData]
  );

  const allDisplayRows = useMemo(
    () => buildDisplayRows(allEpicTasks),
    [allEpicTasks]
  );

  // Filtered rows (based on active filters)
  const filteredRows = useMemo(
    () => applyFilters(rawData, activeFilters),
    [rawData, activeFilters]
  );

  const filteredEpicTasks: EpicTask[] = useMemo(
    () => transformToEpicTasks(filteredRows),
    [filteredRows]
  );

  // Keys that match filters: both epic keys AND parent keys of matching initiatives
  const filteredKeys = useMemo(() => {
    const keys = new Set(filteredEpicTasks.map((e) => e.epicKey));
    // Also include keys from filtered raw rows (for initiative-level filtering)
    for (const row of filteredRows) {
      const key = row["Issue key"];
      if (key) keys.add(key);
    }
    return keys;
  }, [filteredEpicTasks, filteredRows]);

  const hasActiveFilters = activeFilters.some((f) => f.values.length > 0);

  const displayRows = useMemo(() => {
    let rows = allDisplayRows;

    // When filters are active, keep matching items
    if (hasActiveFilters) {
      rows = rows.filter((r) => {
        if (r.type === "initiative") {
          // Keep initiative if it directly matches OR if any child matches
          const initiativeMatches = r.initiativeKey ? filteredKeys.has(r.initiativeKey) : false;
          const childMatches = r.children?.some((c) => filteredKeys.has(c.epicKey));
          return initiativeMatches || childMatches;
        }
        return filteredKeys.has(r.epic.epicKey);
      });
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      rows = rows.filter((row) => {
        if (row.type === "initiative") {
          // Keep initiative if its name or any child matches
          const nameMatch = (row.initiativeName || "").toLowerCase().includes(q);
          const childMatch = row.children?.some((c) =>
            (c.epicKey || "").toLowerCase().includes(q) || (c.epicName || "").toLowerCase().includes(q)
          );
          return nameMatch || childMatch;
        }
        const epic = row.epic;
        const key = (epic.epicKey || "").toLowerCase();
        const name = (epic.epicName || "").toLowerCase();
        return key.includes(q) || name.includes(q);
      });
    }

    return rows;
  }, [allDisplayRows, searchTerm, hasActiveFilters, filteredKeys]);

  const getUniqueValues = useCallback(
    (column: string) => extractUniqueValues(rawData, column),
    [rawData]
  );

  // Auth gate: show loading spinner while checking session
  if (authLoading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: theme.fontFamily, color: theme.textMuted }}>
        Loading...
      </div>
    );
  }

  // Auth gate: show login page if not authenticated
  if (!session) {
    return (
      <LoginPage
        onSignInEmail={signInWithEmail}
        onSignUpEmail={signUpWithEmail}
      />
    );
  }

  // Auth gate: block pending users
  if (profile?.role === "pending") {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: theme.fontFamily,
        flexDirection: "column",
        gap: 16,
        background: theme.gradient.subtle,
      }}>
        <div style={{
          background: theme.surface,
          borderRadius: theme.radius.xl,
          padding: 48,
          textAlign: "center",
          boxShadow: theme.shadow.lg,
          maxWidth: 420,
        }}>
          <p style={{ fontSize: 48, margin: "0 0 16px" }}>&#9203;</p>
          <h2 style={{ color: theme.textDark, margin: "0 0 12px", fontSize: 20 }}>Account pending approval</h2>
          <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Your account has been created but is awaiting administrator approval. You will receive access shortly.
          </p>
          <button
            onClick={() => signOut()}
            style={{
              marginTop: 24,
              padding: "10px 24px",
              borderRadius: theme.radius.md,
              border: "none",
              background: theme.gradient.primary,
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: theme.fontFamily,
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: theme.fontFamily,
        background: theme.background,
      }}
    >
      {!initializing && <>
      <TopBar
        projectCount={filteredEpicTasks.length}
        onUploadClick={() => setUploaderOpen(true)}
        onJiraClick={async () => {
          if (isAdmin) {
            setJiraOpen(true);
          } else {
            let config = loadJiraConfig();
            if (!config || !config.email || !config.apiToken) {
              const adminConfig = await loadAdminJiraConfig();
              if (adminConfig) {
                config = adminConfig as any;
                saveJiraConfig(adminConfig as any);
              }
            }
            if (config && config.email && config.apiToken && config.jql) {
              setLoading(true);
              fetchJiraData(config)
                .then((rows) => {
                  if (rows.length > 0) {
                    loadData(rows, true, "jira");
                    setJiraConnected(true);
                  }
                })
                .catch((err) => {
                  console.error("JIRA fetch failed:", err);
                  alert("JIRA connection failed. Ask the administrator to check the configuration.");
                })
                .finally(() => setLoading(false));
            } else {
              setJiraOpen(true);
            }
          }
        }}
        jiraConnected={jiraConnected}
        userName={profile?.display_name || profile?.email || ""}
        onLogout={handleLogout}
        onGeneratePptx={() => generatePptx(filteredEpicTasks)}
        onAiClick={() => {
          if (isAdmin) {
            setAiOpen(true);
          } else {
            setAiPaywall(true);
          }
        }}
        searchTerm={searchTerm}
        onSearchChange={(term) => { setSearchTerm(term); }}
        isAdmin={isAdmin}
        onAdminClick={() => setAdminOpen(true)}
      />

      <FilterBar
        columns={columns}
        activeFilters={activeFilters}
        getUniqueValues={getUniqueValues}
        onFiltersChange={(filters) => {
          setActiveFilters(filters);
          saveSetting("filters", filters);
          if (filters.every((f) => f.values.length === 0)) {
            setResetKey((k) => k + 1);
          }
        }}
      />
      </>}

      {(loading || initializing) && (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 28,
          }}
        >
          <style>{`
            @keyframes car-bounce {
              0%, 100% { transform: translateY(0); }
              50%      { transform: translateY(-3px); }
            }
            @keyframes wheel-spin {
              0%   { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes road-move {
              0%   { background-position: 0 0; }
              100% { background-position: -200px 0; }
            }
            @keyframes smoke-puff {
              0%   { opacity: 0.5; transform: translate(0, 0) scale(0.4); }
              100% { opacity: 0; transform: translate(-28px, -10px) scale(1.3); }
            }
            @keyframes loading-dots {
              0%   { content: ''; }
              25%  { content: '.'; }
              50%  { content: '..'; }
              75%  { content: '...'; }
            }
            .loading-dots::after {
              content: '';
              animation: loading-dots 1.4s steps(1, end) infinite;
            }
          `}</style>
          {/* Car animation */}
          <div style={{ position: "relative", width: 200, height: 90 }}>
            {/* Car body - bounces */}
            <div style={{ position: "absolute", bottom: 20, left: "50%", marginLeft: -44, animation: "car-bounce 0.35s ease-in-out infinite" }}>
              <svg width="88" height="52" viewBox="0 0 88 52" fill="none">
                {/* Shadow under car */}
                <ellipse cx="44" cy="50" rx="38" ry="3" fill="rgba(0,0,0,0.08)" />
                {/* Car lower body */}
                <rect x="4" y="28" width="76" height="14" rx="4" fill={theme.primary} />
                {/* Car upper body / cabin */}
                <path d="M18 28 L26 12 Q27 10 30 10 L52 10 Q55 10 56 12 L66 28 Z" fill={theme.primary} />
                {/* Cabin highlight */}
                <path d="M20 28 L27 14 Q28 12 30 12 L51 12 Q53 12 54 14 L64 28 Z" fill="white" opacity="0.15" />
                {/* Windshield */}
                <path d="M50 14 L54 26 L64 26 L57 14 Z" fill="white" opacity="0.8" />
                {/* Side window */}
                <path d="M28 14 L24 26 L50 26 L47 14 Z" fill="white" opacity="0.75" />
                {/* Window divider */}
                <line x1="49" y1="14" x2="50.5" y2="26" stroke={theme.primary} strokeWidth="1.5" />
                {/* Hood line */}
                <line x1="66" y1="28" x2="78" y2="28" stroke="white" strokeWidth="0.5" opacity="0.3" />
                {/* Body accent line */}
                <line x1="6" y1="35" x2="78" y2="35" stroke="white" strokeWidth="0.6" opacity="0.2" />
                {/* Headlight */}
                <rect x="76" y="30" width="4" height="5" rx="1.5" fill="#FFD93D" />
                <rect x="76" y="30" width="6" height="5" rx="2" fill="#FFD93D" opacity="0.25" />
                {/* Tail light */}
                <rect x="4" y="30" width="3" height="5" rx="1.5" fill="#FF4757" />
                {/* Bumpers */}
                <rect x="2" y="37" width="6" height="3" rx="1" fill={theme.primary} opacity="0.7" />
                <rect x="76" y="37" width="6" height="3" rx="1" fill={theme.primary} opacity="0.7" />
              </svg>
              {/* Front wheel */}
              <svg style={{ position: "absolute", bottom: 2, right: 10 }} width="18" height="18" viewBox="0 0 18 18">
                <circle cx="9" cy="9" r="8" fill="#333" />
                <circle cx="9" cy="9" r="6" fill="#555" />
                <g style={{ transformOrigin: "9px 9px", animation: "wheel-spin 0.3s linear infinite" }}>
                  <line x1="9" y1="3" x2="9" y2="15" stroke="#777" strokeWidth="1" />
                  <line x1="3" y1="9" x2="15" y2="9" stroke="#777" strokeWidth="1" />
                </g>
                <circle cx="9" cy="9" r="2.5" fill="#999" />
              </svg>
              {/* Rear wheel */}
              <svg style={{ position: "absolute", bottom: 2, left: 10 }} width="18" height="18" viewBox="0 0 18 18">
                <circle cx="9" cy="9" r="8" fill="#333" />
                <circle cx="9" cy="9" r="6" fill="#555" />
                <g style={{ transformOrigin: "9px 9px", animation: "wheel-spin 0.3s linear infinite" }}>
                  <line x1="9" y1="3" x2="9" y2="15" stroke="#777" strokeWidth="1" />
                  <line x1="3" y1="9" x2="15" y2="9" stroke="#777" strokeWidth="1" />
                </g>
                <circle cx="9" cy="9" r="2.5" fill="#999" />
              </svg>
              {/* Exhaust smoke puffs */}
              <div style={{ position: "absolute", bottom: 8, left: -2 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ccc", animation: "smoke-puff 0.7s ease-out infinite" }} />
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ddd", animation: "smoke-puff 0.7s ease-out 0.25s infinite", position: "absolute", top: -3, left: -3 }} />
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#e5e5e5", animation: "smoke-puff 0.7s ease-out 0.5s infinite", position: "absolute", top: 2, left: -6 }} />
              </div>
            </div>
            {/* Road dashes */}
            <div style={{
              position: "absolute",
              bottom: 8,
              left: 0,
              right: 0,
              height: 3,
              borderRadius: 2,
              background: `repeating-linear-gradient(90deg, ${theme.primary}33 0px, ${theme.primary}33 14px, transparent 14px, transparent 28px)`,
              animation: "road-move 0.6s linear infinite",
            }} />
          </div>
          <span
            className="loading-dots"
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: theme.textMuted,
            }}
          >
            Loading
          </span>
        </div>
      )}

      {!loading && !initializing && rawData.length > 0 && (
        <Suspense fallback={<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: theme.textMuted }}>Loading Gantt...</div>}>
          <GanttChart tasks={filteredEpicTasks} allTasks={allEpicTasks} displayRows={displayRows} resetKey={resetKey} />
        </Suspense>
      )}

      <FileUploader
        open={uploaderOpen}
        onClose={() => setUploaderOpen(false)}
        onFileSelected={handleFileSelected}
      />

      <JiraConnector
        open={jiraOpen}
        onClose={() => setJiraOpen(false)}
        onDataLoaded={(rows, silent) => loadData(rows, silent, "jira")}
        connected={jiraConnected}
        onConnectionChange={setJiraConnected}
        isAdmin={isAdmin}
        saveSetting={saveSetting}
        loadAdminJiraConfig={loadAdminJiraConfig}
      />

      <AiPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        displayRows={displayRows}
      />

      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />

      {/* AI Paywall */}
      {aiPaywall && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            fontFamily: theme.fontFamily,
          }}
          onClick={() => setAiPaywall(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: theme.surface,
              borderRadius: theme.radius.xl,
              padding: "48px 40px",
              width: 400,
              textAlign: "center",
              boxShadow: theme.shadow.lg,
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
            <h2 style={{ color: theme.textDark, margin: "0 0 8px 0", fontSize: 20 }}>
              AI Assistant
            </h2>
            <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.6, margin: "0 0 24px 0" }}>
              Not available yet...<br />
              Please give <strong style={{ color: theme.primary }}>Cedric</strong> some money <span style={{ fontSize: 18 }}>💸</span>
            </p>
            <button
              onClick={() => setAiPaywall(false)}
              style={{
                background: theme.gradient.primary,
                color: "white",
                border: "none",
                padding: "10px 32px",
                borderRadius: theme.radius.pill,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
                fontFamily: theme.fontFamily,
              }}
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
