import { describe, expect, it } from "vitest";
import { isValidPackageName, MAX_ANDROID_PACKAGES, normalizePackageList } from "./blocklist";

describe("android package names", () => {
  it.each(["com.instagram.android", "org.telegram.messenger", "a.b"])("accepts %s", (p) => expect(isValidPackageName(p)).toBe(true));
  it.each(["", "instagram", "com..x", "1com.x", "com.x y", "com/x"])("rejects %j", (p) => expect(isValidPackageName(p)).toBe(false));
});

describe("normalizePackageList", () => {
  it("trims, drops invalid and duplicates (any case)", () =>
    expect(normalizePackageList([" com.a.b ", "COM.A.B", "nope", "com.c.d"])).toEqual(["com.a.b", "com.c.d"]));
  it("never lets the dialer, messages, emergency or Sparrow be blocked", () =>
    expect(normalizePackageList(["com.sparrow.app", "com.google.android.dialer", "com.android.emergency", "com.x.y"])).toEqual(["com.x.y"]));
  it("caps the list", () =>
    expect(normalizePackageList(Array.from({ length: 400 }, (_, i) => `com.app.n${i}`))).toHaveLength(MAX_ANDROID_PACKAGES));
});
