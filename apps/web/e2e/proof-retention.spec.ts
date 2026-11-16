import { copy } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

// Proof retention (T4.2, D48). Removing old proofs is the server's job (tested in rls_test.sql and the remind
// function's tests); this checks the choice and that a shorter time asks first.

test("proofs are kept until deleted by default; a shorter time asks first, a longer one doesn't", async ({ page, fake }) => {
  fake.seedUser();
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.settings }).click();
  const panel = page.getByRole("form", { name: copy.retention.title });
  await expect(panel.getByLabel(copy.retention.forever)).toBeChecked();
  await expect(panel.getByRole("button", { name: copy.retention.save })).toBeDisabled();

  await panel.getByLabel(copy.retention.days(30)).check();
  await panel.getByRole("button", { name: copy.retention.save }).click();
  await expect(panel.getByRole("alert")).toContainText(copy.retention.confirm(30));
  expect(fake.db.profiles[0].proof_keep_days ?? null).toBeNull(); // nothing changes before the second tap
  await panel.getByRole("button", { name: copy.retention.cancel }).click();
  await panel.getByRole("button", { name: copy.retention.save }).click();
  await panel.getByRole("button", { name: copy.retention.confirmYes }).click();
  await expect(panel.getByText(copy.retention.saved)).toBeVisible();
  expect(fake.db.profiles[0].proof_keep_days).toBe(30);

  // Longer again: nothing more is removed, so no question.
  await panel.getByLabel(copy.retention.days(90)).check();
  await panel.getByRole("button", { name: copy.retention.save }).click();
  await expect(panel.getByText(copy.retention.saved)).toBeVisible();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  expect(fake.db.profiles[0].proof_keep_days).toBe(90);
  await panel.getByLabel(copy.retention.forever).check();
  await panel.getByRole("button", { name: copy.retention.save }).click();
  await expect.poll(() => fake.db.profiles[0].proof_keep_days).toBeNull();
});
