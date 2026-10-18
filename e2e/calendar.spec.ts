import { expect, test } from "@playwright/test";
import { SUPABASE_URL, canSignIn, localDay, restHeaders, signIn } from "./session.ts";

const REST = `${SUPABASE_URL}/rest/v1`;

test("shows an event the agent recorded", async ({ page, request }) => {
  test.skip(!canSignIn, "SUPABASE_SECRET_KEY, SUPABASE_URL and VITE_SUPABASE_KEY are needed");
  const session = await signIn(page);
  const headers = restHeaders(session);
  const list = await request.get(`${REST}/watchlist?select=ticker&order=position&limit=1`, {
    headers,
  });
  const [{ ticker }] = (await list.json()) as { ticker: string }[];
  const upsert = await request.post(`${REST}/events?on_conflict=owner,external_id`, {
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    data: {
      ticker,
      category: "results",
      kind: "earnings",
      title: "E2E earnings call",
      starts_on: localDay(),
      source: "e2e",
      external_id: "e2e-earnings",
    },
  });
  expect([200, 201]).toContain(upsert.status());

  await page.goto("/#/calendar");
  await expect(page.getByText("E2E earnings call").first()).toBeVisible();
  await page
    .getByRole("button", { name: /E2E earnings call/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("earnings");
});
