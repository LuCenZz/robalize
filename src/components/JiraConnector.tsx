import { useState, useEffect, useRef, useCallback } from "react";
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
  onDataLoaded: (rows: RawRow[], silent?: boolean) => void;
  connected: boolean;
  onConnectionChange: (connected: boolean) => void;
  isAdmin?: boolean;
  saveSetting?: (key: string, value: unknown) => Promise<void>;
  loadAdminJiraConfig?: () => Promise<JiraConfig | null>;
}

export function JiraConnector({ open, onClose, onDataLoaded, connected, onConnectionChange, isAdmin = false, saveSetting, loadAdminJiraConfig }: JiraConnectorProps) {
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [jql, setJql] = useState('project = "ACTO" AND issuetype = Epic ORDER BY key ASC');
  const [maxRows, setMaxRows] = useState(5000);
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function loadConfig() {
      // Admin: always load from Supabase to get the real config
      if (isAdmin && loadAdminJiraConfig) {
        try {
          const config = await loadAdminJiraConfig();
          if (config && config.email && config.apiToken) {
            setEmail(config.email);
            setApiToken(config.apiToken);
            setJql(config.jql);
            setMaxRows(config.maxRows);
            setRefreshInterval(config.refreshInterval || 10);
            saveJiraConfig(config);
            return;
          }
        } catch (err) {
          console.error("Failed to load admin JIRA config:", err);
        }
      }
      // Non-admin or Supabase failed: try local config
      const saved = loadJiraConfig();
      if (saved && saved.email && saved.apiToken) {
        setEmail(saved.email);
        setApiToken(saved.apiToken);
        setJql(saved.jql);
        setMaxRows(saved.maxRows);
        setRefreshInterval(saved.refreshInterval || 10);
        return;
      }
      // Last resort: try admin config from Supabase
      if (loadAdminJiraConfig) {
        try {
          const config = await loadAdminJiraConfig();
          if (config && config.email && config.apiToken) {
            setEmail(config.email);
            setApiToken(config.apiToken);
            setJql(config.jql);
            setMaxRows(config.maxRows);
            setRefreshInterval(config.refreshInterval || 10);
            saveJiraConfig(config);
          }
        } catch (err) {
          console.error("Failed to load admin JIRA config:", err);
        }
      }
    }
    if (open) loadConfig();
  }, [open, loadAdminJiraConfig]);

  const doFetch = useCallback(async (silent = false) => {
    if (!email || !apiToken || !jql) {
      if (!silent) setError("Please fill in all fields.");
      return;
    }

    if (!silent) {
      setError("");
      setProgress(null);
    }
    setLoading(true);

    const config: JiraConfig = { email, apiToken, jql, maxRows, refreshInterval };
    saveJiraConfig(config);
    // Admin: also save to Supabase so other users can use it
    if (isAdmin && saveSetting) {
      saveSetting("jira_config", config);
    }

    try {
      const rows = await fetchJiraData(config, (loaded, total) => {
        if (!silent) setProgress({ loaded, total });
      });

      if (rows.length === 0) {
        if (!silent) setError("No results found for this JQL query.");
        setLoading(false);
        return;
      }

      onDataLoaded(rows, silent);
      onConnectionChange(true);
      setLastRefresh(new Date());
      if (!silent) onClose();
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Connection failed.");
      onConnectionChange(false);
    } finally {
      setLoading(false);
    }
  }, [email, apiToken, jql, maxRows, refreshInterval, onDataLoaded, onClose, onConnectionChange]);

  // Auto-refresh timer
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (connected && refreshInterval > 0) {
      timerRef.current = setInterval(() => {
        doFetch(true);
      }, refreshInterval * 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [connected, refreshInterval, doFetch]);

  function handleDisconnect() {
    onConnectionChange(false);
    setLastRefresh(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
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
            background: connected ? "#2b8a3e" : theme.primary,
            color: "white",
            padding: "16px 20px",
            borderRadius: "14px 14px 0 0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            {connected ? "Connected to Jira" : "Import from Jira"}
          </span>
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
          {/* Connection status */}
          {connected && lastRefresh && (
            <div
              style={{
                background: "#ebfbee",
                border: "1px solid #b2f2bb",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12,
                color: "#2b8a3e",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Last refresh: {lastRefresh.toLocaleTimeString()}</span>
              {refreshInterval > 0 && (
                <span style={{ opacity: 0.7 }}>Auto-refresh every {refreshInterval}s</span>
              )}
            </div>
          )}

          {/* Email — admin only */}
          {isAdmin ? (
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
          ) : (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#166534" }}>
              Jira connection is managed by the administrator. You can customize the JQL query below.
            </div>
          )}

          {/* API Token — admin only */}
          {isAdmin && (
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
          )}

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

          {/* Max rows + Refresh interval */}
          <div style={{ display: "flex", gap: 16 }}>
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
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: theme.textDark, display: "block", marginBottom: 4 }}>
                Auto-refresh (seconds)
              </label>
              <input
                type="number"
                value={refreshInterval || ""}
                onChange={(e) => setRefreshInterval(e.target.value === "" ? 0 : parseInt(e.target.value, 10) || 0)}
                min={0}
                step={30}
                placeholder="0 = off"
                style={{
                  width: 120,
                  padding: "9px 12px",
                  border: `1.5px solid ${theme.borderLight}`,
                  borderRadius: 8,
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <span style={{ fontSize: 10, color: theme.textMuted, display: "block", marginTop: 2 }}>
                0 = disabled
              </span>
            </div>
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

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              onClick={() => doFetch(false)}
              disabled={loading}
              style={{
                flex: 1,
                background: loading ? theme.textMuted : theme.primary,
                color: "white",
                border: "none",
                padding: "11px 20px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Loading..." : connected ? "Refresh Now" : "Get Data Now"}
            </button>
            {connected && (
              <button
                onClick={handleDisconnect}
                style={{
                  background: "white",
                  border: "1.5px solid #e03131",
                  color: "#e03131",
                  padding: "11px 16px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
