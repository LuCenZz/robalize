import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { TopBar } from "./TopBar";
import { FileUploader } from "./FileUploader";
import { JiraConnector } from "./JiraConnector";
import { LoginPage } from "./LoginPage";
import { AiPanel } from "./AiPanel";
import { ShimmerTitle } from "./ShimmerTitle";
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
  const { loadProjects, saveProjects } = useData(profile?.id);

  const [rawData, setRawData] = useState<RawRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [jiraOpen, setJiraOpen] = useState(false);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const handleLogout = useCallback(async () => {
    await signOut();
    setRawData([]);
    setColumns([]);
    setActiveFilters([]);
    setJiraConnected(false);
    setSearchTerm("");
  }, [signOut]);

  const loadData = useCallback(async (rows: RawRow[], silent = false) => {
    setRawData(rows);
    setColumns(extractColumns(rows));
    if (!silent) {
      setActiveFilters([]);
      setSearchTerm("");
    }
    try {
      await saveProjects(rows, "csv");
    } catch (err) {
      console.error("Failed to persist:", err);
    }
  }, [saveProjects]);

  // Load projects from Supabase on mount when profile is available
  useEffect(() => {
    if (!profile) return;
    loadProjects().then((rows) => {
      if (rows.length > 0) {
        setRawData(rows);
        setColumns(extractColumns(rows));
      }
    });
  }, [profile, loadProjects]);

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

  // Filtered epic IDs (based on active filters)
  const filteredRows = useMemo(
    () => applyFilters(rawData, activeFilters),
    [rawData, activeFilters]
  );

  const filteredEpicTasks: EpicTask[] = useMemo(
    () => transformToEpicTasks(filteredRows),
    [filteredRows]
  );

  const filteredEpicKeys = useMemo(
    () => new Set(filteredEpicTasks.map((e) => e.epicKey)),
    [filteredEpicTasks]
  );

  const hasActiveFilters = activeFilters.some((f) => f.values.length > 0);

  const displayRows = useMemo(() => {
    let rows = allDisplayRows;

    // When filters are active, keep only epics that match + initiatives that have matching children
    if (hasActiveFilters) {
      rows = rows.filter((r) => {
        if (r.type === "initiative") {
          return r.children?.some((c) => filteredEpicKeys.has(c.epicKey));
        }
        return filteredEpicKeys.has(r.epic.epicKey);
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
  }, [allDisplayRows, searchTerm, hasActiveFilters, filteredEpicKeys]);

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
        onSignInMicrosoft={signInWithMicrosoft}
      />
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
      <TopBar
        projectCount={filteredEpicTasks.length}
        onUploadClick={() => setUploaderOpen(true)}
        onJiraClick={() => setJiraOpen(true)}
        jiraConnected={jiraConnected}
        userName={profile?.display_name || profile?.email || ""}
        onLogout={handleLogout}
        onGeneratePptx={() => generatePptx(filteredEpicTasks)}
        onAiClick={() => setAiOpen(true)}
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
          if (filters.every((f) => f.values.length === 0)) {
            setResetKey((k) => k + 1);
          }
        }}
      />

      {loading && (
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

      {!loading && rawData.length === 0 && (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 32,
            perspective: 1200,
          }}
        >
          <ShimmerTitle />

          <div style={{ display: "flex", gap: 28 }}>
            {[
              { icon: "🔗", title: "Connect to Jira", desc: "Import directly via JQL query", action: () => { setUploaderOpen(false); setJiraOpen(true); }, delay: 0.15 },
              { icon: "📄", title: "Load CSV / Excel", desc: "Upload a file exported from Jira", action: () => { setJiraOpen(false); setUploaderOpen(true); }, delay: 0.3 },
            ].map((card) => (
              <div
                key={card.title}
                onClick={card.action}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left - rect.width / 2;
                  const y = e.clientY - rect.top - rect.height / 2;
                  const rotateX = -(y / rect.height) * 20;
                  const rotateY = (x / rect.width) * 20;
                  e.currentTarget.style.transform = `translateY(-12px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
                  e.currentTarget.style.boxShadow = `0 25px 50px rgba(107, 44, 245, 0.25), 0 0 0 2px ${theme.primary}`;
                  // Shine effect
                  const shine = e.currentTarget.querySelector("[data-shine]") as HTMLElement;
                  if (shine) {
                    shine.style.background = `radial-gradient(circle at ${e.clientX - rect.left}px ${e.clientY - rect.top}px, rgba(107,44,245,0.15) 0%, transparent 60%)`;
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0) rotateX(0) rotateY(0) scale(1)";
                  e.currentTarget.style.boxShadow = theme.shadow.md;
                  const shine = e.currentTarget.querySelector("[data-shine]") as HTMLElement;
                  if (shine) shine.style.background = "transparent";
                }}
                style={{
                  width: 220,
                  padding: "36px 24px",
                  borderRadius: 20,
                  border: `1.5px solid ${theme.borderLight}`,
                  background: "linear-gradient(145deg, #ffffff, #f8f6ff)",
                  cursor: "pointer",
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                  animation: `fadeInUp 0.6s ease-out ${card.delay}s both`,
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  transformStyle: "preserve-3d",
                  boxShadow: theme.shadow.md,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Shine overlay */}
                <div data-shine="" style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  borderRadius: 20,
                  transition: "background 0.15s ease",
                }} />
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: `linear-gradient(135deg, rgba(107,44,245,0.08), rgba(107,44,245,0.18))`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                  transition: "transform 0.3s ease",
                }}>
                  {card.icon}
                </div>
                <span style={{ fontWeight: 700, fontSize: 15, color: theme.textDark }}>{card.title}</span>
                <span style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>
                  {card.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && rawData.length > 0 && (
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
        onDataLoaded={loadData}
        connected={jiraConnected}
        onConnectionChange={setJiraConnected}
      />

      <AiPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        displayRows={displayRows}
      />

      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
    </div>
  );
}
