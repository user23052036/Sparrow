// Pure logic for the delete-account Edge Function, with the Supabase clients injected so it
// can be unit-tested with `node --test` (no Deno needed). See DECISIONS D20.

export interface StorageEntry {
  name: string;
  isFolder: boolean;
}
export interface ProofStorage {
  list(prefix: string, limit: number, offset: number): Promise<StorageEntry[]>;
  remove(paths: string[]): Promise<void>;
}
export interface UserAdmin {
  deleteUser(userId: string): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 100;
const MAX_DEPTH = 3;

async function collect(storage: ProofStorage, prefix: string, depth: number): Promise<string[]> {
  const files: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await storage.list(prefix, PAGE, offset);
    for (const e of page) {
      const path = `${prefix}/${e.name}`;
      if (!e.isFolder) files.push(path);
      else if (depth < MAX_DEPTH) files.push(...(await collect(storage, path, depth + 1)));
      else throw new Error("proof folder is nested too deeply to delete safely");
    }
    if (page.length < PAGE) return files;
  }
}

/**
 * Removes every proof photo under `<userId>/`, checks none are left, then deletes the user
 * (the database cascades everything else). Photos go first: if the second step fails the
 * person can simply try again, whereas the reverse order could leave photos nobody owns.
 */
export async function deleteAccount(userId: string, storage: ProofStorage, admin: UserAdmin): Promise<{ removedFiles: number }> {
  // An empty or odd id would make the listing prefix match other people's folders.
  if (!UUID.test(userId)) throw new Error("invalid user id");
  const files = await collect(storage, userId, 0);
  for (let i = 0; i < files.length; i += PAGE) await storage.remove(files.slice(i, i + PAGE));
  const left = await collect(storage, userId, 0);
  if (left.length > 0) throw new Error(`${left.length} photo(s) could not be removed; nothing else was deleted`);
  await admin.deleteUser(userId);
  return { removedFiles: files.length };
}
