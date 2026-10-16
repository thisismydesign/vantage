/** The Vantage mark: a rising line reaching a lookout. Mirrors public/favicon.svg. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="4 4 56 56" aria-hidden="true">
      <polyline
        points="8,50 21,34 31,41 45,21"
        fill="none"
        stroke="var(--mantine-color-teal-6)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="49"
        cy="15"
        r="8"
        fill="none"
        stroke="var(--mantine-color-teal-6)"
        strokeWidth="7"
      />
    </svg>
  );
}
