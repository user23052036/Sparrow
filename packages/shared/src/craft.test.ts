import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { copy } from "./copy";
import { CRAFT_RECIPES, CRAFTED_KEYS, craftRows, isCraftedKey } from "./craft";
import { BADGE_KEYS } from "./progress";

describe("badge crafting", () => {
  it("has the same recipes as the migration", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0025_badge_crafting.sql"), "utf8");
    for (const key of CRAFTED_KEYS) {
      const list = CRAFT_RECIPES[key].map((p) => `'${p}'`).join(", ");
      expect(sql).toContain(`when '${key}' then array[${list}]`);
    }
    expect(sql).toContain(`check (key in (${CRAFTED_KEYS.map((k) => `'${k}'`).join(", ")}))`);
  });
  it("only uses ingredients that exist, and every recipe needs at least two", () => {
    const known = new Set<string>([...BADGE_KEYS, ...CRAFTED_KEYS]);
    for (const key of CRAFTED_KEYS) {
      expect(CRAFT_RECIPES[key].length).toBeGreaterThanOrEqual(2);
      for (const p of CRAFT_RECIPES[key]) expect(known.has(p)).toBe(true);
      expect(CRAFT_RECIPES[key]).not.toContain(key);
    }
  });
  it("uses every earned badge in some recipe, so nothing is left over", () => {
    const used = new Set(Object.values(CRAFT_RECIPES).flat());
    for (const k of BADGE_KEYS) expect(used.has(k)).toBe(true);
  });
  it("has a name and a line for every crafted badge", () => {
    for (const k of CRAFTED_KEYS) {
      expect(copy.craft.badges[k].name.length).toBeGreaterThan(2);
      expect(copy.craft.badges[k].about.length).toBeGreaterThan(10);
    }
  });
  it("shows what is crafted, ready and still waiting, with ticks per ingredient", () => {
    const rows = craftRows(["first_proof", "first_focus", "first_plan", "unknown_badge"], { crafted: ["honest_work"], ready: [] });
    expect(rows.map((r) => r.state)).toEqual(["waiting", "crafted", "waiting", "waiting"]);
    expect(rows[0].parts).toEqual([
      { key: "first_plan", held: true },
      { key: "first_full_day", held: false },
      { key: "run_3", held: false },
    ]);
    expect(rows[3].parts.find((p) => p.key === "honest_work")?.held).toBe(true);
    const ready = craftRows(["first_kind_act", "helped_partner"], { crafted: [], ready: ["warm_heart"] });
    expect(ready[2].state).toBe("ready");
  });
  it("tells crafted keys from earned ones", () => {
    expect(isCraftedKey("full_nest")).toBe(true);
    expect(isCraftedKey("run_7")).toBe(false);
  });
});
