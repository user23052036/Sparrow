import { test } from "@playwright/test";
import { smokeFlow } from "./flow";

// Runs against the REAL Supabase project (ROADMAP T0.4), never the fake. One throwaway account walks
// the four flows that matter and deletes itself at the end, so nothing is left behind.
// Needs "Confirm email" off in Supabase (D14) so sign-up returns a session straight away.

const domain = process.env.SMOKE_EMAIL_DOMAIN || "example.com";
const email = `sparrow-smoke+${Date.now()}@${domain}`;
const password = `smoke-${Math.random().toString(36).slice(2)}-${Date.now()}`;

test.setTimeout(180_000);

test("sign up, commit a day, start and stop a focus session, delete the account", async ({ page }) => {
  await smokeFlow(page, { email, password });
});
