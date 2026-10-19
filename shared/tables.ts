// Rows the app reads straight from the database; the migrations define them.

/**
 * Few on purpose: each gets a colour.
 * results   — the company reports: earnings, guidance, annual report
 * corporate — capital and structure: dividend, split, offering, lock-up, IPO, M&A
 * milestone — what the company stages: launch, conference, investor day, product
 * external  — decided about the company: regulator, court, government, macro
 * Mirrored by the check constraint on `events.category`.
 */
export const EVENT_CATEGORIES = ["results", "corporate", "milestone", "external"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** Mirrored by the check on `news.sentiment`. */
export const NEWS_SENTIMENTS = ["positive", "negative", "neutral", "mixed"] as const;
export type Sentiment = (typeof NEWS_SENTIMENTS)[number];

export interface CalendarEvent {
  id: string;
  ticker: string;
  category: EventCategory;
  kind: string | null;
  title: string;
  description: string | null;
  starts_on: string;
  ends_on: string | null;
  estimated: boolean;
  source: string | null;
  url: string | null;
  external_id: string | null;
  updated_at: string;
}

export interface NewsItem {
  id: string;
  ticker: string;
  published_at: string;
  source: string | null;
  title: string;
  description: string | null;
  url: string | null;
  sentiment: Sentiment | null;
  /** Whether the market had it priced in; null when the agent gave no view. */
  expected: boolean | null;
  external_id: string | null;
  updated_at: string;
}

/** The hash never leaves the database. */
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}
