import { expect, test, type Page } from "@playwright/test";
import { copy } from "@sparrow/shared";

// The four flows the live smoke test walks (ROADMAP T0.4). Shared by e2e-live/smoke.spec.ts, which runs
// it against the REAL Supabase project, and e2e/live-smoke-flow.spec.ts, which runs it against the
// fake on every pull request so the selectors here never go stale unnoticed.
export async function smokeFlow(page: Page, { email, password }: { email: string; password: string }) {
  const task = "Smoke test: open the notes";

  await test.step("sign up", async () => {
    await page.goto("login");
    await page.getByRole("button", { name: copy.auth.createInstead }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: copy.auth.createBtn }).click();
    await expect(page.getByRole("heading", { name: copy.onboarding.title })).toBeVisible({ timeout: 20_000 });
    await page.getByLabel(copy.settings.name).fill("Smoke");
    await page.getByRole("button", { name: copy.settings.continue }).click();
    await page.getByRole("link", { name: copy.start.skipTour }).click();
  });

  await test.step("commit a day", async () => {
    await expect(page.getByRole("heading", { name: copy.tasks.title })).toBeVisible();
    await page.getByPlaceholder(copy.tasks.placeholder).fill(task);
    await page.getByRole("button", { name: copy.tasks.add }).click();
    await expect(page.getByText(task)).toBeVisible();
    await page.getByRole("link", { name: copy.nav.today, exact: true }).click();
    await page.getByLabel(task).check();
    await page.getByRole("button", { name: copy.today.commit }).click();
    await expect(page.getByRole("button", { name: copy.today.reviewMyDay })).toBeVisible();
  });

  await test.step("start and stop a focus session", async () => {
    await page.getByRole("link", { name: copy.nav.focus, exact: true }).click();
    await page.getByLabel(copy.focus.websiteLabel).fill("example.org");
    await page.getByRole("button", { name: copy.focus.add, exact: true }).click();
    await page.getByRole("button", { name: copy.focus.minutes(15) }).click();
    await expect(page.getByText(copy.focus.focusing(null), { exact: true })).toBeVisible();
    await page.getByRole("button", { name: copy.focus.endEarly }).click();
    // The early-exit pause is 30 seconds on purpose.
    await page.getByLabel(copy.earlyExitPrompt).fill("Smoke test is done", { timeout: 45_000 });
    await page.getByRole("button", { name: copy.focus.endSession }).click();
    await expect(page.getByRole("heading", { name: copy.focus.startTitle(null) })).toBeVisible();
  });

  await test.step("delete the account", async () => {
    await page.getByRole("link", { name: copy.nav.settings }).click();
    await page.getByRole("button", { name: copy.settings.deleteStart }).click();
    await page.getByLabel(copy.settings.deleteConfirmLabel(copy.settings.deleteWord)).fill(copy.settings.deleteWord);
    await page.getByRole("button", { name: copy.settings.deleteGo }).click();
    await page.waitForURL("**/login", { timeout: 30_000 });
    await expect(page.getByText(copy.auth.accountDeleted)).toBeVisible();
  });

  await test.step("the deleted account cannot sign in", async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toHaveText(copy.auth.mismatch);
  });
}
