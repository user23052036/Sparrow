import { copy, MAX_VOICE_BYTES } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

// Chromium's fake microphone: no real device and no permission prompt.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["microphone"],
});

test("a short voice note is recorded, uploaded privately and saved as proof", async ({ page, fake }) => {
  fake.seedUser({ tasks: ["Walk"] });
  await signIn(page, fake);
  await page.getByLabel("Walk").check();
  await page.getByRole("button", { name: copy.today.commit }).click();
  await page.getByRole("button", { name: copy.today.done, exact: true }).first().click();
  await page.getByRole("button", { name: copy.proof.recordVoice }).click();
  await page.getByRole("button", { name: copy.proof.startRecording }).click();
  await expect(page.getByText(copy.proof.recording("0:01"))).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: copy.proof.stopRecording }).click();

  await expect(page.getByText(copy.today.proofsSaved(1))).toBeVisible();
  expect(fake.uploads).toHaveLength(1);
  expect(fake.uploads[0].path).toMatch(/^proofs\/11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\.(webm|ogg|m4a)$/);
  expect(fake.uploads[0].type).toMatch(/^audio\/(webm|ogg|mp4)$/);
  expect(fake.uploads[0].bytes).toBeGreaterThan(0);
  expect(fake.uploads[0].bytes).toBeLessThan(MAX_VOICE_BYTES);
  expect(fake.db.proofs[0]).toMatchObject({ kind: "voice", visibility: "private" });
  expect(Number(fake.db.proofs[0].duration_s)).toBeGreaterThanOrEqual(1);
});

test("a partner's shared voice note plays on the Partner page", async ({ page, fake }) => {
  fake.seedUser();
  fake.givePartner("Ravi");
  fake.partnerOverview.proofs = [
    {
      id: "p1",
      kind: "voice",
      text: null,
      path: "22222222-0000-4000-8000-000000000000/a.webm",
      flagged: false,
      created_at: new Date().toISOString(),
      task: "Walk",
      verdict: null,
      comment: null,
    },
  ];
  await signIn(page, fake);
  await page.goto("/partner");
  await expect(page.getByLabel("Voice note for Walk")).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/proofs\/.+token=fake/);
});
