import { theme } from "../styles/theme";

interface TopBarProps {
  projectCount: number;
  onUploadClick: () => void;
  onGeneratePptx?: () => void;
}

export function TopBar({ projectCount, onUploadClick, onGeneratePptx }: TopBarProps) {
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
          onClick={onUploadClick}
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
          Load CSV/Excel
        </button>
      </div>
    </div>
  );
}
