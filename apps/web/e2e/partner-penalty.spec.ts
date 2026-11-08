import { copy, CURRENCY_SYMBOL } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

test("the practice partner pledge needs both people, and either can switch it off", async ({ page, fake }) => {
  fake.seedUser();
  fake.givePartner("Ravi");
  await signIn(page, fake);
  await page.goto("/partner");

  await expect(page.getByRole("heading", { name: copy.partnerPenalty.title })).toBeVisible();
  await expect(page.getByText(copy.partnerPenalty.explain("Ravi"))).toBeVisible();
  await expect(page.getByText(copy.partnerPenalty.off, { exact: true })).toBeVisible();

  await page.getByLabel(copy.partnerPenalty.agree).check();
  await expect(page.getByText(copy.partnerPenalty.waiting("Ravi"))).toBeVisible();
  expect(fake.penalty.mine).toBe(true);

  fake.penalty.theirs = true;
  await page.getByLabel(copy.partnerPenalty.agree).uncheck();
  await expect(page.getByText(copy.partnerPenalty.off, { exact: true })).toBeVisible();
  await page.getByLabel(copy.partnerPenalty.agree).check();
  await expect(page.getByText(copy.partnerPenalty.on)).toBeVisible();
  fake.penalty.practice_total_30d = 6;
  await page.reload();
  await expect(page.getByText(copy.partnerPenalty.total(CURRENCY_SYMBOL, 6))).toBeVisible();
});

test("a partner who has had a rough few days gets a gentle nudge on Partner and Today", async ({ page, fake }) => {
  fake.seedUser();
  fake.givePartner("Ravi");
  fake.nudge = { level: 2, days: 3, name: "Ravi" };
  await signIn(page, fake);
  await expect(page.getByText(copy.nudge.level2("Ravi"))).toBeVisible();
  await expect(page.getByRole("link", { name: copy.nudge.open })).toBeVisible();
  await page.goto("/partner");
  await expect(page.getByText(copy.nudge.level2("Ravi"))).toBeVisible();
  await expect(page.getByText(/failed|lazy|broken|wasted|blame/i)).toHaveCount(0);
});

test("a lighter nudge for two harder days, and nothing when all is well", async ({ page, fake }) => {
  fake.seedUser();
  fake.givePartner("Ravi");
  fake.nudge = { level: 1, days: 2, name: "Ravi" };
  await signIn(page, fake);
  await expect(page.getByText(copy.nudge.level1("Ravi"))).toBeVisible();
  fake.nudge = { level: 0, days: 0 };
  await page.reload();
  await expect(page.getByText(copy.nudge.level1("Ravi"))).toHaveCount(0);
  await expect(page.getByText(copy.nudge.level2("Ravi"))).toHaveCount(0);
});
