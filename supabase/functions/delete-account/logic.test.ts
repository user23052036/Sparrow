import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deleteAccount, type ProofStorage, type StorageEntry } from "./logic.ts";

const UID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

/** In-memory bucket keyed by full path. */
function bucket(paths: string[], opts: { stubborn?: string[]; failList?: boolean } = {}) {
  const store = new Set(paths);
  const removed: string[] = [];
  const storage: ProofStorage = {
    async list(prefix, limit, offset) {
      if (opts.failList) throw new Error("storage down");
      const seen = new Map<string, StorageEntry>();
      for (const p of [...store].sort()) {
        if (!p.startsWith(prefix + "/")) continue;
        const rest = p.slice(prefix.length + 1).split("/");
        seen.set(rest[0], { name: rest[0], isFolder: rest.length > 1 });
      }
      return [...seen.values()].slice(offset, offset + limit);
    },
    async remove(ps) {
      for (const p of ps) {
        removed.push(p);
        if (!opts.stubborn?.includes(p)) store.delete(p);
      }
    },
  };
  return { storage, store, removed };
}
function admin() {
  const deleted: string[] = [];
  return {
    admin: {
      async deleteUser(id: string) {
        deleted.push(id);
      },
    },
    deleted,
  };
}

describe("deleteAccount", () => {
  it("removes all of the user's photos across pages, then the user", async () => {
    const mine = Array.from({ length: 250 }, (_, i) => `${UID}/p${i}.jpg`);
    const b = bucket([...mine, `${OTHER}/keep.jpg`]);
    const a = admin();
    const r = await deleteAccount(UID, b.storage, a.admin);
    assert.equal(r.removedFiles, 250);
    assert.deepEqual([...b.store], [`${OTHER}/keep.jpg`]);
    assert.deepEqual(a.deleted, [UID]);
  });

  it("never touches another user's folder with a similar prefix", async () => {
    const b = bucket([`${UID}/a.jpg`, `${UID}x/b.jpg`]);
    await deleteAccount(UID, b.storage, admin().admin);
    assert.deepEqual([...b.store], [`${UID}x/b.jpg`]);
  });

  it("follows sub-folders", async () => {
    const b = bucket([`${UID}/a.jpg`, `${UID}/old/b.jpg`]);
    const r = await deleteAccount(UID, b.storage, admin().admin);
    assert.equal(r.removedFiles, 2);
    assert.equal(b.store.size, 0);
  });

  it("deletes a user who never uploaded anything", async () => {
    const a = admin();
    const r = await deleteAccount(UID, bucket([]).storage, a.admin);
    assert.equal(r.removedFiles, 0);
    assert.deepEqual(a.deleted, [UID]);
  });

  it("keeps the account if a photo cannot be removed", async () => {
    const b = bucket([`${UID}/a.jpg`, `${UID}/b.jpg`], { stubborn: [`${UID}/b.jpg`] });
    const a = admin();
    await assert.rejects(deleteAccount(UID, b.storage, a.admin), /could not be removed/);
    assert.deepEqual(a.deleted, []);
  });

  it("keeps the account if storage cannot be listed", async () => {
    const a = admin();
    await assert.rejects(deleteAccount(UID, bucket([], { failList: true }).storage, a.admin), /storage down/);
    assert.deepEqual(a.deleted, []);
  });

  it("rejects ids that could match other folders", async () => {
    for (const bad of ["", "/", "../x", "*", UID + "/", "not-a-uuid"]) {
      const b = bucket([`${OTHER}/keep.jpg`]);
      const a = admin();
      await assert.rejects(deleteAccount(bad, b.storage, a.admin), /invalid user id/);
      assert.equal(b.store.size, 1);
      assert.deepEqual(a.deleted, []);
    }
  });
});
