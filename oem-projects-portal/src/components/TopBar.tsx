import { theme } from "../styles/theme";

interface TopBarProps {
  projectCount: number;
  onUploadClick: () => void;
  onJiraClick: () => void;
  onGeneratePptx?: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export function TopBar({ projectCount, onUploadClick, onJiraClick, onGeneratePptx, searchTerm, onSearchChange }: TopBarProps) {
  return (
    <div
      style={{
        background: theme.primary,
        color: "white",
        padding: "14px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: theme.fontFamily,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }}
        >
          nextlane
        </span>
        <span style={{ opacity: 0.5, fontSize: 13, marginLeft: 8 }}>
          |
        </span>
        <span style={{ opacity: 0.9, fontSize: 14, marginLeft: 8 }}>
          OEM Projects
        </span>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        {projectCount > 0 && (
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search ACTO or name..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{
                padding: "7px 12px 7px 32px",
                borderRadius: 20,
                border: "none",
                fontSize: 12,
                width: 220,
                outline: "none",
                background: "rgba(255,255,255,0.9)",
                color: theme.textDark,
              }}
            />
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 13,
                color: theme.textMuted,
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            {searchTerm && (
              <button
                onClick={() => onSearchChange("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: theme.textMuted,
                  cursor: "pointer",
                  fontSize: 14,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        )}
        {projectCount > 0 && (
          <span style={{ opacity: 0.8, fontSize: 12 }}>
            {projectCount} projects loaded
          </span>
        )}
        {onGeneratePptx && projectCount > 0 && (
          <button
            onClick={onGeneratePptx}
            style={{
              background: "white",
              color: theme.primary,
              border: "none",
              padding: "7px 16px",
              borderRadius: 20,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            Generate PPTX
          </button>
        )}
        <button
          onClick={onJiraClick}
          style={{
            background: "white",
            color: theme.primary,
            border: "none",
            padding: "7px 16px",
            borderRadius: 20,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          Connect Jira
        </button>
        <button
          onClick={onUploadClick}
          style={{
            background: "rgba(255,255,255,0.3)",
            color: "white",
            border: "none",
            padding: "7px 16px",
            borderRadius: 20,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          Load CSV/Excel
        </button>
      </div>
    </div>
  );
}
