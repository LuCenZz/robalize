import { useState, useEffect } from "react";
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

export function LoginPage({ onSignInEmail, onSignUpEmail }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visibleLetters, setVisibleLetters] = useState(0);
  const [showDot, setShowDot] = useState(false);
  const [barsVisible, setBarsVisible] = useState(0);
  const [animDone, setAnimDone] = useState(false);

  useEffect(() => {
    // Bars animate in first
    const barTimers = [
      setTimeout(() => setBarsVisible(1), 200),
      setTimeout(() => setBarsVisible(2), 400),
      setTimeout(() => setBarsVisible(3), 600),
    ];
    // Then letters type in one by one
    const letterTimers = LETTERS.map((_, i) =>
      setTimeout(() => setVisibleLetters(i + 1), 800 + i * 120)
    );
    // Then the dot drops on the i
    const dotTimer = setTimeout(() => setShowDot(true), 800 + LETTERS.length * 120 + 300);
    // Mark animation complete for 3D idle
    const doneTimer = setTimeout(() => setAnimDone(true), 800 + LETTERS.length * 120 + 800);

    return () => {
      barTimers.forEach(clearTimeout);
      letterTimers.forEach(clearTimeout);
      clearTimeout(dotTimer);
      clearTimeout(doneTimer);
    };
  }, []);

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
            0% { transform: perspective(800px) rotateY(-6deg) rotateX(3deg); }
            50% { transform: perspective(800px) rotateY(6deg) rotateX(-3deg); }
            100% { transform: perspective(800px) rotateY(-6deg) rotateX(3deg); }
          }
          @keyframes dotDrop {
            0% { transform: translateY(-30px) scale(0); opacity: 0; }
            60% { transform: translateY(2px) scale(1.3); opacity: 1; }
            80% { transform: translateY(-3px) scale(0.9); }
            100% { transform: translateY(0) scale(1); opacity: 1; }
          }
          @keyframes letterIn {
            0% { opacity: 0; transform: translateY(8px) scale(0.8); filter: blur(4px); }
            100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          }
          @keyframes barGrow {
            0% { transform: scaleX(0); opacity: 0; }
            100% { transform: scaleX(1); opacity: 1; }
          }
          @keyframes glowPulse {
            0%, 100% { text-shadow: 0 0 8px rgba(93,232,176,0.2); }
            50% { text-shadow: 0 0 20px rgba(93,232,176,0.5), 0 4px 24px rgba(107,44,245,0.2); }
          }
          @keyframes cursorBlink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}</style>
        <div style={{ textAlign: "center", marginBottom: 32, perspective: 800 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 24,
              animation: animDone ? "logo3d 6s ease-in-out infinite" : "none",
              transformStyle: "preserve-3d",
              cursor: "default",
            }}
          >
            {/* 3 bars — grow in from left */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, transformStyle: "preserve-3d" }}>
              {[
                { w: 44, bg: theme.primary, opacity: 1, z: 20 },
                { w: 33, bg: theme.primary, opacity: 0.55, z: 14 },
                { w: 22, bg: "#5DE8B0", opacity: 0.9, z: 8 },
              ].map((bar, idx) => (
                <div
                  key={idx}
                  style={{
                    width: bar.w,
                    height: 7,
                    borderRadius: 3.5,
                    background: bar.bg,
                    opacity: barsVisible > idx ? bar.opacity : 0,
                    transform: `translateZ(${bar.z}px) scaleX(${barsVisible > idx ? 1 : 0})`,
                    transformOrigin: "left",
                    transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease",
                  }}
                />
              ))}
            </div>

            {/* Wordmark — typewriter effect */}
            <div style={{
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
              animation: animDone ? "glowPulse 4s ease-in-out infinite" : "none",
            }}>
              {LETTERS.map((letter, idx) => (
                <span
                  key={idx}
                  style={{
                    color: letter.color || theme.primary,
                    opacity: visibleLetters > idx ? 1 : 0,
                    transform: visibleLetters > idx ? "translateY(0) scale(1)" : "translateY(8px) scale(0.8)",
                    filter: visibleLetters > idx ? "blur(0)" : "blur(4px)",
                    transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                    display: "inline-block",
                    position: "relative",
                  }}
                >
                  {letter.char}
                  {letter.hasDot && (
                    <span style={{
                      position: "absolute",
                      top: -2,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 7,
                      height: 7,
                      borderRadius: 1.5,
                      background: "#5DE8B0",
                      opacity: showDot ? 1 : 0,
                      animation: showDot ? "dotDrop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" : "none",
                    }} />
                  )}
                </span>
              ))}
              {/* Blinking cursor — disappears when typing done */}
              {!animDone && (
                <span style={{
                  display: "inline-block",
                  width: 3,
                  height: 42,
                  background: theme.primary,
                  marginLeft: 2,
                  animation: "cursorBlink 0.8s step-end infinite",
                  opacity: visibleLetters >= LETTERS.length ? 0 : 1,
                  transition: "opacity 0.3s ease",
                }} />
              )}
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
