import { expect, test } from "@playwright/test";
import { SUPABASE_URL, canSignIn, localDay, restHeaders, seedSnapshot, signIn } from "./session.ts";

const REST = `${SUPABASE_URL}/rest/v1`;

test("charts the account value the agent sent", async ({ page, request }) => {
  test.skip(!canSignIn, "SUPABASE_SECRET_KEY, SUPABASE_URL and VITE_SUPABASE_KEY are needed");
  const session = await signIn(page);
  await seedSnapshot(session);
  const days = [30, 20, 10, 0].map((ago) => localDay(new Date(Date.now() - ago * 86_400_000)));
  const sent = await request.post(`${REST}/nav_history?on_conflict=owner,as_of`, {
    headers: { ...restHeaders(session), Prefer: "resolution=merge-duplicates,return=minimal" },
    data: days.map((as_of, i) => ({ as_of, base_currency: "EUR", nav: 180_000 + i * 10_000 })),
  });
  expect([200, 201]).toContain(sent.status());

  await page.goto("/#/portfolio");
  const card = page.locator(".mantine-Card-root", { hasText: "Account value" });
  await card.getByText("3M", { exact: true }).click();
  await expect(card.getByText("€210,000")).toBeVisible();
  await expect(card.getByText("+16.7%", { exact: false })).toBeVisible();
  await expect(card.locator("svg.recharts-surface")).toBeVisible();
});
