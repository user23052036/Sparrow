import { copy, LIGHT_DAY_MAX_TASKS } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

const FIVE = ["One", "Two", "Three", "Four", "Five"];

test("low mood offers a lighter day, and accepting it caps the day at two tasks with no stake", async ({ page, fake }) => {
  fake.seedUser({ gentle: false, tasks: FIVE });
  fake.points = 40;
  await signIn(page, fake);

  // Stakes are available on a regular day.
  await expect(page.getByRole("heading", { name: copy.today.stakeTitle })).toBeVisible();

  await page.getByRole("radio", { name: copy.moods[0], exact: true }).click(); // Heavy
  await expect(page.getByText(copy.lowMoodOffer)).toBeVisible();
  await page.getByRole("button", { name: copy.lightDayYes }).click();

  await expect(page.getByText(copy.lightDayNowOn)).toBeVisible();
  await expect(page.getByRole("heading", { name: copy.today.stakeTitle })).toHaveCount(0);
  expect(fake.profile().light_day).toBe(fake.today);

  for (const t of ["One", "Two"]) await page.getByLabel(t, { exact: true }).check();
  await expect(page.getByLabel("Three", { exact: true })).toBeDisabled();
  await expect(page.getByText(copy.today.picked(LIGHT_DAY_MAX_TASKS, LIGHT_DAY_MAX_TASKS))).toBeVisible();

  await page.getByRole("button", { name: copy.today.commit }).click();
  await expect(page.getByRole("button", { name: copy.today.reviewMyDay })).toBeVisible();
  expect(fake.planFor(fake.today)?.stake_amount).toBe(0);
});

test("the lighter day is an offer: declining keeps the regular day", async ({ page, fake }) => {
  fake.seedUser({ tasks: FIVE });
  await signIn(page, fake);
  await page.getByRole("radio", { name: copy.moods[1], exact: true }).click(); // Low
  await page.getByRole("button", { name: copy.lightDayNo }).click();
  await expect(page.getByText(copy.lowMoodOffer)).toHaveCount(0);
  for (const t of FIVE) await page.getByLabel(t, { exact: true }).check();
  await expect(page.getByText(copy.today.picked(5, 5))).toBeVisible();
  expect(fake.profile().light_day).toBeNull();
});

test("after a lighter day is chosen it can be switched back", async ({ page, fake }) => {
  fake.seedUser({ tasks: FIVE });
  await signIn(page, fake);
  await page.getByRole("radio", { name: copy.moods[0], exact: true }).click();
  await page.getByRole("button", { name: copy.lightDayYes }).click();
  await page.getByRole("button", { name: copy.lightDayOff }).click();
  await expect(page.getByText(copy.lightDayNowOn)).toHaveCount(0);
  expect(fake.profile().light_day).toBeNull();
});

test("three hard days in a row: the morning offers a small day", async ({ page, fake }) => {
  fake.seedUser({ tasks: FIVE });
  fake.seedHeavyDays(["2026-11-06", "2026-11-07", "2026-11-08"]);
  await signIn(page, fake);
  await expect(page.getByText(copy.heavyStretchToday)).toBeVisible();
  await expect(page.getByRole("button", { name: copy.lightDayYes })).toBeVisible();
});

test("a gap in the days does not count as a hard stretch", async ({ page, fake }) => {
  fake.seedUser({ tasks: FIVE });
  fake.seedHeavyDays(["2026-11-04", "2026-11-07", "2026-11-08"]);
  await signIn(page, fake);
  await expect(page.getByRole("heading", { name: copy.today.goodMorning })).toBeVisible();
  await expect(page.getByText(copy.heavyStretchToday)).toHaveCount(0);
});

test("closing the third hard day offers a lighter tomorrow, and saying yes sets it", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Write"] });
  fake.seedHeavyDays(["2026-11-07", "2026-11-08"]);
  await signIn(page, fake);
  await page.getByLabel("Write").check();
  await page.getByRole("button", { name: copy.today.commit }).click();
  await page.getByRole("button", { name: copy.today.reviewMyDay }).click();
  await page.getByRole("button", { name: copy.today.reviewOptions.missed }).click();
  await page.getByRole("button", { name: copy.today.finishDay }).click();

  await expect(page.getByText(copy.heavyStretch)).toBeVisible();
  await expect(page.getByRole("link", { name: copy.supportLink })).toBeVisible();
  await page.getByRole("button", { name: copy.lightDayYes }).click();
  await expect(page.getByText(copy.lightDayTomorrow)).toBeVisible();
  expect(fake.profile().light_day).toBe("2026-11-10");
});

test("the support page and links are reachable and use calm language", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Write"] });
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.support }).click();
  await expect(page.getByRole("heading", { name: copy.helpTitle })).toBeVisible();
  await expect(page.getByText(copy.helpInside)).toBeVisible();
});
