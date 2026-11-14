/**
 * The deployed site as origin plus folder, ending in "/": "https://app.example.com/" or
 * "https://owner.github.io/Sparrow/". Only https, no query or fragment.
 */
export function storeSite(site) {
  let url;
  try {
    url = new URL(site);
  } catch {
    throw new Error(`SPARROW_SITE must be a full URL like https://app.example.com or https://owner.github.io/Sparrow/ (got "${site}")`);
  }
  if (url.protocol !== "https:") throw new Error("SPARROW_SITE must use https");
  if (url.search || url.hash || url.username || url.password) throw new Error("SPARROW_SITE must be just the site address, with no query, fragment or login");
  return url.origin + (url.pathname.endsWith("/") ? url.pathname : url.pathname + "/");
}

/**
 * Builds the manifest for a Chrome Web Store upload: the content script must match the
 * deployed website instead of localhost, and nothing may point at a development host.
 */
export function storeManifest(manifest, site) {
  const base = storeSite(site);
  const out = structuredClone(manifest);
  out.content_scripts = out.content_scripts.map((c) => ({ ...c, matches: [`${base}*`] }));
  return out;
}

/** lib/site.js for the store package: opens the deployed site, never localhost. */
export function storeSiteModule(site) {
  return `// Written by scripts/package.mjs for the store package.\nexport const DEFAULT_SITE = ${JSON.stringify(storeSite(site))};\n`;
}

/** Files that ship in the store package. Tests, scripts and package.json stay out. */
export const STORE_FILES = ["manifest.json", "background.js", "content.js", "blocked.html", "blocked.js", "popup.html", "popup.js", "ui.css", "icons", "lib"];
