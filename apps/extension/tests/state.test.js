import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRules, endsAtLocal, isActive, minutesLeft, isAllowedSupabaseUrl } from "../lib/state.js";
import { normalizeDomain, normalizeDomainList, hostMatches } from "../lib/domains.js";

test("endsAtLocal corrects for a fast local clock", () => {
  // Server says now=10:00:00, ends 10:25:00; local clock reads 10:02:00 (2 min fast).
  const local = Date.parse("2026-01-01T10:02:00Z");
  const end = endsAtLocal("2026-01-01T10:25:00Z", "2026-01-01T10:00:00Z", local);
  assert.equal(end, Date.parse("2026-01-01T10:27:00Z"));
});

test("isActive requires active flag, future end, and at least one domain", () => {
  const now = 1000;
  assert.equal(isActive({ active: true, endsAtLocal: 2000, domains: ["x.com"] }, now), true);
  assert.equal(isActive({ active: true, endsAtLocal: 500, domains: ["x.com"] }, now), false);
  assert.equal(isActive({ active: true, endsAtLocal: 2000, domains: [] }, now), false);
  assert.equal(isActive({ active: false }, now), false);
  assert.equal(isActive(undefined, now), false);
});

test("minutesLeft rounds up and is 0 when inactive", () => {
  assert.equal(minutesLeft({ active: true, endsAtLocal: 90_000, domains: ["a.com"] }, 0), 2);
  assert.equal(minutesLeft({ active: false }, 0), 0);
});

test("buildRules makes a redirect and a frame-block rule per domain with unique ids", () => {
  const rules = buildRules(["a.com", "b.com"]);
  assert.equal(rules.length, 4);
  assert.deepEqual(
    rules.map((r) => r.id),
    [1, 2, 3, 4],
  );
  assert.equal(rules[0].action.redirect.extensionPath, "/blocked.html");
  assert.deepEqual(rules[0].condition, { requestDomains: ["a.com"], resourceTypes: ["main_frame"] });
  assert.equal(rules[1].action.type, "block");
  assert.deepEqual(buildRules([]), []);
});

test("only https or local http Supabase URLs are accepted", () => {
  assert.equal(isAllowedSupabaseUrl("https://abc.supabase.co"), true);
  assert.equal(isAllowedSupabaseUrl("http://localhost:54321"), true);
  assert.equal(isAllowedSupabaseUrl("http://evil.example.com"), false);
  assert.equal(isAllowedSupabaseUrl("not a url"), false);
});

test("domain helpers match the web app's rules", () => {
  assert.equal(normalizeDomain("https://www.YouTube.com/watch?v=1"), "youtube.com");
  assert.equal(normalizeDomain("youtube"), null);
  assert.deepEqual(normalizeDomainList(["www.x.com", "x.com", "b.com"]), ["b.com", "x.com"]);
  assert.equal(hostMatches("m.youtube.com", ["youtube.com"]), true);
  assert.equal(hostMatches("notyoutube.com", ["youtube.com"]), false);
  assert.equal(hostMatches("www.reddit.com", ["reddit.com"]), true);
});
