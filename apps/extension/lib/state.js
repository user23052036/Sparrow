// Pure helpers for focus state and blocking rules (unit-tested in tests/).

/** Convert the server's ends_at into local clock time, correcting for clock skew. */
export function endsAtLocal(endsAtIso, serverNowIso, localNow) {
  return localNow + (Date.parse(endsAtIso) - Date.parse(serverNowIso));
}

export function isActive(focus, now) {
  return Boolean(focus && focus.active && focus.endsAtLocal > now && focus.domains && focus.domains.length > 0);
}

export function minutesLeft(focus, now) {
  return isActive(focus, now) ? Math.max(1, Math.ceil((focus.endsAtLocal - now) / 60000)) : 0;
}

/**
 * declarativeNetRequest rules: redirect top-level pages to the extension's
 * blocked page, and block embedded frames. requestDomains also covers subdomains.
 */
export function buildRules(domains, blockedPath = "/blocked.html") {
  const rules = [];
  domains.forEach((d, i) => {
    rules.push({
      id: i * 2 + 1,
      priority: 1,
      action: { type: "redirect", redirect: { extensionPath: blockedPath } },
      condition: { requestDomains: [d], resourceTypes: ["main_frame"] },
    });
    rules.push({
      id: i * 2 + 2,
      priority: 1,
      action: { type: "block" },
      condition: { requestDomains: [d], resourceTypes: ["sub_frame"] },
    });
  });
  return rules;
}

/** Only these origins may hand the extension its Supabase config. */
export function isAllowedSupabaseUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}
