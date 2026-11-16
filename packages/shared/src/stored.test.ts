import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "./copy";
import { REVIEWED_FUNCTIONS, STORED, storedTables, type Schema } from "./stored";

// schema.json is written from the migrations by supabase/tests/snapshot.sh, and CI checks it is up to date.
// So a migration that adds a table or a column fails here until stored.ts describes it.
const snapshot = JSON.parse(readFileSync(resolve(__dirname, "schema.json"), "utf8")) as Schema;
const schema = snapshot.tables;

describe("What Sparrow stores", () => {
  it("the snapshot has the tables the migrations make", () => {
    expect(schema.length).toBeGreaterThan(20);
    expect(schema.map((t) => t.table)).toContain("profiles");
  });
  it.each(schema.map((t) => [t.table, t] as const))("%s is described, with every column", (name, t) => {
    const d = STORED[name];
    expect(d, `describe ${name} in stored.ts`).toBeDefined();
    for (const c of t.columns) expect(d.columns[c.name], `describe ${name}.${c.name} in stored.ts`).toBeTruthy();
    expect(d.title && d.what && d.who).toBeTruthy();
  });
  it("describes nothing that no longer exists", () => {
    const names = new Set(schema.map((t) => t.table));
    for (const [name, d] of Object.entries(STORED)) {
      expect(names.has(name), `${name} is in stored.ts but not in the database`).toBe(true);
      const cols = new Set(schema.find((t) => t.table === name)!.columns.map((c) => c.name));
      for (const c of Object.keys(d.columns)) expect(cols.has(c), `${name}.${c} is in stored.ts but not in the database`).toBe(true);
    }
  });
  it("tables only the server uses say so", () => {
    for (const t of schema.filter((t) => t.rls && t.readPolicies.length === 0 && t.columns.every((c) => !c.readable)))
      expect(STORED[t.table].who).toMatch(/No one reads this through the app/);
  });
  it("the page rows mark columns no signed-in person can read", () => {
    const rows = storedTables(schema);
    expect(rows).toHaveLength(schema.length);
    const guest = rows.find((r) => r.table === "guest_keys")!;
    expect(guest.columns.filter((c) => c.hidden).map((c) => c.name)).toEqual(["quiet_from", "quiet_to", "quiet_tz"]);
    expect(guest.columns.find((c) => c.name === "name")!.hidden).toBe(false);
  });
  it("every server function people can call has been checked against the who sentences, as it is now", () => {
    const now = Object.fromEntries(snapshot.functions.map((f) => [f.signature, { hash: f.hash, anon: f.anon }]));
    for (const [sig, f] of Object.entries(now)) {
      const seen = REVIEWED_FUNCTIONS[sig];
      expect(seen, `${sig} is new: check what it shows against stored.ts, then add it to REVIEWED_FUNCTIONS`).toBeDefined();
      expect(seen.hash, `${sig} changed: check what it shows against stored.ts, then update its hash`).toBe(f.hash);
      expect(seen.anon, `${sig} is now ${f.anon ? "" : "no longer "}callable without signing in: check stored.ts`).toBe(f.anon);
    }
    for (const sig of Object.keys(REVIEWED_FUNCTIONS)) expect(now[sig], `${sig} no longer exists: remove it`).toBeDefined();
  });
  it("its words follow the same gentle-language rules as copy.ts", () => {
    const text = JSON.stringify(STORED).toLowerCase();
    for (const w of BANNED_WORDS) expect(text).not.toMatch(new RegExp(`\\b${w}\\b`));
  });
  it("a table without a description stops the build", () => {
    expect(() => storedTables([...schema, { table: "secret_new_table", rls: true, readPolicies: [], columns: [] }])).toThrow(/secret_new_table/);
  });
});
