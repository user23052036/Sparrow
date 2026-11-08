import { defineConfig, devices } from "@playwright/test";

// The web app is built against a Supabase URL that nothing listens on; the tests answer every
// request in the browser with e2e/fake-supabase.ts. Run: npm run test:e2e
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { ...devices["Pixel 7"], baseURL: "http://localhost:3000", serviceWorkers: "block", locale: "en-US", trace: "retain-on-failure" },
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
