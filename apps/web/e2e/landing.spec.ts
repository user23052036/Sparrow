import { copy } from "@sparrow/shared";
import { expect, test } from "./fixtures";

// The suite runs at phone width (Pixel 7, playwright.config.ts).
test("the landing page states the position and the three steps at phone width", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: copy.landing.title })).toBeVisible();
  await expect(page.getByText(copy.landing.body)).toBeVisible();

  const steps = page.getByRole("region", { name: copy.landing.stepsTitle }).getByRole("listitem");
  await expect(steps).toHaveCount(3);
  for (const [i, s] of copy.landing.steps.entries()) {
    await expect(steps.nth(i).getByRole("heading", { name: s.title })).toBeVisible();
    await expect(steps.nth(i)).toContainText(s.body);
  }

  // Nothing wider than the screen.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await expect(page.getByRole("link", { name: copy.nav.privacy })).toBeVisible();
  await page.getByRole("link", { name: copy.landing.help, exact: true }).click();
  await page.waitForURL("**/help");
});

test("get started leads to sign-up", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: copy.landing.start }).click();
  await page.waitForURL("**/login");
});
