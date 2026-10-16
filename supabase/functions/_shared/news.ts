/** The agent's read of a news item, when it gives one. Mirrored by the check on `news.sentiment`. */
export const NEWS_SENTIMENTS = ["positive", "negative", "neutral", "mixed"] as const;
export type Sentiment = (typeof NEWS_SENTIMENTS)[number];
