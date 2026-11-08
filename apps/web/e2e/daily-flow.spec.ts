import { copy } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

test("a new person signs up, onboards, adds a task, plans and closes the day", async ({ page, fake }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: copy.auth.createInstead }).click();
  await page.getByLabel("Email").fill("new@example.com");
  await page.getByLabel("Password").fill("a-long-password");
  await page.getByRole("button", { name: copy.auth.createBtn }).click();

  // Onboarding
  await expect(page.getByRole("heading", { name: copy.onboarding.title })).toBeVisible();
  await page.getByLabel(copy.settings.name).fill("Sam");
  await page.getByRole("button", { name: copy.settings.continue }).click();

  // First task
  await expect(page.getByRole("heading", { name: copy.tasks.title })).toBeVisible();
  await page.getByPlaceholder(copy.tasks.placeholder).fill("Study for 25 minutes");
  await page.getByRole("button", { name: copy.tasks.add }).click();
  await expect(page.getByText("Study for 25 minutes")).toBeVisible();

  // Morning
  await page.getByRole("link", { name: copy.nav.today, exact: true }).click();
  await expect(page.getByRole("heading", { name: copy.today.title(", Sam") })).toBeVisible();
  await page.getByLabel("Study for 25 minutes").check();
  await page.getByRole("button", { name: copy.today.commit }).click();

  // During the day, then the evening review
  await page.getByRole("button", { name: copy.today.done, exact: true }).first().click();
  await page.getByRole("button", { name: copy.today.reviewMyDay }).click();
  await page.getByRole("button", { name: copy.today.reviewOptions.done }).click();
  await page.getByRole("button", { name: copy.today.finishDay }).click();

  await expect(page.getByText(copy.fullDay)).toBeVisible();
  await expect(page.getByRole("heading", { name: copy.today.closedTitle })).toBeVisible();
  expect(fake.planFor(fake.today)?.reviewed_at).toBeTruthy();
});

test("a wrong password gets a kind message, not a raw error", async ({ page, fake }) => {
  fake.seedUser();
  await page.goto("/login");
  await page.getByLabel("Email").fill(fake.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toHaveText(copy.auth.mismatch);
});

test("a partly finished day is still celebrated as progress", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Write", "Walk"] });
  await signIn(page, fake);
  await page.getByLabel("Write").check();
  await page.getByLabel("Walk").check();
  await page.getByRole("button", { name: copy.today.commit }).click();
  await page.getByRole("button", { name: copy.today.reviewMyDay }).click();
  await page.getByRole("group", { name: "Write" }).getByRole("button", { name: copy.today.reviewOptions.done }).click();
  await page.getByRole("button", { name: copy.today.finishDay }).click();
  await expect(page.getByText(copy.partialWin(1, 2))).toBeVisible();
  await expect(page.getByText(/failed|lazy|broken|wasted/i)).toHaveCount(0);
});
