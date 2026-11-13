import { copy, CRAFTED_KEYS } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

test("badges that fit together can be crafted, and the ingredients stay", async ({ page, fake }) => {
  fake.seedUser();
  fake.progress = { badges: ["first_plan", "first_proof", "first_focus"], best_run: 1, helping_days: 0, kind_acts: 0, mood: [] };
  await signIn(page, fake);
  await page.goto("/progress");

  await expect(page.getByRole("heading", { name: copy.craft.title })).toBeVisible();
  await expect(page.getByText(copy.craft.count(0, CRAFTED_KEYS.length), { exact: false })).toBeVisible();
  const honest = page.locator('[data-craft="honest_work"]');
  const steady = page.locator('[data-craft="steady_hands"]');
  await expect(honest).toHaveAttribute("data-state", "ready");
  await expect(steady).toHaveAttribute("data-state", "waiting");
  await expect(steady.locator('[data-part="first_plan"]')).toHaveAttribute("data-held", "true");
  await expect(steady.locator('[data-part="run_3"]')).toHaveAttribute("data-held", "false");
  await expect(steady.getByRole("button")).toHaveCount(0);

  await honest.getByRole("button", { name: copy.craft.craft(copy.craft.badges.honest_work.name) }).click();
  await expect(page.getByText(copy.craft.justCrafted(copy.craft.badges.honest_work.name))).toBeVisible();
  await expect(honest).toHaveAttribute("data-state", "crafted");
  await expect(honest.getByText(copy.craft.crafted, { exact: true })).toBeVisible();
  await expect(page.getByText(copy.craft.count(1, CRAFTED_KEYS.length), { exact: false })).toBeVisible();
  expect(fake.crafted).toEqual(["honest_work"]);

  // nothing was used up: the earned badges are still shown as earned
  await expect(page.locator('[data-badge="first_proof"]')).toHaveAttribute("data-earned", "true");
  await expect(page.locator('[data-badge="first_focus"]')).toHaveAttribute("data-earned", "true");
  // and the crafted badge now counts as an ingredient of the collection badge
  await expect(page.locator('[data-craft="full_nest"] [data-part="honest_work"]')).toHaveAttribute("data-held", "true");

  await page.reload();
  await expect(page.locator('[data-craft="honest_work"]')).toHaveAttribute("data-state", "crafted");
  await expect(page.getByText(/failed|lazy|broken|wasted/i)).toHaveCount(0);
});

test("the last badge needs the other three crafted first", async ({ page, fake }) => {
  fake.seedUser();
  fake.progress = {
    badges: ["first_plan", "first_full_day", "run_3", "run_7", "first_proof", "first_focus", "first_kind_act", "helped_partner"],
    best_run: 7,
    helping_days: 1,
    kind_acts: 1,
    mood: [],
  };
  fake.crafted = ["steady_hands", "honest_work"];
  await signIn(page, fake);
  await page.goto("/progress");
  const nest = page.locator('[data-craft="full_nest"]');
  await expect(nest).toHaveAttribute("data-state", "waiting");
  await page
    .locator('[data-craft="warm_heart"]')
    .getByRole("button", { name: copy.craft.craft(copy.craft.badges.warm_heart.name) })
    .click();
  await expect(nest).toHaveAttribute("data-state", "ready");
  await nest.getByRole("button", { name: copy.craft.craft(copy.craft.badges.full_nest.name) }).click();
  await expect(page.getByText(copy.craft.count(4, CRAFTED_KEYS.length), { exact: false })).toBeVisible();
});
