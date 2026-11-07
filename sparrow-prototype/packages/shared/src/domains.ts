/**
 * Normalise whatever a user types ("https://www.YouTube.com/watch?v=1",
 * "reddit.com/r/x", " x.com ") into a bare hostname ("youtube.com").
 * Returns null for input that is not a plausible domain.
 * The extension has a JS copy of this in apps/extension/lib/domains.js.
 */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, "");
  s = s.split(/[/?#]/)[0];
  s = s.replace(/:\d+$/, "");
  s = s.replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  if (s.split(".").some((part) => part.startsWith("-") || part.endsWith("-") || part.length === 0)) return null;
  return s;
}

export function normalizeDomainList(inputs: string[]): string[] {
  const out = new Set<string>();
  for (const i of inputs) {
    const d = normalizeDomain(i);
    if (d) out.add(d);
  }
  return [...out].sort();
}
