import { devices, expect, test } from "@playwright/test";
import { resetThrottle } from "./session.ts";

test.use({ ...devices["Pixel 7"] });

test.beforeAll(resetThrottle);

test("a held finger scrubs the chart without scrolling the page", async ({ page }) => {
  await page.goto("/");
  const chart = page.locator(".recharts-wrapper").first();
  await expect(chart).toBeVisible({ timeout: 60_000 });
  await chart.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = (await chart.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const finger = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  const tooltip = chart.locator(".recharts-tooltip-wrapper");
  const scrollY = () => page.evaluate(() => window.scrollY);

  const x = box.x + box.width * 0.3;
  const y = box.y + box.height / 2;
  const below = box.y + box.height + 120;
  const top = await scrollY();
  await finger("touchStart", x, y);
  await expect(tooltip).toBeVisible();
  const first = (await tooltip.textContent())!;
  await finger("touchMove", x + 10, below);
  await finger("touchMove", x + 80, below);
  await expect(tooltip).not.toHaveText(first);
  await finger("touchMove", box.x + box.width + 20, below);
  await expect(tooltip).toBeVisible();
  expect(await scrollY()).toBe(top);
  await finger("touchEnd");

  await Promise.all([
    finger("touchStart", x, y),
    ...Array.from({ length: 8 }, (_, i) => finger("touchMove", x, y - (i + 1) * 25)),
    finger("touchEnd"),
  ]);
  await expect.poll(scrollY).toBeGreaterThan(top);
});
