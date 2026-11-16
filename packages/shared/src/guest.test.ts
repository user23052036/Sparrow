import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GUEST_KEY_PATTERN, GUEST_NAME_MAX, guestKeyUrl, normalizeGuestName, parseGuestKey } from "./guest";

const KEY = "spg_" + "0123456789abcdef".repeat(4);

describe("guest key links", () => {
  it("builds a link with the key after the #, and reads it back", () => {
    const url = guestKeyUrl("https://owner.github.io/Sparrow/", KEY);
    expect(url).toBe(`https://owner.github.io/Sparrow/key#${KEY}`);
    expect(new URL(url).search).toBe("");
    expect(parseGuestKey(url)).toBe(KEY);
    expect(parseGuestKey(`#${KEY}`)).toBe(KEY);
    expect(parseGuestKey(`  ${KEY}\n`)).toBe(KEY);
  });
  it("refuses anything that isn't a whole guest key", () => {
    const focusKey = "spt_" + "0".repeat(64);
    for (const bad of ["", null, undefined, "spg_123", KEY.slice(0, -1), KEY + "a", KEY.toUpperCase(), "#", focusKey]) expect(parseGuestKey(bad)).toBeNull();
  });
  it("tidies names and checks lengths like the database", () => {
    expect(normalizeGuestName("  Ravi   K ")).toBe("Ravi K");
    expect(normalizeGuestName("   ")).toBeNull();
    expect(normalizeGuestName("x".repeat(GUEST_NAME_MAX))).not.toBeNull();
    expect(normalizeGuestName("x".repeat(GUEST_NAME_MAX + 1))).toBeNull();
  });
  it("uses the same name limit and key shape as the migration", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0030_guest_partner.sql"), "utf8");
    expect(sql).toContain(`check (char_length(name) between 1 and ${GUEST_NAME_MAX})`);
    expect(sql).toContain(`char_length(nm) > ${GUEST_NAME_MAX}`);
    expect(sql).toContain(`p_key !~ '${GUEST_KEY_PATTERN.source}'`);
  });
});
