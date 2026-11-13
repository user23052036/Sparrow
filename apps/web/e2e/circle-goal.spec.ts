import { copy } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

test("a circle starts a shared goal, sees one number, and can let it go", async ({ page, fake }) => {
  fake.seedUser();
  fake.giveCircle("Morning birds", ["Ravi", "Meera"]);
  await signIn(page, fake);
  await page.goto("/circle");
  const panel = page.getByRole("region", { name: copy.circleGoal.title });
  await expect(panel.getByText(copy.circleGoal.intro)).toBeVisible();
  await expect(panel.getByLabel(copy.circleGoal.targetLabel)).toHaveAttribute("placeholder", "15");

  await panel.getByLabel(copy.circleGoal.targetLabel).fill("2");
  await expect(panel.getByText(copy.circleGoal.bad(3, 100))).toBeVisible();
  await expect(panel.getByRole("button", { name: copy.circleGoal.start })).toBeDisabled();
  await panel.getByLabel(copy.circleGoal.targetLabel).fill("12");
  await panel.getByRole("button", { name: copy.circleGoal.start }).click();

  await expect(panel.getByText(copy.circleGoal.open(0, 12, 7))).toBeVisible();
  await expect(panel.getByRole("progressbar", { name: copy.circleGoal.barLabel(0, 12) })).toBeVisible();
  await expect(panel.getByRole("button", { name: copy.circleGoal.start })).toHaveCount(0);
  // one number only: nobody's name appears inside the goal
  await expect(panel).not.toContainText("Ravi");
  await expect(panel).not.toContainText("Meera");

  await panel.getByRole("button", { name: copy.circleGoal.letGo }).click();
  await expect(panel.getByText(copy.circleGoal.letGoConfirm)).toBeVisible();
  await panel.getByRole("button", { name: copy.circleGoal.keep }).click();
  await expect(panel.getByText(copy.circleGoal.open(0, 12, 7))).toBeVisible();
  await panel.getByRole("button", { name: copy.circleGoal.letGo }).click();
  await panel.getByRole("button", { name: copy.circleGoal.yesLetGo }).click();
  await expect(panel.getByText(copy.circleGoal.letGoDone(0))).toBeVisible();
  await expect(panel.getByRole("button", { name: copy.circleGoal.startAnother })).toBeVisible();
});

test("a reached goal is celebrated together, and a goal that ran out is still kind", async ({ page, fake }) => {
  fake.seedUser();
  fake.giveCircle("Morning birds", ["Ravi"]);
  fake.circleGoal = { state: "open", target: 10, moved: 11, reached: true, let_go: false, ends_at: new Date(Date.now() + 2 * 86_400_000).toISOString() };
  await signIn(page, fake);
  await page.goto("/circle");
  const panel = page.getByRole("region", { name: copy.circleGoal.title });
  await expect(panel.locator('[data-goal="reached"]')).toHaveText(copy.circleGoal.reached(11, 10));
  await expect(panel.getByRole("progressbar")).toHaveAttribute("value", "100");

  fake.circleGoal = { state: "ended", target: 10, moved: 6, reached: false, let_go: false, ends_at: new Date(Date.now() - 86_400_000).toISOString() };
  await page.reload();
  await expect(panel.getByText(copy.circleGoal.ended(6, 10))).toBeVisible();
  await expect(panel.getByRole("button", { name: copy.circleGoal.startAnother })).toBeVisible();
  await expect(page.getByText(/failed|lazy|broken|wasted|behind/i)).toHaveCount(0);
});

test("a circle of one is asked to invite someone before a goal", async ({ page, fake }) => {
  fake.seedUser();
  fake.giveCircle("Morning birds", []);
  await signIn(page, fake);
  await page.goto("/circle");
  const panel = page.getByRole("region", { name: copy.circleGoal.title });
  await expect(panel.getByText(copy.circleGoal.needTwo)).toBeVisible();
  await expect(panel.getByRole("button", { name: copy.circleGoal.start })).toHaveCount(0);
});
