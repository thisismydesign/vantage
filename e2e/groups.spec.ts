import { expect, test } from "@playwright/test";
import { admin, canSignIn, signIn } from "./session.ts";

test("reorders groups in Settings, and the watchlist follows", async ({ page }) => {
  test.skip(!canSignIn, "SUPABASE_SECRET_KEY, SUPABASE_URL and VITE_SUPABASE_KEY are needed");
  const session = await signIn(page);
  const owner = session.user.id;
  const { data: saved } = await admin()
    .from("watchlist_themes")
    .select("id,label,position")
    .eq("owner", owner)
    .order("position");
  test.skip(!saved || saved.length < 2, "the test user needs two groups");
  const [first, second] = saved!;
  try {
    await page.goto("/");
    const headings = page.getByRole("button", { name: /^Collapse (?!all$)/ });
    await expect(headings.first()).toHaveAccessibleName(`Collapse ${first.label}`, {
      timeout: 60_000,
    });

    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByRole("menuitem", { name: "Watchlist" }).click();
    // The library's keyboard drag: lift, move up one place, drop.
    await page.getByLabel(`Move ${second.label}`).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    await page.keyboard.press("Escape");

    await expect(headings.first()).toHaveAccessibleName(`Collapse ${second.label}`, {
      timeout: 30_000,
    });
  } finally {
    for (const t of saved!)
      await admin()
        .from("watchlist_themes")
        .update({ position: t.position })
        .eq("owner", owner)
        .eq("id", t.id);
  }
});
