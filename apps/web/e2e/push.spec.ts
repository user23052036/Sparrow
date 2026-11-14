import { copy } from "@sparrow/shared";
import type { Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures";

// Web Push (D38, T2.1). The browser's push manager and permission prompt are replaced with stand-ins, so these
// tests check what Sparrow does with them; the sending itself is covered by supabase/functions/notify tests.
async function mockPush(page: Page, opts: { deny?: boolean } = {}) {
  await page.addInitScript(
    ({ deny }) => {
      const w = window as unknown as Record<string, unknown>;
      let current: unknown = null;
      const pushManager = {
        async getSubscription() {
          return current;
        },
        async subscribe(o: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) {
          w.__subscribed = { userVisibleOnly: o.userVisibleOnly, keyBytes: o.applicationServerKey.byteLength };
          current = {
            endpoint: "https://push.example.com/send/this-browser",
            toJSON: () => ({ endpoint: "https://push.example.com/send/this-browser", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } }),
            async unsubscribe() {
              current = null;
              w.__unsubscribed = true;
              return true;
            },
          };
          return current;
        },
      };
      const reg = { pushManager };
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        get: () => ({ ready: Promise.resolve(reg), register: async () => reg, controller: null, addEventListener() {}, removeEventListener() {} }),
      });
      w.PushManager = function PushManager() {};
      let permission = "default";
      w.Notification = {
        get permission() {
          return permission;
        },
        async requestPermission() {
          permission = deny ? "denied" : "granted";
          return permission;
        },
      };
    },
    { deny: opts.deny ?? false },
  );
}

test("turning notifications on saves this browser with the server's key; turning off removes it", async ({ page, fake }) => {
  await mockPush(page);
  fake.seedUser();
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.settings }).click();
  const panel = page.getByRole("region", { name: copy.push.title });
  await expect(panel).toContainText(copy.push.body);
  await panel.getByRole("button", { name: copy.push.turnOn }).click();
  await expect(panel.getByText(copy.push.on)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __subscribed: unknown }).__subscribed)).toEqual({ userVisibleOnly: true, keyBytes: 65 });
  expect(fake.db.push_subscriptions).toHaveLength(1);
  expect(fake.db.push_subscriptions[0].endpoint).toBe("https://push.example.com/send/this-browser");

  await panel.getByRole("button", { name: copy.push.turnOff }).click();
  await expect(panel.getByRole("button", { name: copy.push.turnOn })).toBeVisible();
  expect(fake.db.push_subscriptions).toHaveLength(0);
  expect(await page.evaluate(() => (window as unknown as { __unsubscribed: boolean }).__unsubscribed)).toBe(true);
});

test("a blocked permission or a server without keys gets a kind explanation and saves nothing", async ({ page, fake }) => {
  await mockPush(page, { deny: true });
  fake.seedUser();
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.settings }).click();
  await page.getByRole("button", { name: copy.push.turnOn }).click();
  await expect(page.getByText(copy.push.denied)).toBeVisible();
  expect(fake.db.push_subscriptions).toHaveLength(0);
});

test("a server without notification keys says so", async ({ page, fake }) => {
  await mockPush(page);
  fake.vapidPublicKey = null;
  fake.seedUser();
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.settings }).click();
  await page.getByRole("button", { name: copy.push.turnOn }).click();
  await expect(page.getByText(copy.push.notReady)).toBeVisible();
  expect(fake.db.push_subscriptions).toHaveLength(0);
});

test("asking for the key tells the server, which notifies the partner", async ({ page, fake }) => {
  fake.seedUser();
  fake.givePartner("Ravi");
  fake.db.blocklists = [{ user_id: "11111111-1111-4111-8111-111111111111", domains: ["youtube.com"] }];
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.focus, exact: true }).click();
  await page.getByLabel(copy.focus.lockIt("Ravi")).check();
  await page.getByRole("button", { name: copy.focus.minutes(25) }).click();
  await page.getByRole("button", { name: copy.partnerKeyRequest("Ravi") }).click();
  await page.getByLabel(copy.focus.askWhy("Ravi")).fill("My train is early");
  await page.getByRole("button", { name: copy.partnerKeyRequest("Ravi") }).click();
  await expect(page.getByText(copy.partnerWaiting("Ravi"))).toBeVisible();
  await expect.poll(() => fake.notifyCalls).toEqual([{ kind: "key_request", ref: fake.db.end_requests[0].id }]);
});

test("the notification's 'Let them out' points at that answer, and one tap sends it", async ({ page, fake }) => {
  fake.seedUser();
  fake.givePartner("Ravi");
  const id = "00000000-0000-4000-8000-00000000abcd";
  (fake.partnerOverview as { pending_end_requests: unknown[] }).pending_end_requests = [
    { id, reason: "My train is early", created_at: new Date().toISOString(), session_ends_at: new Date(Date.now() + 600000).toISOString() },
  ];
  await signIn(page, fake);
  await page.goto(`/partner?request=${id}&answer=let-out`);
  await expect(page.getByText(copy.push.confirmLetOut)).toBeVisible();
  const letOut = page.getByRole("button", { name: copy.partnerUi.okayStop });
  await expect(letOut).toBeFocused();
  expect(fake.decided).toHaveLength(0); // arriving from the notification alone answers nothing
  await letOut.click();
  await expect.poll(() => fake.decided.map((d) => d.status)).toEqual(["approved"]);
  await expect.poll(() => fake.notifyCalls).toEqual([{ kind: "key_answer", ref: id }]);
});

test("sharing a proof notifies the partner; a private one does not", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Tidy desk", "Walk"] });
  fake.givePartner("Ravi");
  await signIn(page, fake);
  await page.getByLabel("Tidy desk").check();
  await page.getByLabel("Walk").check();
  await page.getByRole("button", { name: copy.today.commit }).click();

  const desk = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Tidy desk" }) });
  await desk.getByRole("button", { name: copy.today.done, exact: true }).click();
  await desk.getByRole("button", { name: copy.proof.writeNote }).click();
  await desk.getByLabel(copy.proof.noteLabel).fill("Desk is clear");
  await desk.getByRole("button", { name: copy.proof.saveNote }).click();
  await expect(desk.getByText(copy.today.proofsSaved(1))).toBeVisible();
  await expect.poll(() => fake.notifyCalls.map((c) => c.kind)).toEqual(["proof_shared"]);
  expect(fake.notifyCalls[0].ref).toBe(fake.db.proofs[0].id);

  const walk = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Walk" }) });
  await walk.getByRole("button", { name: copy.today.done, exact: true }).click();
  await walk.getByRole("checkbox").first().uncheck(); // the "share with Ravi" box
  await walk.getByRole("button", { name: copy.proof.writeNote }).click();
  await walk.getByLabel(copy.proof.noteLabel).fill("Short walk");
  await walk.getByRole("button", { name: copy.proof.saveNote }).click();
  await expect(walk.getByText(copy.today.proofsSaved(1))).toBeVisible();
  expect(fake.notifyCalls).toHaveLength(1);
});
