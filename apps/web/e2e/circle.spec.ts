import { copy } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

test("start a circle, see the invite link, and leave it", async ({ page, fake }) => {
  fake.seedUser();
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.circle }).click();
  await expect(page.getByText(copy.circle.intro)).toBeVisible();
  await page.getByLabel(copy.circle.nameLabel).fill("Morning birds");
  await page.getByRole("button", { name: copy.circle.create }).click();

  await expect(page.getByRole("heading", { name: "Morning birds" })).toBeVisible();
  await expect(page.getByText(copy.circle.size(1, 4))).toBeVisible();
  await expect(page.getByText(copy.circle.inviteBody(3))).toBeVisible();
  await expect(page.getByLabel(copy.circle.inviteLinkLabel)).toHaveValue(/\/circle\/join\?code=0123456789abcdef$/);

  await page.getByRole("button", { name: copy.circle.leave }).click();
  await page.getByRole("button", { name: copy.circle.yesLeave }).click();
  await expect(page.getByRole("button", { name: copy.circle.create })).toBeVisible();
});

test("members show counts only, can be cheered once, and sharing can be switched off", async ({ page, fake }) => {
  fake.seedUser();
  fake.giveCircle("Morning birds", ["Ravi", "Meera", "Ali"]);
  await signIn(page, fake);
  await page.goto("/circle");
  const ravi = page.getByRole("listitem", { name: "Ravi" });
  await expect(ravi.getByText(copy.circle.dayLine(2, 3, false))).toBeVisible();
  await expect(ravi.getByText(copy.circle.focusLine(25))).toBeVisible();
  await expect(page.getByText(copy.circle.full)).toBeVisible();

  await ravi.getByRole("button", { name: copy.circle.cheer("Ravi") }).click();
  await expect(ravi.getByText(copy.circle.cheered)).toBeVisible();
  expect(fake.cheers).toEqual(["Ravi"]);

  await page.getByLabel(copy.circle.shareLabel).click();
  await expect(page.getByLabel(copy.circle.shareLabel)).not.toBeChecked();
  expect(fake.circle.i_share).toBe(false);
});

test("a circle link opens the join screen, also after signing in", async ({ page, fake }) => {
  fake.seedUser();
  await page.goto("/circle/join?code=0123456789abcdef");
  await page.waitForURL("**/login");
  await page.getByLabel("Email").fill(fake.email);
  await page.getByLabel("Password").fill(fake.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(copy.circleJoin.wouldLike("Morning birds", 2))).toBeVisible();
  await page.getByRole("button", { name: copy.circleJoin.join }).click();
  await page.waitForURL("**/circle");
  await expect(page.getByRole("heading", { name: "Morning birds" })).toBeVisible();
});

test("a full circle explains itself kindly", async ({ page, fake }) => {
  fake.seedUser();
  fake.circlePreview = { valid: false, reason: "This circle is full (four people)." };
  await signIn(page, fake);
  await page.goto("/circle/join?code=0123456789abcdef");
  await expect(page.getByText("This circle is full (four people).")).toBeVisible();
  await expect(page.getByRole("button", { name: copy.circleJoin.join })).toHaveCount(0);
});
