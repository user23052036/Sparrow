import { readFileSync } from "node:fs";
import { join } from "node:path";
import { copy } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";
import { noisyPng } from "./png";

/** A small real JPEG whose EXIF says it was taken on 2020-01-01 10:00:00. */
const OLD_PHOTO = readFileSync(join(__dirname, "files", "photo-2020.jpg"));

/** The same photo with its EXIF dates rewritten to a moment ago. */
function freshPhoto(): Buffer {
  const d = new Date(Date.now() - 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return Buffer.from(OLD_PHOTO.toString("latin1").replaceAll("2020:01:01 10:00:00", stamp), "latin1");
}

async function openPhotoProof(page: import("@playwright/test").Page) {
  await page.getByLabel("Tidy desk").check();
  await page.getByRole("button", { name: copy.today.commit }).click();
  await page.getByRole("button", { name: copy.today.done, exact: true }).first().click();
  await page.getByRole("button", { name: copy.proof.addPhoto }).click();
}

test("a photo taken on an earlier day is saved with a gentle note", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Tidy desk"] });
  await signIn(page, fake);
  await openPhotoProof(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "old.jpg", mimeType: "image/jpeg", buffer: OLD_PHOTO });

  await expect(page.getByText(copy.proof.olderPhoto)).toBeVisible();
  expect(fake.db.proofs).toHaveLength(1);
  expect(Number(fake.db.proofs[0].photo_age_hours)).toBeGreaterThan(24 * 365);
});

test("a photo taken just now is saved without a note, and its age is reported", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Tidy desk"] });
  await signIn(page, fake);
  await openPhotoProof(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "new.jpg", mimeType: "image/jpeg", buffer: freshPhoto() });

  await expect(page.getByText(copy.proof.photoSaved, { exact: true })).toBeVisible();
  expect(fake.db.proofs[0].photo_age_hours).toBe(0);
});

test("a photo without a date reports no age at all", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Tidy desk"] });
  await signIn(page, fake);
  await openPhotoProof(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: noisyPng(64) });

  await expect(page.getByText(copy.proof.photoSaved, { exact: true })).toBeVisible();
  expect("photo_age_hours" in fake.db.proofs[0]).toBe(false);
});

test("the partner sees plain notes about a shared proof, and that they are not a verdict", async ({ page, fake }) => {
  fake.seedUser();
  fake.givePartner("Ravi");
  fake.partnerOverview.proofs = [
    {
      id: "p1",
      kind: "photo",
      text: null,
      path: "22222222-0000-4000-8000-000000000000/a.jpg",
      flagged: false,
      created_at: new Date().toISOString(),
      task: "Walk",
      verdict: null,
      comment: null,
    },
    {
      id: "p2",
      kind: "text",
      text: "Read ten pages",
      path: null,
      flagged: false,
      created_at: new Date().toISOString(),
      task: "Read",
      verdict: null,
      comment: null,
    },
  ];
  fake.proofContexts = {
    p1: { kind: "photo", days_after: 2, soon_after_planning: false, similar_photo: false, photo_age: "older" },
    p2: { kind: "text", days_after: 0, soon_after_planning: true, similar_photo: false, photo_age: null },
  };
  await signIn(page, fake);
  await page.goto("/partner");

  const walk = page.getByRole("listitem").filter({ hasText: "Walk" });
  await walk.getByText(copy.proofContext.title).click();
  await expect(walk.getByText(copy.proofContext.later(2))).toBeVisible();
  await expect(walk.getByText(copy.proofContext.photoOlder)).toBeVisible();
  await expect(walk.getByText(copy.proofContext.about)).toBeVisible();

  const read = page.getByRole("listitem").filter({ hasText: "Read ten pages" });
  await read.getByText(copy.proofContext.title).click();
  await expect(read.getByText(copy.proofContext.sameDay)).toBeVisible();
  await expect(read.getByText(copy.proofContext.soon)).toBeVisible();
  await expect(read.getByText(copy.proofContext.photoOlder)).toHaveCount(0);
});

test("a proof without context simply shows no notes", async ({ page, fake }) => {
  fake.seedUser();
  fake.givePartner("Ravi");
  fake.partnerOverview.proofs = [
    {
      id: "gone",
      kind: "text",
      text: "Read ten pages",
      path: null,
      flagged: false,
      created_at: new Date().toISOString(),
      task: "Read",
      verdict: null,
      comment: null,
    },
  ];
  await signIn(page, fake);
  await page.goto("/partner");
  await expect(page.getByText("Read ten pages")).toBeVisible();
  await expect(page.getByText(copy.proofContext.title)).toHaveCount(0);
});
