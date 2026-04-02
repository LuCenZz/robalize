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
        <style>{`
          @keyframes logo3d {
            0% { transform: perspective(800px) rotateY(-8deg) rotateX(4deg) scale(0.96); }
            25% { transform: perspective(800px) rotateY(4deg) rotateX(-2deg) scale(1.02); }
            50% { transform: perspective(800px) rotateY(8deg) rotateX(4deg) scale(0.98); }
            75% { transform: perspective(800px) rotateY(-4deg) rotateX(-2deg) scale(1.01); }
            100% { transform: perspective(800px) rotateY(-8deg) rotateX(4deg) scale(0.96); }
          }
          @keyframes barSlide1 {
            0%, 100% { transform: translateX(0); opacity: 1; }
            50% { transform: translateX(6px); opacity: 0.9; }
          }
          @keyframes barSlide2 {
            0%, 100% { transform: translateX(0); opacity: 0.55; }
            50% { transform: translateX(4px); opacity: 0.7; }
          }
          @keyframes barSlide3 {
            0%, 100% { transform: translateX(0); opacity: 0.9; }
            50% { transform: translateX(8px); opacity: 1; }
          }
          @keyframes glowPulse {
            0%, 100% { text-shadow: 0 0 8px rgba(93,232,176,0.3), 0 2px 12px rgba(107,44,245,0.15); }
            50% { text-shadow: 0 0 20px rgba(93,232,176,0.5), 0 4px 24px rgba(107,44,245,0.25); }
          }
        `}</style>
        <div style={{ textAlign: "center", marginBottom: 32, perspective: 800 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 24,
              animation: "logo3d 6s ease-in-out infinite",
              transformStyle: "preserve-3d",
              cursor: "default",
            }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
              const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
              e.currentTarget.style.animation = "none";
              e.currentTarget.style.transform = `perspective(800px) rotateY(${x * 25}deg) rotateX(${-y * 20}deg) scale(1.05)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.animation = "logo3d 6s ease-in-out infinite";
              e.currentTarget.style.transform = "";
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10, transformStyle: "preserve-3d" }}>
              <div style={{ width: 44, height: 7, borderRadius: 3.5, background: theme.primary, animation: "barSlide1 4s ease-in-out infinite", transform: "translateZ(20px)" }} />
              <div style={{ width: 33, height: 7, borderRadius: 3.5, background: theme.primary, animation: "barSlide2 4s ease-in-out infinite 0.3s", transform: "translateZ(14px)" }} />
              <div style={{ width: 22, height: 7, borderRadius: 3.5, background: "#5DE8B0", animation: "barSlide3 4s ease-in-out infinite 0.6s", transform: "translateZ(8px)" }} />
            </div>
            <div style={{
              fontFamily: "'Arial Black', Arial, sans-serif",
              fontWeight: 900,
              fontSize: 52,
              lineHeight: 1,
              letterSpacing: -4,
              color: theme.primary,
              transform: "translateZ(30px)",
              transformStyle: "preserve-3d",
              animation: "glowPulse 4s ease-in-out infinite",
            }}>
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
