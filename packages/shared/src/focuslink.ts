/**
 * Focus links (D35, migration 0024): a secret key that can only start a focus session.
 * The numbers below mirror the checks in create_focus_link(); a test pins them to the migration.
 */
export const FOCUS_LINK_MAX = 5;
export const FOCUS_LINK_MIN_MINUTES = 5;
export const FOCUS_LINK_MAX_MINUTES = 120;
export const FOCUS_LINK_DEFAULT_MINUTES = 25;
export const FOCUS_LINK_LABEL_MAX = 40;
export const FOCUS_LINK_KEY_PATTERN = /^spt_[0-9a-f]{64}$/;

export interface FocusLink {
  id: string;
  label: string;
  minutes: number;
  created_at: string;
  last_used_at: string | null;
  use_count: number;
}

/** What create_focus_link() answers. The key is shown once and cannot be read again. */
export interface NewFocusLink {
  id: string;
  label: string;
  minutes: number;
  key: string;
}

/** What use_focus_link() answers: nothing about the person beyond the session's end. */
export interface FocusLinkResult {
  started: boolean;
  running: boolean;
  ends_at: string;
  minutes: number;
}

/** Reads a key from a bare key, a "#key" fragment or a whole focus link. Null when there is none. */
export function parseFocusLinkKey(input: string | null | undefined): string | null {
  const m = /spt_[0-9a-f]{64}(?![0-9a-f])/.exec((input ?? "").trim());
  return m && FOCUS_LINK_KEY_PATTERN.test(m[0]) ? m[0] : null;
}

/**
 * The address to put on a tag, shortcut or automation. The key sits after "#", which browsers
 * never send to the server, so it stays out of server logs.
 */
export function focusLinkUrl(origin: string, key: string): string {
  return `${origin.replace(/\/$/, "")}/go#${key}`;
}

/** The same thing as one web request, for automation apps that can't open a page. */
export function focusLinkRequest(supabaseUrl: string, anonKey: string, key: string): { url: string; headers: Record<string, string>; body: string } {
  return {
    url: `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/use_focus_link`,
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_key: key }),
  };
}

export function focusLinkCurl(supabaseUrl: string, anonKey: string, key: string): string {
  const r = focusLinkRequest(supabaseUrl, anonKey, key);
  const headers = Object.entries(r.headers)
    .map(([k, v]) => `-H '${k}: ${v}'`)
    .join(" ");
  return `curl -X POST '${r.url}' ${headers} -d '${r.body}'`;
}

/** Tidies a name the way the database does; null when it is empty or too long. */
export function normalizeFocusLinkLabel(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  return s.length >= 1 && s.length <= FOCUS_LINK_LABEL_MAX ? s : null;
}

export function validFocusLinkMinutes(m: number): boolean {
  return Number.isInteger(m) && m >= FOCUS_LINK_MIN_MINUTES && m <= FOCUS_LINK_MAX_MINUTES;
}
