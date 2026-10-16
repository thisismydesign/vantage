// An agent records a news item through the REST API; the owner sees it on the news page.
import { expect, test } from "@playwright/test";
import { SUPABASE_URL, canSignIn, restHeaders, signIn } from "./session.ts";

const REST = `${SUPABASE_URL}/rest/v1`;

test("shows a news item the agent recorded", async ({ page, request }) => {
  test.skip(!canSignIn, "SUPABASE_SECRET_KEY, SUPABASE_URL and VITE_SUPABASE_KEY are needed");
  const session = await signIn(page);
  const headers = restHeaders(session);
  const list = await request.get(`${REST}/watchlist?select=ticker&order=position&limit=1`, {
    headers,
  });
  const [{ ticker }] = (await list.json()) as { ticker: string }[];
  const upsert = await request.post(`${REST}/news?on_conflict=owner,external_id`, {
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    data: {
      ticker,
      published_at: new Date().toISOString(),
      source: "e2e",
      title: "E2E analyst note",
      description: "Recorded by the end-to-end suite.",
      url: "https://example.com/e2e",
      sentiment: "neutral",
      expected: true,
      external_id: "e2e-news",
    },
  });
  expect([200, 201]).toContain(upsert.status());

  await page.goto("/#/news");
  await expect(page.getByRole("link", { name: "E2E analyst note" })).toBeVisible();
  await expect(page.getByText("Recorded by the end-to-end suite.")).toBeVisible();
});
