import { copy } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

async function openDelete(page: import("@playwright/test").Page) {
  await page.getByRole("link", { name: copy.nav.settings }).click();
  await page.getByRole("button", { name: copy.settings.deleteStart }).click();
}

test("deleting the account needs the confirmation word, then removes everything and signs out", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Tidy desk"] });
  await signIn(page, fake);
  await openDelete(page);

  const go = page.getByRole("button", { name: copy.settings.deleteGo });
  await expect(go).toBeDisabled();
  await page.getByLabel(copy.settings.deleteConfirmLabel(copy.settings.deleteWord)).fill("dele");
  await expect(go).toBeDisabled();
  await page.getByLabel(copy.settings.deleteConfirmLabel(copy.settings.deleteWord)).fill("Delete");
  await go.click();

  await page.waitForURL("**/login");
  await expect(page.getByText(copy.auth.accountDeleted)).toBeVisible();
  expect(fake.deleteCalls).toEqual([{ confirm: true }]);
  expect(fake.db.tasks).toHaveLength(0);
  expect(fake.db.profiles).toHaveLength(0);

  // The old session is gone: the app asks for sign-in again.
  await page.goto("/today");
  await page.waitForURL("**/login");
});

test("if deletion can't finish, the account stays and the message is gentle", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Tidy desk"] });
  fake.failDelete = true;
  await signIn(page, fake);
  await openDelete(page);
  await page.getByLabel(copy.settings.deleteConfirmLabel(copy.settings.deleteWord)).fill("delete");
  await page.getByRole("button", { name: copy.settings.deleteGo }).click();

  await expect(page.locator("p.error")).toHaveText(copy.settings.deleteError);
  await expect(page).toHaveURL(/settings/);
  expect(fake.db.tasks).toHaveLength(1);
});

test("keeping the account closes the confirmation without calling the server", async ({ page, fake }) => {
  fake.seedUser();
  await signIn(page, fake);
  await openDelete(page);
  await page.getByRole("button", { name: copy.settings.deleteCancel }).click();
  await expect(page.getByRole("button", { name: copy.settings.deleteStart })).toBeVisible();
  expect(fake.deleteCalls).toHaveLength(0);
});
