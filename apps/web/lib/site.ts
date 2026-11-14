/** The path the app is served under: "" locally, "/Sparrow" on GitHub Pages (D41). Set at build time. */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The app's own address (origin plus base path), for links people copy, share or open from an email. */
export function siteUrl(): string {
  return typeof window === "undefined" ? "" : window.location.origin + basePath;
}
