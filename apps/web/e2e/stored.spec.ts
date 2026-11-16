import { copy, STORED } from "@sparrow/shared";
import { expect, test } from "./fixtures";

// "What Sparrow stores" (T4.1): public, built from the migrations' snapshot, every table described.

const startsWith = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);

test("the privacy page leads to every table Sparrow stores, with who can read it", async ({ page }) => {
  await page.goto("/privacy");
  await page.getByRole("link", { name: copy.stored.privacyLink }).click();
  await expect(page.getByRole("heading", { name: copy.stored.title, level: 1 })).toBeVisible();
  for (const t of Object.values(STORED)) await expect(page.getByRole("heading", { name: startsWith(t.title) })).toBeVisible();
  const guest = page.getByRole("region", { name: startsWith(STORED.guest_keys.title) });
  await expect(guest.getByText(STORED.guest_keys.who)).toBeVisible();
  await guest.getByText(copy.stored.columns(Object.keys(STORED.guest_keys.columns).length)).click();
  await expect(guest.getByText(copy.stored.hidden)).toHaveCount(3);
  await expect(page.getByRole("heading", { name: copy.stored.filesTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: copy.stored.signInTitle, exact: true })).toBeVisible();
  await expect(page.getByText(copy.stored.operators)).toBeVisible();
});
