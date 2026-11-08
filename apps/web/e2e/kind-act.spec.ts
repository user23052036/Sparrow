import { copy, KIND_ACT_POINTS } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

async function closeDay(page: import("@playwright/test").Page, outcomes: Record<string, "done" | "missed">) {
  for (const name of Object.keys(outcomes)) await page.getByLabel(name).check();
  await page.getByRole("button", { name: copy.today.commit }).click();
  await page.getByRole("button", { name: copy.today.reviewMyDay }).click();
  for (const [name, o] of Object.entries(outcomes))
    await page
      .getByRole("group", { name })
      .getByRole("button", { name: o === "done" ? copy.today.reviewOptions.done : copy.today.reviewOptions.missed })
      .click();
  await page.getByRole("button", { name: copy.today.finishDay }).click();
  await expect(page.getByRole("heading", { name: copy.today.closedTitle })).toBeVisible();
}

test("after a day with something missed, one kind act is offered, counted once, and thanked", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Write", "Walk"] });
  await signIn(page, fake);
  await closeDay(page, { Write: "done", Walk: "missed" });

  await expect(page.getByRole("heading", { name: copy.today.kindTitle })).toBeVisible();
  await page.getByLabel(copy.today.kindLabel).fill("Texted my sister");
  const before = fake.points;
  await page.getByRole("button", { name: copy.today.kindBtn(KIND_ACT_POINTS) }).click();

  await expect(page.getByText(copy.today.kindThanks)).toBeVisible();
  await expect(page.getByRole("button", { name: copy.today.kindBtn(KIND_ACT_POINTS) })).toHaveCount(0);
  expect(fake.points - before).toBe(KIND_ACT_POINTS);
  expect(fake.db.kind_acts).toHaveLength(1);
  expect(fake.db.kind_acts[0].note).toBe("Texted my sister");

  // still thanked, and not offered again, after a reload
  await page.reload();
  await expect(page.getByText(copy.today.kindThanks)).toBeVisible();
  await expect(page.getByRole("heading", { name: copy.today.kindTitle })).toHaveCount(0);
  expect(fake.db.kind_acts).toHaveLength(1);
});

test("a day with everything done is not offered a kind act", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Write"] });
  await signIn(page, fake);
  await closeDay(page, { Write: "done" });
  await expect(page.getByRole("heading", { name: copy.today.kindTitle })).toHaveCount(0);
});
