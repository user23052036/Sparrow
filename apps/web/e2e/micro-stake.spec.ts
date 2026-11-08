import { copy } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

test("a make-up step stake: a miss adds one five-minute step for tomorrow, which can be done", async ({ page, fake }) => {
  fake.seedUser({ gentle: false, tasks: ["Write", "Walk"] });
  await signIn(page, fake);
  await page.getByLabel("Write").check();
  await page.getByLabel("Walk").check();
  await page.getByRole("button", { name: copy.today.stakeMicro }).click();
  await expect(page.getByText(copy.today.microExplainer)).toBeVisible();
  const before = fake.points;
  await page.getByRole("button", { name: copy.today.commit }).click();
  await expect(page.getByText(copy.today.microSet)).toBeVisible();
  expect(fake.planFor(fake.today)).toMatchObject({ stake_type: "micro_task", stake_amount: 0 });
  expect(fake.points).toBe(before);

  await page.getByRole("button", { name: copy.today.reviewMyDay }).click();
  await page.getByRole("group", { name: "Write" }).getByRole("button", { name: copy.today.reviewOptions.done }).click();
  await page.getByRole("group", { name: "Walk" }).getByRole("button", { name: copy.today.reviewOptions.missed }).click();
  await page.getByRole("button", { name: copy.today.finishDay }).click();
  await expect(page.getByText(copy.today.makeupTomorrow)).toBeVisible();
  expect(fake.db.makeup_steps).toHaveLength(1);
  // not shown today: it belongs to tomorrow
  await expect(page.getByRole("region", { name: copy.today.makeupTitle })).toHaveCount(0);

  fake.today = "2026-11-10";
  await page.reload();
  const panel = page.getByRole("region", { name: copy.today.makeupTitle });
  await expect(panel.getByText("5 minutes on: Walk")).toBeVisible();
  await panel.getByRole("button", { name: copy.today.makeupDone }).click();
  await expect(page.getByText(copy.today.makeupThanks)).toBeVisible();
  await expect(page.getByRole("region", { name: copy.today.makeupTitle })).toHaveCount(0);
  expect(fake.db.makeup_steps[0].status).toBe("done");
});

test("a make-up step can be let go, and Gentle Mode never offers stakes", async ({ page, fake }) => {
  fake.seedUser({ gentle: false, tasks: ["Write"] });
  fake.db.makeup_steps.push({ id: "m1", user_id: "x", from_plan_id: "p", due_on: fake.today, title: "5 minutes on: Write", status: "owed" });
  await signIn(page, fake);
  await page.getByRole("region", { name: copy.today.makeupTitle }).getByRole("button", { name: copy.today.makeupLetGo }).click();
  await expect(page.getByRole("region", { name: copy.today.makeupTitle })).toHaveCount(0);
  expect(fake.db.makeup_steps[0].status).toBe("let_go");

  fake.profile().gentle_mode = true;
  await page.reload();
  await expect(page.getByRole("button", { name: copy.today.stakeMicro })).toHaveCount(0);
});

test("the morning suggests how many things to pick, from recent days and mood", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["A", "B", "C"] });
  await signIn(page, fake);
  await expect(page.getByText(copy.today.suggestion(3))).toBeVisible();
  await expect(page.getByText(copy.today.suggestionWhy.start)).toBeVisible();
  await page.getByRole("radio", { name: "Heavy" }).click();
  await expect(page.getByText(copy.today.suggestion(2))).toBeVisible();
  await expect(page.getByText(copy.today.suggestionWhy.mood)).toBeVisible();
});

test("after heavy days the suggestion is one fewer", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["A", "B", "C"] });
  fake.seedHeavyDays(["2026-11-05", "2026-11-07"]); // one planned item each, nothing done
  await signIn(page, fake);
  await expect(page.getByText(copy.today.suggestion(1))).toBeVisible();
  await expect(page.getByText(copy.today.suggestionWhy.smaller)).toBeVisible();
});
