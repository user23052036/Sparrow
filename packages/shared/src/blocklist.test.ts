import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { copy } from "./copy";
import { describe, expect, it } from "vitest";
import { ALWAYS_ALLOWED_PACKAGES, isValidPackageName, MAX_ANDROID_PACKAGES, normalizePackageList } from "./blocklist";

describe("android package names", () => {
  it.each(["com.instagram.android", "org.telegram.messenger", "a.b"])("accepts %s", (p) => expect(isValidPackageName(p)).toBe(true));
  it.each(["", "instagram", "com..x", "1com.x", "com.x y", "com/x"])("rejects %j", (p) => expect(isValidPackageName(p)).toBe(false));
});

describe("normalizePackageList", () => {
  it("trims, drops invalid and duplicates (any case)", () =>
    expect(normalizePackageList([" com.a.b ", "COM.A.B", "nope", "com.c.d"])).toEqual(["com.a.b", "com.c.d"]));
  it("never lets the dialer, messages, emergency or Sparrow be blocked", () =>
    expect(normalizePackageList(["com.sparrow.app", "com.google.android.dialer", "com.android.emergency", "com.x.y"])).toEqual(["com.x.y"]));
  it("caps the list", () => expect(normalizePackageList(Array.from({ length: 400 }, (_, i) => `com.app.n${i}`))).toHaveLength(MAX_ANDROID_PACKAGES));
});

// The Android engine keeps its own copy of the always-allowed list and the blocked-screen wording.

const ANDROID = resolve(__dirname, "../../../apps/mobile/modules/sparrow-blocker/android/src/main");
describe("Android engine stays in step with the shared rules", () => {
  it("has the same always-allowed apps", () => {
    const kt = readFileSync(`${ANDROID}/java/expo/modules/sparrowblocker/engine/BlockRules.kt`, "utf8");
    const block = /val ALWAYS_ALLOWED: Set<String> = setOf\(([\s\S]*?)\)/.exec(kt)?.[1] ?? "";
    const list = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect([...list].sort()).toEqual([...ALWAYS_ALLOWED_PACKAGES].sort());
  });
  it("shows the same calm words on the blocked screen", () => {
    const xml = readFileSync(`${ANDROID}/res/values/strings.xml`, "utf8");
    expect(xml).toContain(`>${copy.blockedTitle}<`);
    expect(xml).toContain(`>${copy.blockedBody}<`);
  });
  it("the accessibility service cannot read screen content", () => {
    const xml = readFileSync(`${ANDROID}/res/xml/sparrow_accessibility.xml`, "utf8");
    expect(xml).toContain('android:canRetrieveWindowContent="false"');
    expect(xml).toContain('android:accessibilityEventTypes="typeWindowStateChanged"');
  });
});
