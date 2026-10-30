import { Box } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Scrolling less than this is a resting thumb, not a direction. */
const SLACK = 8;

/**
 * A page's controls, kept under the app header while the page scrolls.
 * A phone has no room to spare, so there the bar slides away on the way down and returns on the first scroll up.
 */
export function Toolbar({ children }: { children: ReactNode }) {
  const mobile = useMediaQuery("(max-width: 48em)") ?? false;
  const bar = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    let anchor = window.scrollY;
    const offset = parseFloat(getComputedStyle(el).top);
    const onScroll = () => {
      const y = window.scrollY;
      const isStuck = el.getBoundingClientRect().top <= offset + 0.5;
      setStuck(isStuck);
      if (!isStuck || !mobile) {
        setShown(true);
        anchor = y;
      } else if (y > anchor + SLACK) {
        setShown(false);
        anchor = y;
      } else if (y < anchor - SLACK) {
        setShown(true);
        anchor = y;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [mobile]);
  return (
    <Box
      ref={bar}
      pos="sticky"
      top="var(--app-shell-header-offset, 0px)"
      mx="calc(-1 * var(--app-shell-padding, 0px))"
      px="var(--app-shell-padding, 0px)"
      // The padding shows only once stuck; in flow the negative margin cancels it.
      mt="calc(-1 * var(--mantine-spacing-xs))"
      py="xs"
      bg="var(--mantine-color-body)"
      style={{
        zIndex: 5,
        transform: shown ? undefined : "translateY(-100%)",
        transition: "transform 200ms ease",
        borderBottom: `1px solid ${stuck ? "var(--mantine-color-default-border)" : "transparent"}`,
      }}
    >
      {children}
    </Box>
  );
}
