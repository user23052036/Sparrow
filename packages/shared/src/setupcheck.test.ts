import { describe, expect, it } from "vitest";
import { copy } from "./copy";
import { isAutostartBrand, SETUP_FRESH_MS, setupLines, setupReady, type SetupFacts } from "./setupcheck";

const NOW = 1_800_000_000_000;
const ready: SetupFacts = {
  now: NOW,
  nativeBuild: true,
  accountOk: true,
  accessibilityOn: true,
  engineConfigured: true,
  engineSignedOut: false,
  lastSyncMs: NOW - 20_000,
  batteryOk: true,
  autostartBrand: false,
  listedApps: 3,
  server: { lastHeartbeatMs: NOW - 20_000, protection: true },
  notificationsOn: true,
  test: { startedMs: NOW - 60_000, reachedPhone: true, lastCoverMs: NOW - 30_000 },
  web: { enabled: false, allowed: false },
};
const state = (f: SetupFacts, id: string) => setupLines(f).find((l) => l.id === id)?.state;

describe("check my setup", () => {
  it("a fully set-up phone passes everything Sparrow can check", () => {
    expect(setupReady(setupLines(ready))).toBe(true);
    expect(setupLines(ready).filter((l) => l.state === "notYet")).toEqual([]);
  });
  it("each missing piece shows as 'not yet' on its own line", () => {
    expect(state({ ...ready, accessibilityOn: false }, "access")).toBe("notYet");
    expect(state({ ...ready, engineSignedOut: true }, "engine")).toBe("notYet");
    expect(state({ ...ready, batteryOk: false }, "battery")).toBe("notYet");
    expect(state({ ...ready, listedApps: 0 }, "apps")).toBe("notYet");
    expect(state({ ...ready, nativeBuild: false }, "build")).toBe("notYet");
    expect(setupReady(setupLines({ ...ready, batteryOk: false }))).toBe(false);
  });
  it("a check-in older than two minutes, on the phone or the server, is not recent", () => {
    expect(state({ ...ready, lastSyncMs: NOW - SETUP_FRESH_MS - 1 }, "checkedIn")).toBe("notYet");
    expect(state({ ...ready, lastSyncMs: 0 }, "checkedIn")).toBe("notYet");
    expect(state({ ...ready, server: { lastHeartbeatMs: NOW - SETUP_FRESH_MS - 1, protection: true } }, "server")).toBe("notYet");
    expect(state({ ...ready, server: { lastHeartbeatMs: NOW, protection: false } }, "server")).toBe("notYet");
    expect(state({ ...ready, server: null }, "server")).toBe("notYet");
  });
  it("the live test passes only after it ran, and only for a cover after it started", () => {
    const notRun = { ...ready, test: { startedMs: null, reachedPhone: false, lastCoverMs: NOW } };
    expect(state(notRun, "testReach")).toBe("notYet");
    expect(state(notRun, "testBlock")).toBe("notYet");
    expect(state({ ...ready, test: { startedMs: NOW - 1000, reachedPhone: true, lastCoverMs: NOW - 5000 } }, "testBlock")).toBe("notYet");
  });
  it("what Sparrow can't see is for the person to check, and extras are optional", () => {
    expect(state(ready, "swipedAway")).toBe("byHand");
    expect(state({ ...ready, autostartBrand: true }, "autostart")).toBe("byHand");
    expect(state(ready, "autostart")).toBe("optional");
    expect(state({ ...ready, notificationsOn: false }, "notifications")).toBe("optional");
    expect(state(ready, "web")).toBe("optional");
    expect(state({ ...ready, web: { enabled: true, allowed: true } }, "web")).toBe("pass");
  });
  it("knows the phone makers that stop background apps", () => {
    expect(isAutostartBrand("Xiaomi")).toBe(true);
    expect(isAutostartBrand("samsung")).toBe(true);
    expect(isAutostartBrand("Google")).toBe(false);
    expect(isAutostartBrand("")).toBe(false);
  });
  it("every line has words in copy.setupCheck", () => {
    for (const l of setupLines(ready)) {
      expect(copy.setupCheck.lines[l.id].title).toBeTruthy();
      expect(copy.setupCheck.lines[l.id].todo).toBeTruthy();
    }
  });
});
