/**
 * Builds the manifest for a Chrome Web Store upload: the content script must match the
 * deployed website instead of localhost, and nothing may point at a development host.
 */
export function storeManifest(manifest, origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(`SPARROW_ORIGIN must be a full URL like https://app.example.com (got "${origin}")`);
  }
  if (url.protocol !== "https:") throw new Error("SPARROW_ORIGIN must use https");
  if (url.pathname !== "/" || url.search || url.hash) throw new Error("SPARROW_ORIGIN must be just the origin, with no path");
  const out = structuredClone(manifest);
  out.content_scripts = out.content_scripts.map((c) => ({ ...c, matches: [`${url.origin}/*`] }));
  return out;
}

/** Files that ship in the store package. Tests, scripts and package.json stay out. */
export const STORE_FILES = ["manifest.json", "background.js", "content.js", "blocked.html", "blocked.js", "popup.html", "popup.js", "ui.css", "icons", "lib"];
