import { copy } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";
import { mockPush } from "./push-mock";

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
  expect(fake.db.push_subscriptions[0].endpoint).toBe("https://fcm.googleapis.com/fcm/send/this-browser");

  await panel.getByRole("button", { name: copy.push.turnOff }).click();
  await expect(panel.getByRole("button", { name: copy.push.turnOn })).toBeVisible();
  expect(fake.db.push_subscriptions).toHaveLength(0);
  expect(await page.evaluate(() => (window as unknown as { __unsubscribed: boolean }).__unsubscribed)).toBe(true);
});

test("a browser someone else switched on shows as off, and signing out stops this person's notifications", async ({ page, fake }) => {
  await mockPush(page);
  fake.seedUser();
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.settings }).click();
  await page.getByRole("button", { name: copy.push.turnOn }).click();
  await expect(page.getByText(copy.push.on)).toBeVisible();
  // Another account's row for this browser: RLS would hide it, so the switch must read as off.
  fake.db.push_subscriptions = [];
  await page.reload();
  await expect(page.getByRole("button", { name: copy.push.turnOn })).toBeVisible();
  await page.getByRole("button", { name: copy.push.turnOn }).click();
  await expect(page.getByText(copy.push.on)).toBeVisible();
  await page.getByRole("button", { name: copy.settings.signOut }).click();
  await expect.poll(() => fake.db.push_subscriptions.length).toBe(0);
  await page.waitForURL((u) => u.pathname !== "/settings");
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
  await expect
    .poll(() => fake.notifyCalls)
    .toEqual([
      { kind: "session_started", ref: fake.db.focus_sessions[0].id },
      { kind: "key_request", ref: fake.db.end_requests[0].id },
    ]);
});

test("starting a session and ending it early wake the person's extensions on other computers", async ({ page, fake }) => {
  await page.clock.install();
  fake.seedUser();
  fake.db.blocklists = [{ user_id: "11111111-1111-4111-8111-111111111111", domains: ["youtube.com"] }];
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.focus, exact: true }).click();
  await page.getByRole("button", { name: copy.focus.minutes(25) }).click();
  await expect.poll(() => fake.notifyCalls).toEqual([{ kind: "session_started", ref: fake.db.focus_sessions[0].id }]);
  await page.getByRole("button", { name: copy.focus.endEarly }).click();
  for (let i = 0; i < 31; i++) await page.clock.runFor(1000); // the breathing pause counts down a second at a time
  await page.getByLabel(copy.earlyExitPrompt).fill("Done sooner");
  await page.getByRole("button", { name: copy.focus.endSession }).click();
  await expect.poll(() => fake.notifyCalls.map((c) => c.kind)).toEqual(["session_started", "session_ended"]);
  expect(fake.notifyCalls[1].ref).toBe(fake.db.focus_sessions[0].id);
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

test("reminder times are off by default, and saved in the person's own time zone", async ({ page, fake }) => {
  fake.seedUser();
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.settings }).click();
  const form = page.getByRole("form", { name: copy.push.remindTitle });
  await expect(form.getByLabel(copy.push.remindAt(copy.push.remindMorning))).toBeDisabled();
  await form.getByRole("checkbox", { name: copy.push.remindMorning }).check();
  await form.getByLabel(copy.push.remindAt(copy.push.remindMorning)).fill("07:15");
  await form.getByRole("checkbox", { name: copy.push.remindEvening }).check();
  await form.getByRole("button", { name: copy.push.remindSave }).click();
  await expect(form.getByText(copy.push.remindSaved)).toBeVisible();
  expect(fake.db.profiles[0].remind_morning).toBe("07:15");
  expect(fake.db.profiles[0].remind_evening).toBe("20:30");

  await form.getByRole("checkbox", { name: copy.push.remindMorning }).uncheck();
  await form.getByRole("button", { name: copy.push.remindSave }).click();
  await expect.poll(() => fake.db.profiles[0].remind_morning).toBeNull();
});
