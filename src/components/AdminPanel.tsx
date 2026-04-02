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
    if (!supabase) return;
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
    if (!supabase) return;
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
                      background: u.role === "admin" ? `${theme.primary}22` : u.role === "pending" ? "#FFF3E0" : theme.rowAlt,
                      color: u.role === "admin" ? theme.primary : u.role === "pending" ? "#E65100" : theme.textSecondary,
                    }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.borderRow}`, textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {u.role === "pending" && (
                      <button
                        onClick={() => updateRole(u.id, "viewer")}
                        style={{
                          padding: "5px 12px",
                          borderRadius: theme.radius.sm,
                          border: "none",
                          background: "#2e7d32",
                          color: "white",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: theme.fontFamily,
                        }}
                      >
                        Approve
                      </button>
                    )}
                    {u.role !== "pending" && (
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
                    )}
                    {u.role !== "admin" && (
                      <button
                        onClick={() => { if (confirm(`Reject and remove ${u.email}?`)) updateRole(u.id, "pending"); }}
                        style={{
                          padding: "5px 12px",
                          borderRadius: theme.radius.sm,
                          border: "1px solid #e5393533",
                          background: "white",
                          color: "#e53935",
                          fontSize: 11,
                          cursor: "pointer",
                          fontFamily: theme.fontFamily,
                        }}
                      >
                        Reject
                      </button>
                    )}
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
