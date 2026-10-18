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
