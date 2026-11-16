import { copy, KEY_REQUESTS_PER_SESSION } from "@sparrow/shared";
import type { Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures";
import type { FakeSupabase } from "./fake-supabase";

// Partner fatigue guard (D43, T2.4). The limits and quiet hours themselves are proven in supabase/tests/rls_test.sql;
// these tests check that the asker is told kindly and that both kinds of key holder can set quiet hours.

const USER_ID = "11111111-1111-4111-8111-111111111111";

async function lockedSession(page: Page, fake: FakeSupabase) {
  fake.seedUser();
  fake.givePartner("Ravi");
  fake.db.blocklists = [{ user_id: USER_ID, domains: ["youtube.com"] }];
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.focus, exact: true }).click();
  await page.getByLabel(copy.focus.lockIt("Ravi")).check();
}

async function ask(page: Page, reason: string) {
  await page.getByRole("button", { name: copy.partnerKeyRequest("Ravi") }).click();
  await page.getByLabel(copy.focus.askWhy("Ravi")).fill(reason);
  await page.getByRole("button", { name: copy.partnerKeyRequest("Ravi") }).click();
  await expect(page.getByText(copy.partnerWaiting("Ravi"))).toBeVisible();
}

test("after three asks in one session, the asker is told kindly that the rest is theirs", async ({ page, fake }) => {
  test.setTimeout(60_000);
  await lockedSession(page, fake);
  await page.getByRole("button", { name: copy.focus.minutes(25) }).click();
  for (let i = 1; i <= KEY_REQUESTS_PER_SESSION; i++) {
    await ask(page, `Reason number ${i}`);
    fake.db.end_requests.at(-1)!.status = "denied"; // Ravi encourages them to keep going
    await expect(page.getByText(copy.partnerKeepGoing("Ravi"))).toBeVisible({ timeout: 10_000 });
    if (i < KEY_REQUESTS_PER_SESSION) await expect(page.getByText(copy.fatigue.asksLeft(KEY_REQUESTS_PER_SESSION - i))).toBeVisible();
  }
  await expect(page.getByText(copy.fatigue.sessionLimit("Ravi", KEY_REQUESTS_PER_SESSION))).toBeVisible();
  await expect(page.getByRole("button", { name: copy.partnerKeyRequest("Ravi") })).toHaveCount(0);
  expect(fake.db.end_requests).toHaveLength(KEY_REQUESTS_PER_SESSION);
});

test("when the key holder has quiet hours, the asker hears it before locking and after asking", async ({ page, fake }) => {
  const until = new Date(Date.now() + 2 * 3600_000);
  fake.holderQuietUntil = until.toISOString();
  await lockedSession(page, fake);
  const time = until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  await expect(page.getByText(copy.fatigue.lockQuiet("Ravi", time))).toBeVisible();
  await page.getByRole("button", { name: copy.focus.minutes(25) }).click();
  await ask(page, "My train is early");
  await expect(page.getByText(copy.fatigue.quietNow("Ravi", time))).toBeVisible();
  // the app still tells the server; the database holds the notification until quiet hours end
  await expect.poll(() => fake.notifyCalls.map((c) => c.kind)).toContain("key_request");
});

test("an account partner sets quiet hours on the Partner page", async ({ page, fake }) => {
  fake.seedUser();
  fake.givePartner("Ravi");
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.partner }).click();
  const panel = page.getByRole("region", { name: copy.fatigue.quietTitle });
  await expect(panel.getByText(copy.fatigue.quietBody("Ravi"))).toBeVisible();
  await expect(panel.getByText(copy.fatigue.none)).toBeVisible();
  await panel.getByLabel(copy.fatigue.from).fill("23:00");
  await panel.getByLabel(copy.fatigue.to).fill("23:00");
  await panel.getByRole("button", { name: copy.fatigue.save }).click();
  await expect(panel.getByText(copy.fatigue.needBoth)).toBeVisible();
  await panel.getByLabel(copy.fatigue.to).fill("07:30");
  await panel.getByRole("button", { name: copy.fatigue.save }).click();
  await expect(panel.getByText(copy.fatigue.saved("23:00", "07:30"))).toBeVisible();
  expect(fake.db.profiles[0]).toMatchObject({ quiet_from: "23:00", quiet_to: "07:30" });
  await page.reload();
  await expect(page.getByRole("region", { name: copy.fatigue.quietTitle }).getByText(copy.fatigue.saved("23:00", "07:30"))).toBeVisible();
  await page.getByRole("region", { name: copy.fatigue.quietTitle }).getByRole("button", { name: copy.fatigue.turnOff }).click();
  await expect(page.getByRole("region", { name: copy.fatigue.quietTitle }).getByText(copy.fatigue.none)).toBeVisible();
  expect(fake.db.profiles[0]).toMatchObject({ quiet_from: null, quiet_to: null });
});

test("a guest sets quiet hours on the key page, in their browser's time zone", async ({ fake, browser }) => {
  fake.seedUser();
  const key = "spg_" + "0123456789abcdef".repeat(4);
  fake.guestKey = { id: "33333333-3333-4333-8333-333333333333", name: "Ravi", key, last_seen_at: null };
  const ctx = await browser.newContext({ baseURL: "http://localhost:3000", serviceWorkers: "block", timezoneId: "Europe/Berlin" });
  await fake.install(ctx);
  const guest = await ctx.newPage();
  await guest.goto(`/key#${key}`);
  const panel = guest.getByRole("region", { name: copy.fatigue.quietTitle });
  await expect(panel.getByText(copy.fatigue.quietBody("Sam"))).toBeVisible();
  await panel.getByRole("button", { name: copy.fatigue.save }).click(); // the defaults: 22:00 to 07:00
  await expect(panel.getByText(copy.fatigue.saved("22:00", "07:00"))).toBeVisible();
  expect(fake.guestKey.quiet).toEqual({ from: "22:00", to: "07:00", tz: "Europe/Berlin" });
  await guest.reload();
  await expect(guest.getByRole("region", { name: copy.fatigue.quietTitle }).getByText(copy.fatigue.saved("22:00", "07:00"))).toBeVisible();
  await ctx.close();
});
