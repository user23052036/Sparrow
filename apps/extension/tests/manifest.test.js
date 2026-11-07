import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const exists = (p) => existsSync(join(root, p));

test("manifest is MV3 with the permissions blocking needs", () => {
  assert.equal(manifest.manifest_version, 3);
  for (const p of ["storage", "alarms", "declarativeNetRequest"]) assert.ok(manifest.permissions.includes(p), p);
  assert.ok(manifest.host_permissions.includes("<all_urls>"));
});

test("every file the manifest points at exists", () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((c) => c.js),
    ...manifest.web_accessible_resources.flatMap((r) => r.resources),
  ];
  for (const f of files) assert.ok(exists(f), `missing ${f}`);
});

test("the blocked page and popup load only local scripts and styles", () => {
  for (const page of ["blocked.html", "popup.html"]) {
    const html = readFileSync(join(root, page), "utf8");
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      assert.ok(!/^https?:/.test(m[1]), `${page} loads remote ${m[1]}`);
      assert.ok(exists(m[1]), `${page} references missing ${m[1]}`);
    }
  }
});

test("the website talks to the extension using message types the background script handles", () => {
  const bg = readFileSync(join(root, "background.js"), "utf8");
  const web = [
    readFileSync(join(root, "../web/lib/extension.ts"), "utf8"),
    readFileSync(join(root, "../web/app/(app)/extension/page.tsx"), "utf8"),
    readFileSync(join(root, "../web/app/(app)/focus/page.tsx"), "utf8"),
  ].join("\n");
  const used = new Set([...web.matchAll(/"(SPARROW_[A-Z_]+)"/g)].map((m) => m[1]));
  assert.ok(used.size >= 4, "expected the web app to use several message types");
  for (const t of used) assert.ok(bg.includes(`"${t}"`), `background.js does not handle ${t}`);
});
