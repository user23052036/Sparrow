// JS copy of packages/shared/src/domains.ts (the extension has no build step).
export function normalizeDomain(input) {
  let s = String(input ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, "");
  s = s.split(/[/?#]/)[0];
  s = s.replace(/:\d+$/, "");
  s = s.replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  if (s.split(".").some((p) => p.startsWith("-") || p.endsWith("-") || p.length === 0)) return null;
  return s;
}

export function normalizeDomainList(list) {
  const out = new Set();
  for (const i of list ?? []) {
    const d = normalizeDomain(i);
    if (d) out.add(d);
  }
  return [...out].sort();
}

/** true if host is the domain or one of its subdomains */
export function hostMatches(host, domains) {
  const h = String(host ?? "")
    .toLowerCase()
    .replace(/^www\./, "");
  return domains.some((d) => h === d || h.endsWith("." + d));
}
