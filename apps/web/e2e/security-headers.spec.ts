import { copy } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

// T1.5. The suite runs `next start`, which sends real headers; the static export (GitHub Pages) carries
// the same policy in the <meta> tag checked below.

test("pages are sent with a content policy, no framing and a referrer policy", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["content-security-policy"]).toMatch(/connect-src [^;]*http:\/\/localhost:54321/); // the Supabase origin the app was built with
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-content-type-options"]).toBe("nosniff");
});

test("the page itself carries the policy, for hosts that cannot send headers", async ({ page }) => {
  await page.goto("/");
  const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(meta).toContain("default-src 'self'");
  expect(meta).toMatch(/connect-src [^;]*http:\/\/localhost:54321/);
  expect(meta).not.toContain("frame-ancestors"); // ignored inside <meta>; the export guards against frames itself
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "strict-origin-when-cross-origin");
});

test("nothing the app does is blocked by its own policy", async ({ page, fake }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  fake.seedUser({ tasks: ["Write"] });
  await signIn(page, fake);
  for (const name of [copy.nav.tasks, copy.nav.focus, copy.nav.partner, copy.nav.circle, copy.nav.progress, copy.nav.settings, copy.nav.today]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(violations).toEqual([]);
});
