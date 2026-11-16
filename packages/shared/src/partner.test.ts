import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS, copy } from "./copy";
import { eventLabel, inviteLink, KEY_REQUESTS_PER_DAY, KEY_REQUESTS_PER_SESSION, parseInviteCode, quietTime } from "./partner";

const CODE = "0123456789abcdef";

describe("parseInviteCode", () => {
  it("reads the code from a full invite link", () => {
    expect(parseInviteCode(`http://localhost:3000/partner/join?code=${CODE}`)).toBe(CODE);
    expect(parseInviteCode(`https://example.com/partner/join?code=${CODE.toUpperCase()}&x=1`)).toBe(CODE);
  });
  it("accepts a bare code, with stray spaces", () => {
    expect(parseInviteCode(`  ${CODE} `)).toBe(CODE);
  });
  it("accepts a partial link without a scheme", () => {
    expect(parseInviteCode(`/partner/join?code=${CODE}`)).toBe(CODE);
  });
  it.each(["", "   ", "hello", "0123", "http://x.com/?code=short", `${CODE}00`])("rejects %j", (v) => {
    expect(parseInviteCode(v)).toBeNull();
  });
});

describe("inviteLink", () => {
  it("builds a link and round-trips through parseInviteCode", () => {
    const link = inviteLink("http://localhost:3000/", CODE);
    expect(link).toBe(`http://localhost:3000/partner/join?code=${CODE}`);
    expect(parseInviteCode(link)).toBe(CODE);
  });
});

describe("eventLabel", () => {
  it("describes each kind gently", () => {
    expect(eventLabel("early_exit")).toBe(copy.eventEarlyExit);
    expect(eventLabel("early_exit", "partner approved: need a break")).toBe(copy.eventApproved);
    expect(eventLabel("heartbeat_lost")).toBe(copy.eventQuiet);
    expect(eventLabel("protection_disabled")).toBe(copy.eventDisabled);
  });
  it("never uses shaming words", () => {
    const all = ["early_exit", "heartbeat_lost", "protection_disabled"]
      .map((k) => eventLabel(k as never))
      .join(" ")
      .toLowerCase();
    for (const w of BANNED_WORDS) expect(all).not.toContain(w);
  });
});

describe("partner fatigue guard", () => {
  it("uses the same limits as migration 0031", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0031_fatigue_guard.sql"), "utf8");
    expect(sql).toContain(`_key_requests_per_session() returns int language sql immutable as $$ select ${KEY_REQUESTS_PER_SESSION} $$`);
    expect(sql).toContain(`_key_requests_per_day() returns int language sql immutable as $$ select ${KEY_REQUESTS_PER_DAY} $$`);
  });
  it("reads quiet-hours times the way the database writes them", () => {
    expect(quietTime("22:00:00")).toBe("22:00");
    expect(quietTime("07:30")).toBe("07:30");
    for (const bad of [null, undefined, "", "24:00", "7:00", "22:00:30", "noon"]) expect(quietTime(bad)).toBeNull();
  });
});
