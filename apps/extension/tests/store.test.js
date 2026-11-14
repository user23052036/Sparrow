import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STORE_FILES, storeManifest, storeSite, storeSiteModule } from "../scripts/store-manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

test("store manifest points the content script at the deployed site only", () => {
  const m = storeManifest(manifest, "https://sparrow.example.com");
  assert.deepEqual(m.content_scripts[0].matches, ["https://sparrow.example.com/*"]);
  assert.ok(!JSON.stringify(m).includes("localhost"));
  assert.ok(JSON.stringify(manifest).includes("localhost"), "the source manifest is left untouched");
});

test("store manifest works for a site served from a folder, like GitHub Pages", () => {
  for (const site of ["https://owner.github.io/Sparrow", "https://owner.github.io/Sparrow/"]) {
    assert.deepEqual(storeManifest(manifest, site).content_scripts[0].matches, ["https://owner.github.io/Sparrow/*"]);
  }
  assert.equal(storeSite("https://sparrow.example.com"), "https://sparrow.example.com/");
});

test("the store package opens the deployed site, never localhost", () => {
  const mod = storeSiteModule("https://owner.github.io/Sparrow");
  assert.match(mod, /export const DEFAULT_SITE = "https:\/\/owner\.github\.io\/Sparrow\/";/);
  assert.ok(!mod.includes("localhost"));
  assert.match(readFileSync(join(root, "lib/site.js"), "utf8"), /DEFAULT_SITE = "http:\/\/localhost:3000\/"/, "the unpacked copy stays on the dev server");
});

test("store manifest refuses unsafe sites", () => {
  for (const bad of ["http://sparrow.example.com", "sparrow.example.com", "https://x.com/?a=1", "https://x.com/#top", "https://u:p@x.com/", ""]) {
    assert.throws(() => storeManifest(manifest, bad), bad);
    assert.throws(() => storeSiteModule(bad), bad);
  }
});

test("everything the store package ships exists, and tests and scripts are excluded", () => {
  for (const f of STORE_FILES) assert.ok(existsSync(join(root, f)), `missing ${f}`);
  for (const f of ["tests", "scripts", "package.json", "dist"]) assert.ok(!STORE_FILES.includes(f), f);
});

test("every file the manifest needs is in the store package", () => {
  const needed = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((c) => c.js),
    ...manifest.web_accessible_resources.flatMap((r) => r.resources),
  ];
  for (const f of needed)
    assert.ok(
      STORE_FILES.some((s) => f === s || f.startsWith(s + "/")),
      `${f} would be missing from the zip`,
    );
});
