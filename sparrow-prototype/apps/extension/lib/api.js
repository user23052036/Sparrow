// Minimal Supabase client for the extension using fetch (no bundler needed).
// The extension keeps its OWN session (signed in with its own email code) so it
// never shares a rotating refresh token with the web app.

export class AuthError extends Error {}

async function readError(res) {
  try {
    const j = await res.json();
    return j.msg || j.message || j.error_description || j.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function headers(config, token) {
  const h = { apikey: config.anonKey, "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function requestOtp(config, email) {
  const res = await fetch(`${config.url}/auth/v1/otp`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ email, create_user: false }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

function toAuth(j) {
  const expiresAt = j.expires_at ?? Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600);
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: expiresAt, email: j.user?.email ?? null, user_id: j.user?.id ?? null };
}

export async function verifyOtp(config, email, token) {
  const res = await fetch(`${config.url}/auth/v1/verify`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ type: "email", email, token }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return toAuth(await res.json());
}

export async function refresh(config, auth) {
  const res = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ refresh_token: auth.refresh_token }),
  });
  if (res.status === 400 || res.status === 401) throw new AuthError(await readError(res));
  if (!res.ok) throw new Error(await readError(res));
  return { ...toAuth(await res.json()), email: auth.email };
}

export async function signOut(config, auth) {
  await fetch(`${config.url}/auth/v1/logout?scope=local`, { method: "POST", headers: headers(config, auth.access_token) }).catch(() => {});
}

/**
 * Call a Postgres function. `getAuth`/`saveAuth` let the caller persist rotated
 * tokens. Refreshes when the token is near expiry or the server says 401.
 */
export async function rpc(config, getAuth, saveAuth, fn, args = {}) {
  let auth = await getAuth();
  if (!auth) throw new AuthError("not signed in");
  if (auth.expires_at - 60 < Date.now() / 1000) {
    auth = await refresh(config, auth);
    await saveAuth(auth);
  }
  const call = (token) =>
    fetch(`${config.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: headers(config, token), body: JSON.stringify(args) });
  let res = await call(auth.access_token);
  if (res.status === 401) {
    auth = await refresh(config, auth);
    await saveAuth(auth);
    res = await call(auth.access_token);
  }
  if (!res.ok) throw new Error(await readError(res));
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
