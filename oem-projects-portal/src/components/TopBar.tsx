import { theme } from "../styles/theme";

interface TopBarProps {
  projectCount: number;
  onUploadClick: () => void;
  onJiraClick: () => void;
  jiraConnected: boolean;
  userName?: string;
  onLogout: () => void;
  onGeneratePptx?: () => void;
  onAiClick?: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

const pill = (bg: string, color: string, border?: string): React.CSSProperties => ({
  background: bg,
  color,
  border: border || "none",
  padding: "8px 18px",
  borderRadius: theme.radius.pill,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 12,
  letterSpacing: 0.2,
  display: "flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
  backdropFilter: "blur(8px)",
});

export function TopBar({ projectCount, onUploadClick, onJiraClick, jiraConnected, userName, onLogout, onGeneratePptx, onAiClick, searchTerm, onSearchChange }: TopBarProps) {
  return (
    <div
      style={{
        background: theme.gradient.primary,
        color: "white",
        padding: "12px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: theme.fontFamily,
        boxShadow: "0 4px 20px rgba(107, 44, 245, 0.25)",
        position: "relative",
        zIndex: 50,
      }}
    >
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.8, textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
          nextlane
        </span>
        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.2)", borderRadius: 1 }} />
        <span style={{ opacity: 0.85, fontSize: 13, fontWeight: 500, letterSpacing: 0.3 }}>
          OEM Projects
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {/* Search */}
        {projectCount > 0 && (
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{
                padding: "8px 14px 8px 36px",
                borderRadius: theme.radius.pill,
                border: "1px solid rgba(255,255,255,0.2)",
                fontSize: 12,
                width: 240,
                outline: "none",
                background: "rgba(255,255,255,0.15)",
                color: "white",
                caretColor: "white",
                backdropFilter: "blur(8px)",
                fontFamily: theme.fontFamily,
                letterSpacing: 0.2,
              }}
            />
            <svg
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                opacity: 0.5,
              }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            {searchTerm && (
              <button
                onClick={() => onSearchChange("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.2)",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 11,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Project count */}
        {projectCount > 0 && (
          <div style={{
            background: "rgba(255,255,255,0.1)",
            borderRadius: theme.radius.pill,
            padding: "6px 14px",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: 0.3,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399", display: "inline-block" }} />
            {projectCount} projects
          </div>
        )}

        {/* Generate PPTX */}
        {onGeneratePptx && projectCount > 0 && (
          <button onClick={onGeneratePptx} style={pill("white", theme.primary)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="m12 18 4-4h-3V9h-2v5H8z" />
            </svg>
            Export PPTX
          </button>
        )}

        {/* AI */}
        {onAiClick && projectCount > 0 && (
          <button onClick={onAiClick} style={pill("rgba(255,255,255,0.12)", "white", "1px solid rgba(255,255,255,0.25)")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" />
              <circle cx="9" cy="14" r="1" fill="currentColor" /><circle cx="15" cy="14" r="1" fill="currentColor" />
            </svg>
            AI
          </button>
        )}

        {/* Jira */}
        <button
          onClick={onJiraClick}
          style={pill(
            jiraConnected ? "rgba(52, 211, 153, 0.2)" : "rgba(255,255,255,0.12)",
            "white",
            jiraConnected ? "1px solid rgba(52, 211, 153, 0.5)" : "1px solid rgba(255,255,255,0.25)"
          )}
        >
          {jiraConnected && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#34D399", display: "inline-block", boxShadow: "0 0 6px rgba(52,211,153,0.5)" }} />}
          {jiraConnected ? "Jira Connected" : "Connect Jira"}
        </button>

        {/* Upload */}
        <button onClick={onUploadClick} style={pill("rgba(255,255,255,0.08)", "rgba(255,255,255,0.8)", "1px solid rgba(255,255,255,0.15)")}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Import
        </button>

        {/* User */}
        {userName && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.08))",
              border: "1px solid rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0,
            }}>
              {userName.charAt(0).toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{userName}</span>
              <button
                onClick={onLogout}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.5)",
                  cursor: "pointer",
                  fontSize: 10,
                  padding: 0,
                  textAlign: "left",
                  fontFamily: theme.fontFamily,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.9)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
