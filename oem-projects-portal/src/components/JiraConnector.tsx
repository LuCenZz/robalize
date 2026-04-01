import { useState, useEffect } from "react";
import { theme } from "../styles/theme";
import {
  fetchJiraData,
  loadJiraConfig,
  saveJiraConfig,
  type JiraConfig,
} from "../utils/jiraFetch";
import type { RawRow } from "../types";

interface JiraConnectorProps {
  open: boolean;
  onClose: () => void;
  onDataLoaded: (rows: RawRow[]) => void;
}

export function JiraConnector({ open, onClose, onDataLoaded }: JiraConnectorProps) {
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [jql, setJql] = useState('project = "ACTO" AND issuetype = Epic ORDER BY key ASC');
  const [maxRows, setMaxRows] = useState(5000);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = loadJiraConfig();
    if (saved) {
      setEmail(saved.email);
      setApiToken(saved.apiToken);
      setJql(saved.jql);
      setMaxRows(saved.maxRows);
    }
  }, []);

  async function handleFetch() {
    if (!email || !apiToken || !jql) {
      setError("Please fill in all fields.");
      return;
    }

    setError("");
    setLoading(true);
    setProgress(null);

    const config: JiraConfig = { email, apiToken, jql, maxRows };
    saveJiraConfig(config);

    try {
      const rows = await fetchJiraData(config, (loaded, total) => {
        setProgress({ loaded, total });
      });

      if (rows.length === 0) {
        setError("No results found for this JQL query.");
        setLoading(false);
        return;
      }

      onDataLoaded(rows);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: theme.fontFamily,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 14,
          boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
          width: 440,
          maxHeight: "90vh",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: theme.primary,
            color: "white",
            padding: "16px 20px",
            borderRadius: "14px 14px 0 0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 15 }}>Import from Jira</span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "white",
              fontSize: 18,
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Email */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: theme.textDark, display: "block", marginBottom: 4 }}>
              Atlassian email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={{
                width: "100%",
                padding: "9px 12px",
                border: `1.5px solid ${theme.borderLight}`,
                borderRadius: 8,
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = theme.primary)}
              onBlur={(e) => (e.currentTarget.style.borderColor = theme.borderLight)}
            />
          </div>

          {/* API Token */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: theme.textDark, display: "block", marginBottom: 4 }}>
              API Token
            </label>
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Paste your Atlassian API token"
              style={{
                width: "100%",
                padding: "9px 12px",
                border: `1.5px solid ${theme.borderLight}`,
                borderRadius: 8,
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = theme.primary)}
              onBlur={(e) => (e.currentTarget.style.borderColor = theme.borderLight)}
            />
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: theme.primary, textDecoration: "none", marginTop: 4, display: "inline-block" }}
            >
              Create an API token
            </a>
          </div>

          {/* JQL */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: theme.textDark, display: "block", marginBottom: 4 }}>
              JQL Query
            </label>
            <textarea
              value={jql}
              onChange={(e) => setJql(e.target.value)}
              rows={3}
              placeholder='project = "ACTO" AND issuetype = Epic'
              style={{
                width: "100%",
                padding: "9px 12px",
                border: `1.5px solid ${theme.borderLight}`,
                borderRadius: 8,
                fontSize: 13,
                outline: "none",
                resize: "vertical",
                fontFamily: "monospace",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = theme.primary)}
              onBlur={(e) => (e.currentTarget.style.borderColor = theme.borderLight)}
            />
            <a
              href={`https://imawebgroup.atlassian.net/issues/?jql=${encodeURIComponent(jql)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: theme.primary, textDecoration: "none", marginTop: 4, display: "inline-block" }}
            >
              Open in Jira
            </a>
          </div>

          {/* Max rows */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: theme.textDark, display: "block", marginBottom: 4 }}>
              Max rows
            </label>
            <input
              type="number"
              value={maxRows}
              onChange={(e) => setMaxRows(Number(e.target.value) || 1000)}
              min={1}
              max={10000}
              style={{
                width: 100,
                padding: "9px 12px",
                border: `1.5px solid ${theme.borderLight}`,
                borderRadius: 8,
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                background: "#fff0f0",
                border: "1px solid #ffc9c9",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12,
                color: "#e03131",
              }}
            >
              {error}
            </div>
          )}

          {/* Progress */}
          {loading && progress && (
            <div style={{ fontSize: 12, color: theme.textMuted }}>
              Loading... {progress.loaded} / {progress.total} issues
              <div
                style={{
                  marginTop: 6,
                  height: 4,
                  background: theme.borderLight,
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(progress.loaded / progress.total) * 100}%`,
                    background: theme.primary,
                    borderRadius: 2,
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleFetch}
            disabled={loading}
            style={{
              background: loading ? theme.textMuted : theme.primary,
              color: "white",
              border: "none",
              padding: "11px 20px",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              marginTop: 4,
            }}
          >
            {loading ? "Loading..." : "Get Data Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
