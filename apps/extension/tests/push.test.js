import { test } from "node:test";
import assert from "node:assert/strict";
import { base64UrlToBytes, PUSH_REFRESH_MS, PUSH_RETRY_MS, pushNeedsSaving, pushOwner, sameKey } from "../lib/push.js";

test("the server key is decoded from base64url", () => {
  const bytes = Buffer.from([0, 251, 255, 62, 63, 1, 2]);
  assert.deepEqual([...base64UrlToBytes(bytes.toString("base64url"))], [...bytes]);
});

test("the push address belongs to the account the extension is signed in as", () => {
  assert.equal(pushOwner({ user_id: "u1", email: "me@x.com" }), "u1");
  assert.equal(pushOwner({ email: "me@x.com" }), "me@x.com");
  assert.equal(pushOwner(null), null);
});

test("saved once per account; after a try that did not work, again only after a while", () => {
  const now = Date.now();
  assert.equal(pushNeedsSaving(null, "u1", now), true);
  const saved = { owner: "u1", endpoint: "https://fcm.googleapis.com/x", savedAt: now - 1000 };
  assert.equal(pushNeedsSaving(saved, "u1", now), false);
  assert.equal(pushNeedsSaving({ ...saved, owner: "u0" }, "u1", now), true, "someone else signed in");
  assert.equal(pushNeedsSaving({ ...saved, savedAt: now - PUSH_REFRESH_MS }, "u1", now), true, "checked again after a day");
  assert.equal(pushNeedsSaving({ owner: "u1", triedAt: now - 1000 }, "u1", now), false);
  assert.equal(pushNeedsSaving({ owner: "u1", triedAt: now - PUSH_RETRY_MS }, "u1", now), true);
  assert.equal(pushNeedsSaving(null, null, now), false, "not signed in: nothing to save");
});

test("a subscription is reused only with the same server key", () => {
  const key = new Uint8Array([1, 2, 3]);
  assert.equal(sameKey(new Uint8Array([1, 2, 3]).buffer, key), true);
  assert.equal(sameKey(new Uint8Array([1, 2, 4]).buffer, key), false);
  assert.equal(sameKey(null, key), false);
});
