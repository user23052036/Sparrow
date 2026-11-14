// Security headers (ROADMAP T1.5). The same policy is sent as real headers by `next start`
// (next.config.ts) and as a <meta> tag in the static export (app/layout.tsx), where GitHub Pages
// cannot set headers. Kept free of browser or Next imports so next.config.ts can use it.

/** Content-Security-Policy for this app talking to one Supabase project. */
export function contentSecurityPolicy(supabaseUrl: string, opts: { dev?: boolean; frameAncestors?: boolean } = {}): string {
  let supabase = "";
  let realtime = "";
  try {
    const u = new URL(supabaseUrl);
    supabase = u.origin;
    realtime = `${u.protocol === "http:" ? "ws:" : "wss:"}//${u.host}`;
  } catch {
    /* not configured: the app shows its setup message and talks to nobody */
  }
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    // Next.js inlines small bootstrap scripts, and a static export cannot carry per-request nonces.
    ["script-src", ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]],
    ["font-src", ["'self'", "https://fonts.gstatic.com"]],
    ["img-src", ["'self'", "data:", "blob:", supabase]],
    ["media-src", ["'self'", "blob:", supabase]],
    ["connect-src", ["'self'", supabase, realtime]],
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];
  // Only honoured as a header; browsers ignore it (with a console warning) inside <meta>.
  if (opts.frameAncestors) directives.push(["frame-ancestors", ["'none'"]]);
  return directives.map(([k, v]) => `${k} ${v.filter(Boolean).join(" ")}`).join("; ");
}

export const REFERRER_POLICY = "strict-origin-when-cross-origin";

/** Headers for hosts that can send them (`next start`, Vercel and similar). */
export function securityHeaders(supabaseUrl: string, dev = false): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(supabaseUrl, { dev, frameAncestors: true }) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: REFERRER_POLICY },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
  ];
}
