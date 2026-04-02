import { useState } from "react";
import { theme } from "../styles/theme";

interface LoginPageProps {
  onSignInEmail: (email: string, password: string) => Promise<void>;
  onSignUpEmail: (email: string, password: string) => Promise<void>;
  onSignInMicrosoft: () => Promise<void>;
}

export function LoginPage({ onSignInEmail, onSignUpEmail, onSignInMicrosoft }: LoginPageProps) {
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
            background: "#5B2D9E",
            borderRadius: 28,
            padding: "28px 40px",
            display: "inline-flex",
            alignItems: "center",
            gap: 24,
            marginBottom: 8,
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ width: 40, height: 7, borderRadius: 4, background: "#fff" }} />
              <div style={{ width: 30, height: 7, borderRadius: 4, background: "#fff", opacity: 0.65 }} />
              <div style={{ width: 22, height: 7, borderRadius: 4, background: "#fff", opacity: 0.35 }} />
            </div>
            <div>
              <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 64, lineHeight: 1, letterSpacing: -3, color: "#fff" }}>
                Rob<span style={{ color: "#5DE8B0" }}>a</span>l<span style={{ color: "#5DE8B0" }}>i</span>ze
              </div>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, letterSpacing: 4, color: "#C4A8E8", marginTop: 6 }}>
                AI SOLUTIONS
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => { setError(""); onSignInMicrosoft(); }}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.borderLight}`,
            background: theme.surface,
            color: theme.textDark,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginBottom: 24,
            fontFamily: theme.fontFamily,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
          Sign in with Microsoft
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ flex: 1, height: 1, background: theme.borderLight }} />
          <span style={{ color: theme.textMuted, fontSize: 12 }}>or</span>
          <div style={{ flex: 1, height: 1, background: theme.borderLight }} />
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
