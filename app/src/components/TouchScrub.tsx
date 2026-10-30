import { useEffect, useRef, type ReactNode } from "react";

const HOLD_MS = 300;
const SLOP_PX = 6;

/** After a short hold the finger scrubs the chart's tooltip, wherever it goes, rather than selecting text or scrolling the page. */
export function TouchScrub({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let timer = 0;
    let origin: { x: number; y: number } | null = null;
    let held = false;

    // Recharts ignores touches outside the plot, so the finger's x is replayed at the chart's middle.
    const replay = ({ identifier, clientX }: Touch) => {
      const chart = root.querySelector(".recharts-wrapper");
      if (!chart) return false;
      const { top, height } = chart.getBoundingClientRect();
      const touch = new Touch({ identifier, target: chart, clientX, clientY: top + height / 2 });
      chart.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          touches: [touch],
          targetTouches: [touch],
          changedTouches: [touch],
        }),
      );
      return true;
    };
    const release = () => {
      window.clearTimeout(timer);
      origin = null;
      held = false;
    };
    const start = (e: TouchEvent) => {
      release();
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      origin = { x: touch.clientX, y: touch.clientY };
      timer = window.setTimeout(() => {
        held = replay(touch);
      }, HOLD_MS);
    };
    const move = (e: TouchEvent) => {
      if (!e.isTrusted) return;
      const touch = e.touches[0];
      if (!touch || !e.cancelable) return release();
      if (held) {
        if (!replay(touch)) return release();
        e.preventDefault();
        e.stopPropagation();
      } else if (
        origin &&
        Math.hypot(touch.clientX - origin.x, touch.clientY - origin.y) > SLOP_PX
      ) {
        release();
      }
    };

    root.addEventListener("touchstart", start, { passive: true });
    root.addEventListener("touchmove", move, { passive: false });
    root.addEventListener("touchend", release);
    root.addEventListener("touchcancel", release);
    return () => {
      release();
      root.removeEventListener("touchstart", start);
      root.removeEventListener("touchmove", move);
      root.removeEventListener("touchend", release);
      root.removeEventListener("touchcancel", release);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      {children}
    </div>
  );
}
