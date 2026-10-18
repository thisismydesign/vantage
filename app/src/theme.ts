import { createTheme, type CSSVariablesResolver } from "@mantine/core";

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
