import { defineConfig, devices } from "@playwright/test";

// The live smoke test (e2e-live/, ROADMAP T0.4) talks to the REAL Supabase project.
// By default it builds and starts the app locally with the project's public URL and anon key;
// LIVE_BASE_URL (ending in "/") points it at a deployed site instead. Run: npm run test:live
const deployed = process.env.LIVE_BASE_URL;

export default defineConfig({
  testDir: "e2e-live",
  testMatch: "**/*.spec.ts",
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { ...devices["Pixel 7"], baseURL: deployed ?? "http://localhost:3000/", serviceWorkers: "block", locale: "en-US", trace: "retain-on-failure" },
  webServer: deployed
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: false,
        timeout: 240_000,
        env: { NEXT_TELEMETRY_DISABLED: "1" },
      },
});
