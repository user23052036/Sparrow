// Usage: SPARROW_ORIGIN=https://your-app.example.com npm run package -w apps/extension
// Writes dist/sparrow-focus-<version>.zip ready for the Chrome Web Store dashboard.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STORE_FILES, storeManifest } from "./store-manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.env.SPARROW_ORIGIN;
if (!origin) {
  console.error("Set SPARROW_ORIGIN to the https origin of your deployed Sparrow site, e.g. SPARROW_ORIGIN=https://sparrow.example.com");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const store = storeManifest(manifest, origin);
const stage = join(root, "dist", "stage");
rmSync(join(root, "dist"), { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const f of STORE_FILES) cpSync(join(root, f), join(stage, f), { recursive: true });
writeFileSync(join(stage, "manifest.json"), JSON.stringify(store, null, 2) + "\n");

const zip = join(root, "dist", `sparrow-focus-${manifest.version}.zip`);
execFileSync("zip", ["-qr", zip, "."], { cwd: stage });
rmSync(stage, { recursive: true, force: true });
console.log(`Wrote ${zip}\nUpload it at https://chrome.google.com/webstore/devconsole (see docs/STORE_LISTING.md).`);
