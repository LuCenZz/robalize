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
          @keyframes cursorBlink {
            0%, 100% { opacity: 1; }
            50%      { opacity: 0; }
          }
          @keyframes cursorFade {
            to { opacity: 0; }
          }
          @keyframes logo3d {
            0%   { transform: perspective(800px) rotateY(-6deg) rotateX(3deg); }
            50%  { transform: perspective(800px) rotateY(6deg) rotateX(-3deg); }
            100% { transform: perspective(800px) rotateY(-6deg) rotateX(3deg); }
          }
          @keyframes glowPulse {
            0%, 100% { text-shadow: 0 0 8px rgba(93,232,176,0.2); }
            50%      { text-shadow: 0 0 20px rgba(93,232,176,0.5), 0 4px 24px rgba(107,44,245,0.2); }
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
            width: 7px;
            height: 7px;
            border-radius: 1.5px;
            background: #5DE8B0;
            opacity: 0;
            transform: translateX(-50%) translateY(-30px) scale(0);
            animation: dotDrop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            will-change: transform, opacity;
          }
          .logo-cursor {
            display: inline-block;
            width: 3px;
            height: 42px;
            background: ${theme.primary};
            margin-left: 2px;
            animation: cursorBlink 0.8s step-end infinite, cursorFade 0.3s ease forwards;
            will-change: opacity;
          }
          .logo-wrapper {
            animation: logo3d 6s ease-in-out infinite;
            animation-delay: ${IDLE_DELAY}ms;
            animation-fill-mode: none;
            will-change: transform;
          }
          .logo-wordmark {
            animation: glowPulse 4s ease-in-out infinite;
            animation-delay: ${IDLE_DELAY}ms;
          }
        `}</style>
        <div style={{ textAlign: "center", marginBottom: 32, perspective: 800 }}>
          <div
            className="logo-wrapper"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 24,
              transformStyle: "preserve-3d",
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
                    transform: `translateZ(${bar.z}px) scaleX(0)`,
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
                letterSpacing: -4,
                color: theme.primary,
                transform: "translateZ(30px)",
                transformStyle: "preserve-3d",
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
              {/* Cursor — fades out after last letter */}
              <span
                className="logo-cursor"
                style={{
                  animationDelay: `0s, ${LETTER_START + LETTERS.length * LETTER_STAGGER}ms`,
                }}
              />
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
