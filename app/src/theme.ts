import { alpha, createTheme, type CSSVariablesResolver, type MantineTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "indigo",
  defaultRadius: "md",
  fontFamilyMonospace: "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Mono', monospace",
});

export const TONE = {
  positive: "teal",
  negative: "red",
  neutral: "gray",
  warning: "yellow",
  info: "blue",
} as const;

export type Tone = keyof typeof TONE;

export const ASSET_COLOR = {
  cash: "cyan.6",
  stock: "indigo.6",
  crypto: "orange.6",
  property: "grape.6",
} as const;

// Validated for CVD separation in light and dark; keep the order.
export const KIND_COLOR = {
  book: "indigo.6",
  podcast: "orange.7",
  video: "grape.7",
  article: "pink.7",
  post: "cyan.7",
} as const;

// Validated as a pair in light and dark.
export const MEDIUM_COLOR = {
  audio: "violet.7",
  video: "green.8",
} as const;

/** Mantine's defaults read faint on dark backgrounds. */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { "--mantine-color-dimmed": "var(--mantine-color-gray-7)" },
  dark: {
    "--mantine-color-text": "var(--mantine-color-gray-2)",
    "--mantine-color-dimmed": "var(--mantine-color-dark-1)",
  },
});

// One per group, by its place in the user's order, so a group looks the same on every page. Untagged and unclassified are gray.
const GROUP_COLORS = ["indigo", "teal", "grape", "orange", "cyan", "lime", "pink"] as const;

export function groupColors(groups: { id: string }[]): (id: string) => string {
  const index = new Map(groups.map((g, i) => [g.id, i]));
  return (id) => {
    const i = index.get(id);
    return i === undefined ? "gray" : GROUP_COLORS[i % GROUP_COLORS.length];
  };
}

/** For marks such as chart slices: well above the group's wash, below full strength, over light or dark. */
export const groupSolid = (theme: MantineTheme, color: string) =>
  alpha(theme.colors[color][6], 0.6);

/** A faint wash of the colour over the page background, for a group's surface; opaque, so a dragged row hides what it passes. */
export function groupTint(color: string) {
  const wash = `color-mix(in srgb, var(--mantine-color-${color}-6) 9%, transparent)`;
  return `linear-gradient(${wash}, ${wash}), var(--mantine-color-body)`;
}
