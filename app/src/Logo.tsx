import { useId } from "react";

const LINE = "6,44 11,38 16,41 22,28 32,48 44,14 49,20 53,16 58,8";

/** Mirrors public/favicon.svg: a rising price line with the V in it at full strength. */
export function Logo({ size = 24 }: { size?: number }) {
  const clip = useId();
  return (
    <svg width={size} height={size} viewBox="4 4 56 56" aria-hidden="true">
      <defs>
        {/* Cut along each peak's bisector, so the V keeps the line's sharp tips. */}
        <clipPath id={clip}>
          <polygon points="21.4,-12 36.9,-25.4 51.1,53.4 22.6,68" />
        </clipPath>
      </defs>
      <polyline
        points={LINE}
        fill="none"
        stroke="var(--mantine-color-teal-6)"
        strokeOpacity={0.35}
        strokeWidth={4.5}
        strokeMiterlimit={8}
      />
      <polyline
        points={LINE}
        fill="none"
        stroke="var(--mantine-color-teal-6)"
        strokeWidth={4.5}
        strokeMiterlimit={8}
        clipPath={`url(#${clip})`}
      />
    </svg>
  );
}
