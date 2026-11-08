import { copy, MAX_PROOF_BYTES } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";
import { noisyPng } from "./png";

test("a large photo is compressed to at most 500 KB before it is uploaded", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Tidy desk"] });
  await signIn(page, fake);
  await page.getByLabel("Tidy desk").check();
  await page.getByRole("button", { name: copy.today.commit }).click();
  await page.getByRole("button", { name: copy.today.done, exact: true }).first().click();
  await page.getByRole("button", { name: copy.proof.addPhoto }).click();

  const original = noisyPng(2400); // ~17 MB of pixels that do not compress
  expect(original.length).toBeGreaterThan(5 * 1024 * 1024);
  await page.locator('input[type="file"]').setInputFiles({ name: "big.png", mimeType: "image/png", buffer: original });

  await expect(page.getByText(copy.today.proofsSaved(1))).toBeVisible();
  expect(fake.uploads).toHaveLength(1);
  expect(fake.uploads[0].bytes).toBeGreaterThan(0);
  expect(fake.uploads[0].bytes).toBeLessThanOrEqual(MAX_PROOF_BYTES);
  expect(fake.db.proofs).toHaveLength(1);
});

test("a note works as proof too", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Tidy desk"] });
  await signIn(page, fake);
  await page.getByLabel("Tidy desk").check();
  await page.getByRole("button", { name: copy.today.commit }).click();
  await page.getByRole("button", { name: copy.today.done, exact: true }).first().click();
  await page.getByRole("button", { name: copy.proof.writeNote }).click();
  await page.getByLabel(copy.proof.noteLabel).fill("Desk is clear");
  await page.getByRole("button", { name: copy.proof.saveNote }).click();
  await expect(page.getByText(copy.today.proofsSaved(1))).toBeVisible();
});

test("feedback is sent with the page and a helpfulness rating", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Write"] });
  await signIn(page, fake);
  await page.getByRole("button", { name: copy.feedback.open }).click();

  await page.getByRole("button", { name: copy.feedback.send }).click();
  await expect(page.locator("p[role=alert]")).toHaveText(copy.feedback.needText);

  await page.getByRole("radio", { name: copy.feedback.scale[3] }).click();
  await page.getByLabel(copy.feedback.messageLabel).fill("The light day option helped.");
  await page.getByRole("button", { name: copy.feedback.send }).click();

  await expect(page.getByText(copy.feedback.thanks)).toBeVisible();
  expect(fake.db.feedback).toHaveLength(1);
  expect(fake.db.feedback[0]).toMatchObject({ message: "The light day option helped.", helpful: 4, page: "/today" });
});

test("the privacy page is public and the footer links to it", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Write"] });
  await signIn(page, fake);
  await page.getByRole("link", { name: copy.nav.privacy }).click();
  await expect(page.getByRole("heading", { name: copy.privacy.title })).toBeVisible();
});

test("the landing page links to support without signing in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: copy.landing.title })).toBeVisible();
  await page.getByRole("link", { name: copy.landing.support }).click();
  await expect(page.getByRole("heading", { name: copy.helpTitle })).toBeVisible();
});
