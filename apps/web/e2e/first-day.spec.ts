import { copy } from "@sparrow/shared";
import { expect, test } from "./fixtures";

test("a new account is walked to a finished first step in one flow", async ({ page, fake }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: copy.auth.createInstead }).click();
  await page.getByLabel("Email").fill("first@example.com");
  await page.getByLabel("Password").fill("a-long-password");
  await page.getByRole("button", { name: copy.auth.createBtn }).click();
  await page.getByLabel(copy.settings.name).fill("Ari");
  await page.getByRole("button", { name: copy.settings.continue }).click();

  // 1. one task
  await expect(page.getByRole("heading", { name: copy.start.title })).toBeVisible();
  await expect(page.getByText(copy.start.progress(1))).toBeVisible();
  await page.getByLabel(copy.start.taskLabel).fill("Tidy my desk");
  await page.getByRole("button", { name: copy.start.next }).click();

  // 2. split it; today gets planned with it
  await expect(page.getByText(copy.start.splitHint("Tidy my desk"))).toBeVisible();
  await page.getByLabel(copy.start.splitLabel).fill("Clear one corner");
  await page.getByRole("button", { name: copy.start.next }).click();
  await expect(page.getByText(copy.start.planned)).toBeVisible();

  // 3. run the five-minute step
  await page.getByRole("button", { name: copy.start.tryStart }).click();
  await page.getByRole("button", { name: copy.timer.markDone }).click();

  // 4. the key holder, skippable
  await expect(page.getByText(copy.start.doneTitle)).toBeVisible();
  await expect(page.getByRole("link", { name: copy.start.keyInvite })).toHaveAttribute("href", "/partner");
  await page.getByRole("link", { name: copy.start.keySkip }).click();
  await page.waitForURL("**/today");

  const step = fake.db.task_steps[0];
  expect(step.title).toBe("Clear one corner");
  expect(step.done_on).toBe(fake.today);
  expect(fake.planFor(fake.today)?.committed_at).toBeTruthy();
  // Today shows the planned task with its step already done.
  await expect(page.getByRole("heading", { name: "Tidy my desk" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Clear one corner" })).toBeChecked();
});

test("the guided day can be left at any point without losing what was added", async ({ page, fake }) => {
  fake.seedUser({ onboarded: false });
  await page.goto("/login");
  await page.getByLabel("Email").fill(fake.email);
  await page.getByLabel("Password").fill(fake.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: copy.settings.continue }).click();
  await page.getByLabel(copy.start.taskLabel).fill("Call the dentist");
  await page.getByRole("button", { name: copy.start.next }).click();
  await page.getByRole("link", { name: copy.start.skipTour }).click();
  await expect(page.getByRole("heading", { name: copy.tasks.title })).toBeVisible();
  await expect(page.getByText("Call the dentist")).toBeVisible();
});
