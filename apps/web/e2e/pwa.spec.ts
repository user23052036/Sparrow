import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("the manifest is installable: name, standalone display, PNG icons including maskable", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.name).toBeTruthy();
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBeTruthy();
  const sizes = m.icons.map((i: { sizes: string; type: string; purpose?: string }) => `${i.sizes}:${i.type}:${i.purpose ?? "any"}`);
  expect(sizes).toContain("192x192:image/png:any");
  expect(sizes).toContain("512x512:image/png:any");
  expect(sizes.some((s: string) => s.endsWith("maskable"))).toBe(true);
  for (const i of m.icons) expect((await request.get(i.src)).ok()).toBe(true);
});

test("offline, a page load shows the calm offline page instead of a browser error", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Wait until the worker controls the page, then cut the network.
  await page
    .waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 15_000 })
    .catch(async () => {
      await page.reload();
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    });
  await context.setOffline(true);
  await page.goto("/today").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "You're offline for now" })).toBeVisible();
});

test("the service worker never caches pages or cross-origin data", async ({ request }) => {
  const sw = await (await request.get("/sw.js")).text();
  expect(sw).toContain("url.origin !== self.location.origin");
  expect(sw.match(/cache\.put\(/g)).toHaveLength(1); // only the fingerprinted static assets are ever stored
  expect(sw).toContain('url.pathname.startsWith("/_next/static/")');
});
