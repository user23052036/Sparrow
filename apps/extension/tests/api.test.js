import { test } from "node:test";
import assert from "node:assert/strict";
import { signInWithPassword } from "../lib/api.js";

const config = { url: "https://example.supabase.co", anonKey: "pk_test" };

function mockFetch(status, body, seen) {
  globalThis.fetch = async (url, init) => {
    seen.url = url;
    seen.init = init;
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
}

test("signInWithPassword posts to the password grant and maps the session", async () => {
  const seen = {};
  mockFetch(200, { access_token: "a", refresh_token: "r", expires_at: 123, user: { id: "u1", email: "me@x.com" } }, seen);
  const auth = await signInWithPassword(config, "me@x.com", "hunter2hunter2");
  assert.equal(seen.url, "https://example.supabase.co/auth/v1/token?grant_type=password");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers.apikey, "pk_test");
  assert.deepEqual(JSON.parse(seen.init.body), { email: "me@x.com", password: "hunter2hunter2" });
  assert.deepEqual(auth, { access_token: "a", refresh_token: "r", expires_at: 123, email: "me@x.com", user_id: "u1" });
});

test("signInWithPassword surfaces the server's error message", async () => {
  mockFetch(400, { error_description: "Invalid login credentials" }, {});
  await assert.rejects(() => signInWithPassword(config, "me@x.com", "wrong"), /Invalid login credentials/);
});
