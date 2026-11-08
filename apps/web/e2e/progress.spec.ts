import { readFileSync } from "node:fs";
import { BADGE_KEYS, copy } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

test("the progress page shows earned and not-yet badges, a private mood trend and helping days", async ({ page, fake }) => {
  fake.seedUser();
  fake.points = 35;
  fake.progress = {
    badges: ["first_plan", "run_3"],
    best_run: 4,
    helping_days: 2,
    kind_acts: 1,
    mood: [
      { date: "2026-11-07", morning: 2, evening: 4 },
      { date: "2026-11-08", morning: 5, evening: null },
    ],
  };
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.progress }).click();

  await expect(page.getByRole("heading", { name: copy.progress.title })).toBeVisible();
  await expect(page.getByText(copy.progress.points(35))).toBeVisible();
  await expect(page.getByText(copy.progress.earnedCount(2, BADGE_KEYS.length), { exact: false })).toBeVisible();
  await expect(page.locator('[data-badge="run_3"]')).toHaveAttribute("data-earned", "true");
  await expect(page.locator('[data-badge="run_7"]')).toHaveAttribute("data-earned", "false");
  await expect(page.locator('[data-badge="run_7"]')).toContainText(copy.progress.notYet);
  await expect(page.getByText(copy.progress.runLine(4), { exact: false })).toBeVisible();

  // newest day first, with words rather than scores; a missing evening check-in shows a dash
  const rows = page.getByRole("list", { name: copy.progress.moodTitle }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Bright");
  await expect(rows.first()).toContainText(`${copy.progress.evening}: –`);
  await expect(rows.nth(1)).toContainText("Low");

  await expect(page.getByText(copy.progress.helpingDays(2))).toBeVisible();
  await expect(page.getByText(copy.progress.kindActs(1))).toBeVisible();
  await expect(page.getByText(/failed|lazy|broken|wasted|streak/i)).toHaveCount(0);
});

test("a new person sees a calm, empty progress page", async ({ page, fake }) => {
  fake.seedUser();
  await signIn(page, fake);
  await page.goto("/progress");
  await expect(page.getByText(copy.progress.earnedCount(0, BADGE_KEYS.length), { exact: false })).toBeVisible();
  await expect(page.getByText(copy.progress.moodEmpty)).toBeVisible();
  await expect(page.getByText(copy.progress.helpingDays(0))).toBeVisible();
  await expect(page.getByText(copy.progress.runLine(0))).toBeVisible();
});

test("download my data saves a JSON file with the person's own data", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Tidy desk"] });
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.settings }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: copy.settings.exportBtn }).click()]);
  expect(download.suggestedFilename()).toMatch(/^sparrow-data-\d{4}-\d{2}-\d{2}\.json$/);
  const body = JSON.parse(readFileSync(await download.path(), "utf8"));
  expect(body.tasks.map((t: { title: string }) => t.title)).toEqual(["Tidy desk"]);
  expect(body.profile.display_name).toBe("Sam");
});
