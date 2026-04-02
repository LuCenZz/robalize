import { useEffect, useRef } from "react";

export function ShimmerTitle() {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let pos = 200;
    let frameId: number;
    function animate() {
      pos -= 1.2;
      if (pos <= -200) pos = 200;
      el!.style.backgroundPosition = `${pos}% center`;
      frameId = requestAnimationFrame(animate);
    }
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <p
      ref={ref}
      style={{
        fontSize: 28,
        fontWeight: 700,
        margin: 0,
        background: "linear-gradient(90deg, #6B2CF5 0%, #A78BFA 25%, #C4B5FD 50%, #A78BFA 75%, #6B2CF5 100%)",
        backgroundSize: "200% auto",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }}
    >
      Get started
    </p>
  );
}
