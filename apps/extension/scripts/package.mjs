// Usage: SPARROW_SITE=https://owner.github.io/Sparrow/ npm run package -w apps/extension
// Writes dist/sparrow-focus-<version>.zip ready for the Chrome Web Store dashboard.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STORE_FILES, storeManifest, storeSiteModule } from "./store-manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.env.SPARROW_SITE ?? process.env.SPARROW_ORIGIN; // SPARROW_ORIGIN: the older name
if (!origin) {
  console.error("Set SPARROW_SITE to the https address of your deployed Sparrow site, e.g. SPARROW_SITE=https://owner.github.io/Sparrow/");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const store = storeManifest(manifest, origin);
const stage = join(root, "dist", "stage");
rmSync(join(root, "dist"), { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const f of STORE_FILES) cpSync(join(root, f), join(stage, f), { recursive: true });
writeFileSync(join(stage, "manifest.json"), JSON.stringify(store, null, 2) + "\n");
writeFileSync(join(stage, "lib", "site.js"), storeSiteModule(origin));

const zip = join(root, "dist", `sparrow-focus-${manifest.version}.zip`);
execFileSync("zip", ["-qr", zip, "."], { cwd: stage });
rmSync(stage, { recursive: true, force: true });
console.log(`Wrote ${zip}\nUpload it at https://chrome.google.com/webstore/devconsole (see docs/STORE_LISTING.md).`);
