import { describe, expect, it } from "vitest";
import { BANNED_WORDS, copy } from "./copy";

describe("gentle-language checklist", () => {
  const all = Object.values(copy)
    .map((v) => (typeof v === "function" ? (v as (...a: number[]) => string)(1, 2) : v))
    .join(" ")
    .toLowerCase();
  it.each(BANNED_WORDS)("copy never uses %j", (w) => expect(all).not.toMatch(new RegExp(`\\b${w}\\b`)));
});

// Audit: no screen, extension page or script may use shaming words either,
// not only the strings kept in copy.ts. Skips copy.ts (it lists the words).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const SKIP = new Set(["node_modules", ".next", "tests", "icons", "public"]);
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (SKIP.has(n)) return [];
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(tsx?|jsx?|html|css)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}
describe("copy audit across the apps", () => {
  const files = [...sources(join(root, "apps/web")), ...sources(join(root, "apps/extension"))];
  it("finds the sources", () => expect(files.length).toBeGreaterThan(10));
  it.each(BANNED_WORDS)("no source file uses %j", (w) => {
    const hits = files.filter((f) => new RegExp(`\\b${w}\\b`, "i").test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  it("shows no red-X shaming marks", () => {
    const hits = files.filter((f) => /[❌✗✘]/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  it("support page tells people to contact emergency services when in danger", () =>
    expect(copy.helpIntro).toMatch(/emergency services/));
});
