import { useEffect, useRef, type ReactNode } from "react";

const HOLD_MS = 300;
const SLOP_PX = 6;
const PLOT = ".recharts-area-area, .recharts-line-curve, .recharts-bar-rectangles";

/** After a short hold the finger scrubs the chart's tooltip, wherever it goes, rather than selecting text or scrolling the page. */
export function TouchScrub({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let timer = 0;
    let origin: { x: number; y: number } | null = null;
    let held = false;
    let chart: { element: Element; left: number; right: number; middle: number } | null = null;

    // The finger's x is replayed inside the plotted area, as a mouse move: WebKit has no Touch constructor, and a mouse outside the plot hides the tooltip.
    const replay = ({ clientX }: Touch) => {
      if (!chart?.element.isConnected) return false;
      chart.element.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: Math.min(Math.max(clientX, chart.left), chart.right),
          clientY: chart.middle,
        }),
      );
      return true;
    };
    const release = () => {
      window.clearTimeout(timer);
      origin = null;
      held = false;
      chart = null;
    };
    const start = (e: TouchEvent) => {
      release();
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      origin = { x: touch.clientX, y: touch.clientY };
      timer = window.setTimeout(() => {
        const element = root.querySelector(".recharts-wrapper");
        if (!element) return;
        const plot = element.querySelector(PLOT) ?? element;
        const { left, right, top, height } = plot.getBoundingClientRect();
        chart = { element, left: left + 1, right: right - 1, middle: top + height / 2 };
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
