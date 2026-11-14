import { smokeFlow } from "../e2e-live/flow";
import { test } from "./fixtures";

// The live smoke test's steps (e2e-live/flow.ts) against the fake, so they keep matching the app.
test("the live smoke flow runs end to end against the fake backend", async ({ page, fake }) => {
  test.setTimeout(90_000); // the early-exit pause is 30 seconds on purpose
  void fake;
  await smokeFlow(page, { email: "smoke@example.com", password: "a-long-password" });
});
