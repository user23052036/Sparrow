import { copy, parseGuestKey } from "@sparrow/shared";
import type { Browser, Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures";
import type { FakeSupabase } from "./fake-supabase";
import { mockPush } from "./push-mock";

// Guest partner (D39, T2.3). What a key link may and may not do is proven in supabase/tests/rls_test.sql;
// these tests walk the screens: invite, request, approve, take back, turn into a full partner.

const USER_ID = "11111111-1111-4111-8111-111111111111";

/** The owner makes a key link for a friend on the Partner page and copies it. */
async function makeKeyLink(page: Page, friend: string): Promise<string> {
  await page.getByRole("link", { name: copy.nav.partner }).click();
  const form = page.getByRole("form", { name: copy.guestKey.title });
  await expect(form.getByText(copy.guestKey.body)).toBeVisible();
  await form.getByLabel(copy.guestKey.nameLabel).fill(`  ${friend}  `);
  await form.getByRole("button", { name: copy.guestKey.create }).click();
  await expect(page.getByText(copy.guestKey.newTitle(friend))).toBeVisible();
  await expect(page.getByText(copy.guestKey.newOnce)).toBeVisible();
  return page.getByLabel(copy.guestKey.linkLabel).inputValue();
}

/** A different browser, with no session: the friend who got the link. */
async function guestBrowser(browser: Browser, fake: FakeSupabase): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3000", serviceWorkers: "block", locale: "en-US" });
  await fake.install(ctx);
  return ctx.newPage();
}

test("a friend without an account holds the key: they see the request and let the owner out", async ({ page, fake, browser }) => {
  fake.seedUser();
  fake.db.blocklists = [{ user_id: USER_ID, domains: ["youtube.com"] }];
  await signIn(page, fake);

  const url = await makeKeyLink(page, "Ravi");
  const key = parseGuestKey(url);
  expect(key).not.toBeNull();
  expect(url).toMatch(/\/key#spg_[0-9a-f]{64}$/);
  expect(new URL(url).search).toBe(""); // the key never travels in the query string

  // once dismissed, the key is gone from the page for good
  await page.getByRole("button", { name: copy.guestKey.done }).click();
  await expect(page.getByText(copy.guestKey.holding("Ravi"))).toBeVisible();
  await expect(page.getByText(copy.guestKey.seen(null))).toBeVisible();
  await page.reload();
  await expect(page.getByText(copy.guestKey.holding("Ravi"))).toBeVisible();
  await expect(page.locator("body")).not.toContainText(key!);

  // something shared and something private
  fake.db.tasks.push({ id: "t-walk", user_id: USER_ID, title: "Evening walk" });
  fake.db.plan_items.push({ id: "i-walk", user_id: USER_ID, task_id: "t-walk", status: "done" });
  fake.db.proofs.push({ id: "p-shared", plan_item_id: "i-walk", kind: "text", text_body: "Walked by the river", visibility: "buddy" });
  fake.db.proofs.push({ id: "p-photo", plan_item_id: "i-walk", kind: "photo", storage_path: `${USER_ID}/river.jpg`, visibility: "buddy" });
  fake.db.proofs.push({ id: "p-private", plan_item_id: "i-walk", kind: "text", text_body: "Private diary line", visibility: "private" });

  // the owner locks a session with the guest and asks for the key
  await page.getByRole("link", { name: copy.nav.focus, exact: true }).click();
  await page.getByLabel(copy.focus.lockIt("Ravi")).check();
  await page.getByRole("button", { name: copy.focus.minutes(25) }).click();
  await expect(page.getByText(copy.partnerLockExplainer("Ravi"))).toBeVisible();
  await page.getByRole("button", { name: copy.partnerKeyRequest("Ravi") }).click();
  await page.getByLabel(copy.focus.askWhy("Ravi")).fill("My train is early");
  await page.getByRole("button", { name: copy.partnerKeyRequest("Ravi") }).click();
  await expect(page.getByText(copy.partnerWaiting("Ravi"))).toBeVisible();
  const request = fake.db.end_requests[0];
  await expect.poll(() => fake.notifyCalls).toContainEqual({ kind: "key_request", ref: request.id });

  // the friend opens the link: no account, no sign-in
  const guest = await guestBrowser(browser, fake);
  await guest.goto(url);
  await expect(guest.getByRole("heading", { name: copy.keyPage.title("Sam") })).toBeVisible();
  await expect(guest.getByText(copy.partnerUi.theyWant("My train is early"))).toBeVisible();
  await expect(guest.getByText("Walked by the river")).toBeVisible();
  await expect(guest.getByText(copy.keyPage.photo)).toBeVisible();
  await expect(guest.locator("body")).not.toContainText("Private diary line");
  await expect(guest.locator("body")).not.toContainText("river.jpg");
  await expect(guest.getByRole("link", { name: copy.keyPage.signUp })).toBeVisible();

  // from a notification's button: the browser remembers the key, and a tap still confirms the answer
  await guest.goto(`/key?request=${request.id}&answer=let-out`);
  await expect(guest.getByText(copy.push.confirmLetOut)).toBeVisible();
  await guest.getByRole("button", { name: copy.partnerUi.okayStop }).click();
  await expect(guest.getByText(copy.keyPage.answered("Sam", true))).toBeVisible();
  await expect(guest.getByText(copy.keyPage.nothingWaiting("Sam"))).toBeVisible();
  expect(fake.db.end_requests[0].status).toBe("approved");
  await expect.poll(() => fake.notifyCalls).toContainEqual({ kind: "key_answer", ref: request.id, key: key! });

  // the owner is let out
  await expect(page.getByText(copy.partnerLetGo("Ravi"))).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: copy.nav.partner }).click();
  await expect(page.getByText(copy.guestKey.seen("just now"))).toBeVisible();
});

test("a guest can turn notifications on for their browser and off again", async ({ page, fake, browser }) => {
  fake.seedUser();
  await signIn(page, fake);
  const url = await makeKeyLink(page, "Ravi");
  const guest = await guestBrowser(browser, fake);
  await mockPush(guest);
  await guest.goto(url);
  const panel = guest.getByRole("region", { name: copy.push.title });
  await expect(panel.getByText(copy.keyPage.pushBody("Sam"))).toBeVisible();
  await panel.getByRole("button", { name: copy.push.turnOn }).click();
  await expect(panel.getByText(copy.push.on)).toBeVisible();
  expect(fake.db.push_subscriptions).toHaveLength(1);
  expect(fake.db.push_subscriptions[0]).toMatchObject({ user_id: null, guest_key_id: fake.guestKey!.id });
  await panel.getByRole("button", { name: copy.push.turnOff }).click();
  await expect(panel.getByRole("button", { name: copy.push.turnOn })).toBeVisible();
  expect(fake.db.push_subscriptions).toHaveLength(0);
});

test("taking the key back stops the link at once", async ({ page, fake, browser }) => {
  fake.seedUser();
  await signIn(page, fake);
  const url = await makeKeyLink(page, "Ravi");
  await page.getByRole("button", { name: copy.guestKey.done }).click();
  await page.getByRole("button", { name: copy.guestKey.takeBack }).click();
  await expect(page.getByText(copy.guestKey.takeBackConfirm("Ravi"))).toBeVisible();
  await page.getByRole("button", { name: copy.guestKey.yesTakeBack }).click();
  await expect(page.getByRole("form", { name: copy.guestKey.title })).toBeVisible();
  expect(fake.guestKey).toBeNull();

  const guest = await guestBrowser(browser, fake);
  await guest.goto(url);
  await expect(guest.getByText(copy.keyPage.invalid)).toBeVisible();
  await guest.goto("/key");
  await expect(guest.getByText(copy.keyPage.noKey)).toBeVisible(); // a dead key is forgotten
});

test("a guest who signs in from the link becomes a full partner", async ({ page, fake, browser }) => {
  fake.seedUser();
  fake.guestOwnerName = "Gita";
  await signIn(page, fake);
  const url = await makeKeyLink(page, "Ravi");

  const guest = await guestBrowser(browser, fake);
  await guest.goto(url);
  await expect(guest.getByText(copy.keyPage.accountBody("Gita"))).toBeVisible();
  await guest.getByRole("link", { name: copy.keyPage.signUp }).click();
  await guest.waitForURL("**/login");
  await guest.getByLabel("Email").fill(fake.email);
  await guest.getByLabel("Password").fill(fake.password);
  await guest.getByRole("button", { name: "Sign in", exact: true }).click();
  // back on the key page after signing in, now with an account
  await guest.waitForURL("**/key");
  await guest.getByRole("button", { name: copy.keyPage.convert("Gita") }).click();
  await guest.waitForURL("**/partner");
  await expect(guest.getByRole("heading", { name: copy.partnerUi.withName("Gita") })).toBeVisible();
  expect(fake.guestKey).toBeNull();
});
