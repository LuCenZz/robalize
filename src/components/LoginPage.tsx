import { useState } from "react";
import { theme } from "../styles/theme";

const APP_USER_KEY = "oem-app-user";

export interface AppUser {
  email: string;
  displayName: string;
}

export function saveAppUser(user: AppUser) {
  localStorage.setItem(APP_USER_KEY, JSON.stringify(user));
}

export function loadAppUser(): AppUser | null {
  try {
    const stored = localStorage.getItem(APP_USER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function clearAppUser() {
  localStorage.removeItem(APP_USER_KEY);
}

interface LoginPageProps {
  onLogin: (user: AppUser) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    const namePart = trimmed.split("@")[0];
    const displayName = namePart
      .split(/[._-]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");

    const user: AppUser = { email: trimmed, displayName };
    saveAppUser(user);
    onLogin(user);
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f2f2f2",
        fontFamily: theme.fontFamily,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "white",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          padding: "44px 44px 36px",
          width: 440,
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontWeight: 800, fontSize: 22, color: theme.primary, letterSpacing: -0.5 }}>
            nextlane
          </span>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1b1b1b", margin: "0 0 4px" }}>
          Sign in
        </h1>
        <p style={{ fontSize: 13, color: "#666", margin: "0 0 24px" }}>
          to continue to OEM Projects Portal
        </p>

        {/* Email field */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="Email address"
            autoFocus
            style={{
              width: "100%",
              padding: "10px 0",
              border: "none",
              borderBottom: `1px solid ${error ? "#e03131" : "#ababab"}`,
              fontSize: 15,
              outline: "none",
              boxSizing: "border-box",
              background: "transparent",
              color: "#1b1b1b",
            }}
            onFocus={(e) => (e.currentTarget.style.borderBottomColor = theme.primary)}
            onBlur={(e) => (e.currentTarget.style.borderBottomColor = error ? "#e03131" : "#ababab")}
          />
          {error && (
            <p style={{ fontSize: 12, color: "#e03131", margin: "6px 0 0" }}>{error}</p>
          )}
        </div>

        {/* Help text */}
        <p style={{ fontSize: 12, color: "#666", margin: "0 0 24px" }}>
          Use your company email address.
        </p>

        {/* Submit */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            style={{
              background: theme.primary,
              color: "white",
              border: "none",
              padding: "10px 36px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Next
          </button>
        </div>
      </form>
    </div>
  );
}
