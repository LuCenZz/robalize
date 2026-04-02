import { useState } from "react";
import { theme } from "../styles/theme";

interface LoginPageProps {
  onSignInEmail: (email: string, password: string) => Promise<void>;
  onSignUpEmail: (email: string, password: string) => Promise<void>;
}

export function LoginPage({ onSignInEmail, onSignUpEmail }: LoginPageProps) {
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
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 24,
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ width: 44, height: 7, borderRadius: 3.5, background: theme.primary }} />
              <div style={{ width: 33, height: 7, borderRadius: 3.5, background: theme.primary, opacity: 0.55 }} />
              <div style={{ width: 22, height: 7, borderRadius: 3.5, background: "#5DE8B0", opacity: 0.9 }} />
            </div>
            <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 52, lineHeight: 1, letterSpacing: -4, color: theme.primary }}>
              rob<span style={{ color: "#5DE8B0" }}>a</span>l<span style={{ color: "#5DE8B0" }}>i</span>ze
            </div>
          </div>
        </div>

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
