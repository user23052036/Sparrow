import { copy, FOCUS_LINK_MAX, parseFocusLinkKey } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

test("make a focus link, see it once, and open it without being signed in", async ({ page, fake, context }) => {
  fake.seedUser();
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.focus }).click();
  const panel = page.getByRole("region", { name: copy.focusLinks.title });
  await expect(panel.getByText(copy.focusLinks.empty)).toBeVisible();
  await expect(panel.getByText(copy.focusLinks.limits)).toBeVisible();

  await panel.getByLabel(copy.focusLinks.nameLabel).fill("  Desk   tag ");
  await panel.getByLabel(copy.focusLinks.minutesLabel).fill("40");
  await panel.getByRole("button", { name: copy.focusLinks.create }).click();

  await expect(panel.getByText(copy.focusLinks.newTitle("Desk tag"))).toBeVisible();
  await expect(panel.getByText(copy.focusLinks.newOnce)).toBeVisible();
  const url = await panel.getByLabel(copy.focusLinks.linkLabel).inputValue();
  const key = parseFocusLinkKey(url);
  expect(key).not.toBeNull();
  expect(url).toMatch(/\/go#spt_[0-9a-f]{64}$/);
  expect(new URL(url).search).toBe(""); // the key never travels in the query string

  // the single web request, for automation apps
  await panel.getByText(copy.focusLinks.requestTitle).click();
  const request = await panel.getByLabel(copy.focusLinks.requestLabel).inputValue();
  expect(request).toContain("/rest/v1/rpc/use_focus_link");
  expect(request).toContain("apikey: test-anon-key");
  expect(request).toContain(key!);

  const row = panel.getByRole("listitem", { name: "Desk tag" });
  await expect(row.getByText(copy.focusLinks.row(40))).toBeVisible();
  await expect(row.getByText(copy.focusLinks.used(0, null))).toBeVisible();

  // once dismissed, the key is gone from the page for good
  await panel.getByRole("button", { name: copy.focusLinks.done }).click();
  await expect(panel.getByLabel(copy.focusLinks.linkLabel)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: copy.focusLinks.title }).getByRole("listitem", { name: "Desk tag" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(key!);

  // a different browser with no session: the link alone starts the session
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  fake.signedIn = false;
  await page.goto(url);
  await expect(page.locator('[data-go="started"]')).toBeVisible();
  await expect(page.getByText(copy.go.started(40))).toBeVisible();
  expect(fake.linkSession?.minutes).toBe(40);
  expect(fake.db.focus_links[0].use_count).toBe(1);

  // opening it again starts no second session
  await page.reload();
  await expect(page.locator('[data-go="running"]')).toBeVisible();
  await expect(page.getByText(copy.go.running)).toBeVisible();
  expect(fake.db.focus_links[0].use_count).toBe(1);
});

test("a removed, unknown or keyless link starts nothing and says so kindly", async ({ page, fake }) => {
  fake.seedUser();
  await page.goto("/go#spt_" + "a".repeat(64));
  await expect(page.locator('[data-go="invalid"]')).toBeVisible();
  await expect(page.getByText(copy.go.invalid)).toBeVisible();
  expect(fake.linkSession).toBeNull();

  await page.goto("/go");
  await expect(page.getByText(copy.go.noKey)).toBeVisible();
  await page.goto("/go#not-a-key");
  await page.reload();
  await expect(page.getByText(copy.go.noKey)).toBeVisible();
  expect(fake.requests.filter((r) => r.includes("use_focus_link"))).toHaveLength(1);
  await expect(page.getByText(/failed|lazy|broken|wasted/i)).toHaveCount(0);
});

test("a link can be removed after a confirmation, and five is the most", async ({ page, fake }) => {
  fake.seedUser();
  for (let i = 1; i <= FOCUS_LINK_MAX; i++)
    fake.db.focus_links.push({
      id: `link-${i}`,
      label: `Link ${i}`,
      minutes: 25,
      created_at: `2026-11-0${i}T10:00:00Z`,
      last_used_at: i === 1 ? "2026-11-08T10:00:00Z" : null,
      use_count: i === 1 ? 3 : 0,
    });
  await signIn(page, fake);
  await page.goto("/focus");
  const panel = page.getByRole("region", { name: copy.focusLinks.title });
  await expect(panel.getByRole("listitem")).toHaveCount(FOCUS_LINK_MAX);
  await expect(panel.getByText(copy.focusLinks.full(FOCUS_LINK_MAX))).toBeVisible();
  await expect(panel.getByRole("button", { name: copy.focusLinks.create })).toHaveCount(0);
  await expect(panel.getByRole("listitem", { name: "Link 1" })).toContainText("Used 3 times");

  const row = panel.getByRole("listitem", { name: "Link 2" });
  await row.getByRole("button", { name: copy.focusLinks.remove("Link 2") }).click();
  await expect(row.getByText(copy.focusLinks.removeConfirm("Link 2"))).toBeVisible();
  await row.getByRole("button", { name: copy.focusLinks.keep }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(FOCUS_LINK_MAX);

  await row.getByRole("button", { name: copy.focusLinks.remove("Link 2") }).click();
  await row.getByRole("button", { name: copy.focusLinks.yesRemove }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(FOCUS_LINK_MAX - 1);
  await expect(panel.getByRole("button", { name: copy.focusLinks.create })).toBeVisible();
  expect(fake.db.focus_links.map((l) => l.label)).not.toContain("Link 2");
});
