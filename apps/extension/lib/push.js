// Pure helpers for the extension's silent Web Push (D44, ROADMAP T2.5). Unit-tested in tests/.

/** After a try that did not work (no server key yet, offline, push service down), wait this long before trying again. */
export const PUSH_RETRY_MS = 6 * 60 * 60 * 1000;
/** A saved address is checked again this often, so a new server key or a forgotten row mends itself. */
export const PUSH_REFRESH_MS = 24 * 60 * 60 * 1000;

/** The server's VAPID public key (base64url) as the bytes pushManager.subscribe wants. */
export function base64UrlToBytes(s) {
  const b64 = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Who the extension is signed in as, for telling whether its push address was saved for them. */
export function pushOwner(auth) {
  return auth?.user_id ?? auth?.email ?? null;
}

/**
 * Whether to (re)subscribe and save this extension's push address now. `push` is what was stored:
 * { owner, endpoint, savedAt } once saved, { owner, triedAt } after a try that did not work, or nothing.
 */
export function pushNeedsSaving(push, owner, now) {
  if (!owner) return false;
  if (!push || push.owner !== owner) return true;
  if (push.endpoint) return !(now - (push.savedAt ?? 0) < PUSH_REFRESH_MS);
  return !(now - (push.triedAt ?? 0) < PUSH_RETRY_MS);
}

/** Whether a subscription was made with this server key (a new key needs a new subscription). */
export function sameKey(buffer, bytes) {
  if (!buffer) return false;
  const a = new Uint8Array(buffer);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
}
