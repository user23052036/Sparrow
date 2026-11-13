import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { copy } from "./copy";
import { CIRCLE_ALIAS_SOURCE, normalizeCircleAlias, proofContextLines } from "./proofcontext";
import type { ProofContext } from "./types";

const base: ProofContext = { kind: "text", days_after: 0, soon_after_planning: false, similar_photo: false, photo_age: null };

describe("proofContextLines", () => {
  it("says when the proof was added relative to the planned day", () => {
    expect(proofContextLines(base)).toEqual([copy.proofContext.sameDay]);
    expect(proofContextLines({ ...base, days_after: 1 })).toEqual([copy.proofContext.later(1)]);
    expect(copy.proofContext.later(1)).toContain("1 day ");
    expect(copy.proofContext.later(3)).toContain("3 days ");
  });

  it("adds the photo-date notes only for photos", () => {
    expect(proofContextLines({ ...base, kind: "photo", photo_age: "fresh" })).toContain(copy.proofContext.photoFresh);
    expect(proofContextLines({ ...base, kind: "photo", photo_age: "older" })).toContain(copy.proofContext.photoOlder);
    expect(proofContextLines({ ...base, kind: "photo", photo_age: null })).toEqual([copy.proofContext.sameDay]);
    expect(proofContextLines({ ...base, kind: "voice", photo_age: "older" as const })).toEqual([copy.proofContext.sameDay]);
  });

  it("mentions 'soon after planning' only on the planned day", () => {
    expect(proofContextLines({ ...base, soon_after_planning: true })).toEqual([copy.proofContext.sameDay, copy.proofContext.soon]);
    expect(proofContextLines({ ...base, soon_after_planning: true, days_after: 2 })).toEqual([copy.proofContext.later(2)]);
  });

  it("is empty without data and tolerates odd numbers", () => {
    expect(proofContextLines(null)).toEqual([]);
    expect(proofContextLines({ ...base, days_after: -3 })).toEqual([copy.proofContext.sameDay]);
    expect(proofContextLines({ ...base, days_after: Number.NaN })).toEqual([copy.proofContext.sameDay]);
  });

  it("never gives a score or a judgement word", () => {
    const all = [...Object.values(copy.proofContext).map((v) => (typeof v === "function" ? v(2) : v))].join(" ").toLowerCase();
    for (const w of ["score", "fake", "suspicious", "cheat", "trust", "%"]) expect(all).not.toContain(w);
    expect(all).toContain("not a verdict");
  });
});

describe("normalizeCircleAlias", () => {
  it("tidies spaces and accepts simple names", () => {
    expect(normalizeCircleAlias("  Night   Owl ")).toBe("Night Owl");
    expect(normalizeCircleAlias("Wren-2")).toBe("Wren-2");
    expect(normalizeCircleAlias("ab")).toBe("ab");
    expect(normalizeCircleAlias("a".repeat(20))).toBe("a".repeat(20));
  });
  it("treats empty as 'use my own name'", () => {
    expect(normalizeCircleAlias("   ")).toBe("");
  });
  it("refuses names the database would refuse", () => {
    for (const bad of ["x", "a".repeat(21), "drop;table", "-dash", "dash-", "émile", "a@b"]) expect(normalizeCircleAlias(bad)).toBeNull();
  });
  it("uses the same pattern as the migration", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0022_circle_alias.sql"), "utf8");
    expect(sql.split(`'${CIRCLE_ALIAS_SOURCE}'`).length - 1).toBe(2); // the column check and _circle_alias()
  });
});
