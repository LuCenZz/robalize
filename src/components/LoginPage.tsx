import { useState } from "react";
import { theme } from "../styles/theme";

interface LoginPageProps {
  onSignInEmail: (email: string, password: string) => Promise<void>;
  onSignUpEmail: (email: string, password: string) => Promise<void>;
}

const LETTERS = [
  { char: "r", color: "" },
  { char: "o", color: "" },
  { char: "b", color: "" },
  { char: "a", color: "#5DE8B0" },
  { char: "l", color: "" },
  { char: "ı", color: "#5DE8B0", hasDot: true },
  { char: "z", color: "" },
  { char: "e", color: "" },
];

// All timing in ms — CSS-only, no re-renders
const BAR_START = 200;
const BAR_STAGGER = 200;
const LETTER_START = 800;
const LETTER_STAGGER = 120;
const DOT_DELAY = LETTER_START + LETTERS.length * LETTER_STAGGER + 300;
const IDLE_DELAY = LETTER_START + LETTERS.length * LETTER_STAGGER + 800;

export function LoginPage({ onSignInEmail, onSignUpEmail }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSignUp) {
        await onSignUpEmail(email, password);
        setSignUpSuccess(true);
        setIsSignUp(false);
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
          @keyframes barGrow {
            from { transform: scaleX(0); opacity: 0; }
            to   { transform: scaleX(1); opacity: var(--bar-opacity); }
          }
          @keyframes letterIn {
            from { opacity: 0; transform: translateY(8px) scale(0.8); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes dotDrop {
            0%   { transform: translateX(-50%) translateY(-30px) scale(0); opacity: 0; }
            60%  { transform: translateX(-50%) translateY(2px) scale(1.3); opacity: 1; }
            80%  { transform: translateX(-50%) translateY(-3px) scale(0.9); opacity: 1; }
            100% { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
          }
          .logo-letter {
            opacity: 0;
            transform: translateY(8px) scale(0.8);
            animation: letterIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            will-change: transform, opacity;
            display: inline-block;
            position: relative;
          }
          .logo-bar {
            transform: scaleX(0);
            opacity: 0;
            transform-origin: left;
            animation: barGrow 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            will-change: transform, opacity;
          }
          .logo-dot {
            position: absolute;
            top: -2px;
            left: 50%;
            margin-left: 2px;
            width: 10px;
            height: 10px;
            border-radius: 2px;
            background: #5DE8B0;
            opacity: 0;
            transform: translateX(-50%) translateY(-30px) scale(0);
            animation: dotDrop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            will-change: transform, opacity;
          }
          .logo-wrapper { }
          .logo-wordmark { }
        `}</style>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            className="logo-wrapper"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 24,
              cursor: "default",
            }}
          >
            {/* 3 bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, transformStyle: "preserve-3d" }}>
              {[
                { w: 44, bg: theme.primary, opacity: 1, z: 20 },
                { w: 33, bg: theme.primary, opacity: 0.55, z: 14 },
                { w: 22, bg: "#5DE8B0", opacity: 0.9, z: 8 },
              ].map((bar, idx) => (
                <div
                  key={idx}
                  className="logo-bar"
                  style={{
                    width: bar.w,
                    height: 7,
                    borderRadius: 3.5,
                    background: bar.bg,
                    "--bar-opacity": bar.opacity,
                    transform: "scaleX(0)",
                    animationDelay: `${BAR_START + idx * BAR_STAGGER}ms`,
                  } as React.CSSProperties}
                />
              ))}
            </div>

            {/* Wordmark */}
            <div
              className="logo-wordmark"
              style={{
                fontFamily: "'Arial Black', Arial, sans-serif",
                fontWeight: 900,
                fontSize: 52,
                lineHeight: 1,
                letterSpacing: -2,
                color: theme.primary,
                  display: "flex",
                alignItems: "baseline",
              }}
            >
              {LETTERS.map((letter, idx) => (
                <span
                  key={idx}
                  className="logo-letter"
                  style={{
                    color: letter.color || theme.primary,
                    animationDelay: `${LETTER_START + idx * LETTER_STAGGER}ms`,
                  }}
                >
                  {letter.char}
                  {letter.hasDot && (
                    <span
                      className="logo-dot"
                      style={{ animationDelay: `${DOT_DELAY}ms` }}
                    />
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.textMuted, marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Email
            </label>
            <input
              type="email"
              placeholder="votre.email@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: theme.radius.md,
                border: `1px solid ${theme.borderLight}`,
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: theme.fontFamily,
              }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.textMuted, marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={{
                  width: "100%",
                  padding: "12px 40px 12px 16px",
                  borderRadius: theme.radius.md,
                  border: `1px solid ${theme.borderLight}`,
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: theme.fontFamily,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: theme.textMuted,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
          {signUpSuccess && (
            <p style={{ color: "#2b8a3e", fontSize: 13, marginBottom: 12, background: "#ebfbee", padding: "10px 14px", borderRadius: 8, border: "1px solid #b2f2bb" }}>
              A confirmation email has been sent. Please check your inbox and click the link to activate your account.
            </p>
          )}

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
            onClick={() => { setIsSignUp(!isSignUp); setError(""); setSignUpSuccess(false); }}
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
