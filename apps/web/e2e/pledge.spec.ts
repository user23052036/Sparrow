import { copy, CURRENCY_SYMBOL } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

const sym = CURRENCY_SYMBOL;

async function plan(page: import("@playwright/test").Page, tasks: string[], mood: string = "Okay") {
  for (const t of tasks) await page.getByLabel(t).check();
  await page.getByRole("radio", { name: mood }).click();
  await page.getByRole("button", { name: copy.today.commit }).click();
}

test("a pledge is practice only, cleared by a full day", async ({ page, fake }) => {
  fake.seedUser({ gentle: false, tasks: ["Write"] });
  fake.addCharity("Test Charity");
  await signIn(page, fake);
  await plan(page, ["Write"]);

  await expect(page.getByText(copy.pledge.practiceNote)).toBeVisible();
  await expect(page.getByText(copy.pledge.limit(sym, 20))).toBeVisible();
  const set = page.getByRole("button", { name: copy.pledge.setBtn });
  await expect(set).toBeDisabled();
  await page.getByLabel(copy.pledge.charityLabel, { exact: true }).selectOption({ label: "Test Charity" });
  await page.getByLabel(copy.pledge.understood).check();
  await page.getByLabel(copy.pledge.amountLabel, { exact: true }).fill("15");
  await set.click();

  await expect(page.getByText(copy.pledge.summary(sym, 15, "Test Charity"))).toBeVisible();
  await expect(page.getByRole("button", { name: copy.pledge.setBtn })).toHaveCount(0);
  expect(fake.db.pledges).toHaveLength(1);
  expect(fake.db.pledges[0]).toMatchObject({ amount: 15, mode: "practice" });

  await page.getByRole("button", { name: copy.today.reviewMyDay }).click();
  await page.getByRole("button", { name: copy.today.reviewOptions.done }).click();
  await page.getByRole("button", { name: copy.today.finishDay }).click();
  await expect(page.getByText(copy.pledge.cleared(sym, 15))).toBeVisible();
});

test("a miss turns into a kind, charity-framed message and nothing is charged", async ({ page, fake }) => {
  fake.seedUser({ gentle: false, tasks: ["Write", "Walk"] });
  fake.addCharity("Test Charity");
  await signIn(page, fake);
  await plan(page, ["Write", "Walk"]);
  await page.getByLabel(copy.pledge.charityLabel, { exact: true }).selectOption({ label: "Test Charity" });
  await page.getByLabel(copy.pledge.understood).check();
  await page.getByLabel(copy.pledge.amountLabel, { exact: true }).fill("20");
  await page.getByRole("button", { name: copy.pledge.setBtn }).click();
  await expect(page.getByText(copy.pledge.summary(sym, 20, "Test Charity"))).toBeVisible();

  await page.getByRole("button", { name: copy.today.reviewMyDay }).click();
  await page.getByRole("group", { name: "Write" }).getByRole("button", { name: copy.today.reviewOptions.done }).click();
  await page.getByRole("group", { name: "Walk" }).getByRole("button", { name: copy.today.reviewOptions.missed }).click();
  await page.getByRole("button", { name: copy.today.finishDay }).click();

  await expect(page.getByText(copy.pledge.helped(sym, 10, "Test Charity"), { exact: false })).toBeVisible();
  await expect(page.getByText(/failed|lazy|broken|wasted/i)).toHaveCount(0);
  expect(fake.db.pledges[0]).toMatchObject({ owed: 10, status: "owed", mode: "practice" });
});

test("the limit is enforced with a clear message", async ({ page, fake }) => {
  fake.seedUser({ gentle: false, tasks: ["Write"] });
  fake.addCharity("Test Charity");
  await signIn(page, fake);
  await plan(page, ["Write"]);
  await page.getByLabel(copy.pledge.charityLabel, { exact: true }).selectOption({ label: "Test Charity" });
  await page.getByLabel(copy.pledge.understood).check();
  await page.getByLabel(copy.pledge.amountLabel, { exact: true }).evaluate((el: HTMLInputElement) => el.removeAttribute("max"));
  await page.getByLabel(copy.pledge.amountLabel, { exact: true }).fill("90");
  await page.getByRole("button", { name: copy.pledge.setBtn }).click();
  await expect(page.locator("p.error")).toContainText("up to 20 today");
  expect(fake.db.pledges).toHaveLength(0);
});

test("no pledge panel with Gentle Mode on, after a heavy morning, or without charities", async ({ page, fake }) => {
  fake.seedUser({ gentle: true, tasks: ["Write"] });
  fake.addCharity("Test Charity");
  await signIn(page, fake);
  await plan(page, ["Write"]);
  await expect(page.getByText(copy.pledge.title)).toHaveCount(0);
});

test("a heavy morning means no pledge is offered", async ({ page, fake }) => {
  fake.seedUser({ gentle: false, tasks: ["Write"] });
  fake.addCharity("Test Charity");
  await signIn(page, fake);
  await plan(page, ["Write"], "Heavy");
  await expect(page.getByText(copy.pledge.title)).toHaveCount(0);
});

test("no charities in the list means no pledge panel", async ({ page, fake }) => {
  fake.seedUser({ gentle: false, tasks: ["Write"] });
  await signIn(page, fake);
  await plan(page, ["Write"]);
  await expect(page.getByText(copy.pledge.title)).toHaveCount(0);
});
