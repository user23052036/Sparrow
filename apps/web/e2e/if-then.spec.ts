import { copy } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

test("an if-then plan is saved on the task and shown in the morning", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Write report"] });
  await signIn(page, fake);
  await page.goto("/tasks");
  await page.getByRole("button", { name: copy.tasks.edit }).click();

  await page.getByLabel(copy.tasks.planIf, { exact: true }).fill("If I sit down after lunch.");
  // only one half filled: nothing is stored and what was typed is kept
  await page.getByRole("button", { name: copy.tasks.planSave }).click();
  await expect(page.locator("p.error")).toHaveText(copy.tasks.planNeedsBoth);
  await expect(page.getByLabel(copy.tasks.planIf, { exact: true })).toHaveValue("If I sit down after lunch.");
  expect(fake.db.tasks[0].if_cue ?? null).toBeNull();

  await page.getByLabel(copy.tasks.planThen, { exact: true }).fill("then I will open the doc.");
  await page.getByRole("button", { name: copy.tasks.planSave }).click();
  await expect(page.getByRole("status").filter({ hasText: copy.tasks.planSaved })).toBeVisible();
  expect(fake.db.tasks[0]).toMatchObject({ if_cue: "I sit down after lunch", then_action: "open the doc" });
  await expect(page.getByText("If I sit down after lunch, then I will open the doc.").first()).toBeVisible();

  await page.goto("/today");
  await page.getByLabel("Write report").check();
  await page.getByRole("button", { name: copy.today.commit }).click();
  await expect(page.getByText("If I sit down after lunch, then I will open the doc.")).toBeVisible();
});

test("clearing the plan removes it", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Write report"] });
  fake.db.tasks[0].if_cue = "I sit down";
  fake.db.tasks[0].then_action = "stretch";
  await signIn(page, fake);
  await page.goto("/tasks");
  await page.getByRole("button", { name: copy.tasks.edit }).click();
  await page.getByRole("button", { name: copy.tasks.planClear }).click();
  await expect(page.getByText("If I sit down, then I will stretch.")).toHaveCount(0);
  expect(fake.db.tasks[0].if_cue).toBeNull();
});
