/** Android package names, e.g. com.instagram.android. */
const PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i;

export const MAX_ANDROID_PACKAGES = 300;

/**
 * Apps Sparrow never blocks, whatever the user picks: dialer, messages,
 * emergency and Sparrow itself. See PLAN.md M5b-2 "always allow".
 */
export const ALWAYS_ALLOWED_PACKAGES = [
  "com.sparrow.app",
  "com.android.dialer",
  "com.google.android.dialer",
  "com.samsung.android.dialer",
  "com.android.server.telecom",
  "com.android.emergency",
  "com.google.android.apps.messaging",
  "com.android.mms",
  "com.samsung.android.messaging",
  "com.android.settings",
  "com.android.systemui",
] as const;

export function isValidPackageName(p: string): boolean {
  return p.length <= 255 && PACKAGE_RE.test(p);
}

/** Trim, validate, lowercase-insensitive de-duplicate, drop always-allowed apps, cap the list. */
export function normalizePackageList(input: string[]): string[] {
  const allowed = new Set<string>(ALWAYS_ALLOWED_PACKAGES);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const p = raw.trim();
    if (!isValidPackageName(p) || allowed.has(p) || seen.has(p.toLowerCase())) continue;
    seen.add(p.toLowerCase());
    out.push(p);
    if (out.length >= MAX_ANDROID_PACKAGES) break;
  }
  return out;
}
