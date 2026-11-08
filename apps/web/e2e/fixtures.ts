import { test as base, expect, type Page } from "@playwright/test";
import { FakeSupabase } from "./fake-supabase";

export const test = base.extend<{ fake: FakeSupabase }>({
  fake: async ({ context }, provide) => {
    const fake = new FakeSupabase();
    await fake.install(context);
    await provide(fake);
  },
});
export { expect };

/** Sign in through the real login form against the fake backend. */
export async function signIn(page: Page, fake: FakeSupabase) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(fake.email);
  await page.getByLabel("Password").fill(fake.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/today");
}
