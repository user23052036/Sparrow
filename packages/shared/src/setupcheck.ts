/**
 * "Check my setup" on the phone (ROADMAP T3.3): the device checklist in docs/BETA.md, run on the phone itself.
 * Pure, so the rules are tested here; the Android app gathers the facts and shows the result with copy.setupCheck.
 */

/** pass: done. notYet: something to do. byHand: Sparrow can't tell, the person checks. optional: fine either way. */
export type SetupState = "pass" | "notYet" | "byHand" | "optional";

export type SetupLineId =
  | "build"
  | "account"
  | "access"
  | "engine"
  | "checkedIn"
  | "battery"
  | "autostart"
  | "apps"
  | "server"
  | "notifications"
  | "testReach"
  | "testBlock"
  | "swipedAway"
  | "web";

export interface SetupLine {
  id: SetupLineId;
  state: SetupState;
}

export interface SetupFacts {
  now: number;
  /** The build has Sparrow's native blocking module (not Expo Go). */
  nativeBuild: boolean;
  /** The app reached the person's account just now. */
  accountOk: boolean;
  accessibilityOn: boolean;
  /** The engine has its own device credential and the server hasn't refused it. */
  engineConfigured: boolean;
  engineSignedOut: boolean;
  /** When the engine last checked in, on the phone's clock (0: never). */
  lastSyncMs: number;
  batteryOk: boolean;
  /** Phones known to stop background apps unless "autostart" is allowed. */
  autostartBrand: boolean;
  listedApps: number;
  /** The server's own record of this phone: last heartbeat (ms) and whether blocking was on. */
  server: { lastHeartbeatMs: number; protection: boolean } | null;
  notificationsOn: boolean;
  /** The live test: when it started (null: not run), whether the session reached the engine, and when a listed app was last covered. */
  test: { startedMs: number | null; reachedPhone: boolean; lastCoverMs: number };
  web: { enabled: boolean; allowed: boolean };
}

/** Brands known to stop background apps unless "autostart" is allowed (dontkillmyapp.com). */
export const AUTOSTART_BRANDS = ["xiaomi", "redmi", "poco", "oppo", "realme", "oneplus", "vivo", "iqoo", "huawei", "honor", "samsung"] as const;

export function isAutostartBrand(manufacturer: string): boolean {
  const m = manufacturer.toLowerCase();
  return AUTOSTART_BRANDS.some((b) => m.includes(b));
}

/** The engine checks in every 30 s while the screen is on; two minutes leaves room for a slow network. */
export const SETUP_FRESH_MS = 2 * 60 * 1000;

export function setupLines(f: SetupFacts): SetupLine[] {
  const fresh = (ms: number) => ms > 0 && f.now - ms <= SETUP_FRESH_MS;
  const is = (ok: boolean): SetupState => (ok ? "pass" : "notYet");
  const tested = f.test.startedMs !== null;
  return [
    { id: "build", state: is(f.nativeBuild) },
    { id: "account", state: is(f.accountOk) },
    { id: "access", state: is(f.accessibilityOn) },
    { id: "engine", state: is(f.engineConfigured && !f.engineSignedOut) },
    { id: "checkedIn", state: is(fresh(f.lastSyncMs)) },
    { id: "battery", state: is(f.batteryOk) },
    { id: "autostart", state: f.autostartBrand ? "byHand" : "optional" },
    { id: "apps", state: is(f.listedApps > 0) },
    { id: "server", state: is(f.server !== null && f.server.protection && fresh(f.server.lastHeartbeatMs)) },
    { id: "notifications", state: f.notificationsOn ? "pass" : "optional" },
    { id: "testReach", state: is(tested && f.test.reachedPhone) },
    { id: "testBlock", state: is(tested && f.test.startedMs !== null && f.test.lastCoverMs >= f.test.startedMs) },
    { id: "swipedAway", state: "byHand" },
    { id: "web", state: f.web.enabled && f.web.allowed ? "pass" : "optional" },
  ];
}

/** Ready for a real session when nothing on the list is "not yet". */
export function setupReady(lines: SetupLine[]): boolean {
  return lines.every((l) => l.state !== "notYet");
}
