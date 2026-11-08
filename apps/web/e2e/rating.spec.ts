import { copy } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

test("my rating is private until I choose to share it", async ({ page, fake }) => {
  fake.seedUser();
  await signIn(page, fake);
  await page.goto("/progress");
  const card = page.getByTestId("rating-card");
  await expect(card.getByText("3 / 5")).toBeVisible();
  await expect(card.getByText("2 / 5")).toBeVisible();
  await expect(card.getByText(copy.rating.sharedOff)).toBeVisible();
  await card.getByLabel(copy.rating.shareLabel).check();
  await expect(card.getByText(copy.rating.sharedOn)).toBeVisible();
  expect(fake.rating.shared).toBe(true);
  await card.getByLabel(copy.rating.shareLabel).uncheck();
  await expect(card.getByText(copy.rating.sharedOff)).toBeVisible();
});

test("too few days shows what is needed, not a low score", async ({ page, fake }) => {
  fake.seedUser();
  fake.rating = { reliability: null, support: null, days_counted: 3, days_needed: 7, shared: false };
  await signIn(page, fake);
  await page.goto("/progress");
  await expect(page.getByText(copy.rating.notEnough(3, 7))).toBeVisible();
  await expect(page.getByText(copy.rating.noPartner)).toBeVisible();
});

test("a partner's rating shows only when they shared it", async ({ page, fake }) => {
  fake.seedUser();
  fake.givePartner("Ravi");
  await signIn(page, fake);
  await page.goto("/partner");
  await expect(page.getByText(copy.rating.partnerHidden)).toBeVisible();
  fake.partnerRating = { shared: true, name: "Ravi", reliability: 4, support: 3.5, days_counted: 10, days_needed: 7 };
  await page.reload();
  const card = page.getByTestId("partner-rating");
  await expect(card.getByText(copy.rating.partnerTitle("Ravi"))).toBeVisible();
  await expect(card.getByText("4 / 5")).toBeVisible();
  await expect(card.getByText("3.5 / 5")).toBeVisible();
});

test("the leaderboard is opt-in with a handle, and can be left", async ({ page, fake }) => {
  fake.seedUser();
  await signIn(page, fake);
  await page.goto("/progress");
  const lb = page.getByTestId("leaderboard");
  await expect(lb.getByText(copy.leaderboard.intro)).toBeVisible();
  await lb.getByLabel(copy.leaderboard.handleLabel).fill("a b");
  await lb.getByRole("button", { name: copy.leaderboard.join }).click();
  await expect(lb.getByText(copy.leaderboard.invalid)).toBeVisible();
  await lb.getByLabel(copy.leaderboard.handleLabel).fill("quiet_owl");
  await lb.getByRole("button", { name: copy.leaderboard.join }).click();
  await expect(lb.getByText(copy.leaderboard.waiting(3, 10))).toBeVisible();
  await lb.getByRole("button", { name: copy.leaderboard.leave }).click();
  await expect(lb.getByRole("button", { name: copy.leaderboard.join })).toBeVisible();
});

test("a ready board shows a band, handles only, and no real names", async ({ page, fake }) => {
  fake.seedUser();
  fake.leaderboard = {
    state: "ready",
    participants: 14,
    band: "top_half",
    my_days: 5,
    handle: "quiet_owl",
    top: [
      { rank: 1, handle: "sun_fox", days: 20, me: false },
      { rank: 2, handle: "quiet_owl", days: 5, me: true },
    ],
  };
  await signIn(page, fake);
  await page.goto("/progress");
  const lb = page.getByTestId("leaderboard");
  await expect(lb.getByText(copy.leaderboard.band.top_half)).toBeVisible();
  await expect(lb.getByText(/sun_fox/)).toBeVisible();
  await expect(lb.getByText(/quiet_owl \(you\)/)).toBeVisible();
});
