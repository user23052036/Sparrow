import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FOCUS_LINK_DEFAULT_MINUTES,
  FOCUS_LINK_KEY_PATTERN,
  FOCUS_LINK_LABEL_MAX,
  FOCUS_LINK_MAX,
  FOCUS_LINK_MAX_MINUTES,
  FOCUS_LINK_MIN_MINUTES,
  focusLinkCurl,
  focusLinkRequest,
  focusLinkUrl,
  normalizeFocusLinkLabel,
  parseFocusLinkKey,
  validFocusLinkMinutes,
} from "./focuslink";

const KEY = "spt_" + "0123456789abcdef".repeat(4);

describe("focus links", () => {
  it("builds a link with the key after the #, and reads it back", () => {
    const url = focusLinkUrl("https://sparrow.app/", KEY);
    expect(url).toBe(`https://sparrow.app/go#${KEY}`);
    expect(new URL(url).search).toBe("");
    expect(parseFocusLinkKey(url)).toBe(KEY);
    expect(parseFocusLinkKey(`#${KEY}`)).toBe(KEY);
    expect(parseFocusLinkKey(`  ${KEY}\n`)).toBe(KEY);
  });
  it("refuses anything that isn't a whole key", () => {
    for (const bad of ["", null, undefined, "spt_123", KEY.slice(0, -1), KEY + "a", KEY.toUpperCase(), "#"]) expect(parseFocusLinkKey(bad)).toBeNull();
  });
  it("describes the single web request an automation app can send", () => {
    const r = focusLinkRequest("https://x.supabase.co/", "anon-key", KEY);
    expect(r.url).toBe("https://x.supabase.co/rest/v1/rpc/use_focus_link");
    expect(r.headers).toEqual({ apikey: "anon-key", "Content-Type": "application/json" });
    expect(JSON.parse(r.body)).toEqual({ p_key: KEY });
    const curl = focusLinkCurl("https://x.supabase.co", "anon-key", KEY);
    expect(curl).toContain("curl -X POST 'https://x.supabase.co/rest/v1/rpc/use_focus_link'");
    expect(curl).toContain("-H 'apikey: anon-key'");
    expect(curl).toContain(`-d '{"p_key":"${KEY}"}'`);
  });
  it("tidies names and checks lengths like the database", () => {
    expect(normalizeFocusLinkLabel("  Desk   tag ")).toBe("Desk tag");
    expect(normalizeFocusLinkLabel("   ")).toBeNull();
    expect(normalizeFocusLinkLabel("x".repeat(FOCUS_LINK_LABEL_MAX))).not.toBeNull();
    expect(normalizeFocusLinkLabel("x".repeat(FOCUS_LINK_LABEL_MAX + 1))).toBeNull();
    expect(validFocusLinkMinutes(FOCUS_LINK_MIN_MINUTES)).toBe(true);
    expect(validFocusLinkMinutes(FOCUS_LINK_MAX_MINUTES)).toBe(true);
    expect(validFocusLinkMinutes(FOCUS_LINK_MIN_MINUTES - 1)).toBe(false);
    expect(validFocusLinkMinutes(FOCUS_LINK_MAX_MINUTES + 1)).toBe(false);
    expect(validFocusLinkMinutes(25.5)).toBe(false);
  });
  it("uses the same numbers and key shape as the migration", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0024_focus_links.sql"), "utf8");
    expect(sql).toContain(`p_minutes < ${FOCUS_LINK_MIN_MINUTES} or p_minutes > ${FOCUS_LINK_MAX_MINUTES}`);
    expect(sql).toContain(`check (minutes between ${FOCUS_LINK_MIN_MINUTES} and ${FOCUS_LINK_MAX_MINUTES})`);
    expect(sql).toContain(`p_minutes int default ${FOCUS_LINK_DEFAULT_MINUTES}`);
    expect(sql).toContain(`char_length(lbl) > ${FOCUS_LINK_LABEL_MAX}`);
    expect(sql).toContain(`where user_id = uid) >= ${FOCUS_LINK_MAX} then`);
    expect(sql).toContain(`p_key !~ '${FOCUS_LINK_KEY_PATTERN.source}'`);
  });
});
