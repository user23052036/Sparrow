// Edge Function: delete the signed-in user's account and everything in it.
// Deploy: supabase functions deploy delete-account   (JWT verification stays ON, the default)
// The user id comes from the verified access token, never from the request body.
import { createClient } from "npm:@supabase/supabase-js@2";
import { deleteAccount } from "./logic.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data, error } = await asUser.auth.getUser();
  if (error || !data.user) return json(401, { error: "Please sign in again, then try once more." });

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== true) return json(400, { error: "Deleting an account needs an explicit confirmation." });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const proofs = admin.storage.from("proofs");
  try {
    const result = await deleteAccount(
      data.user.id,
      {
        async list(prefix, limit, offset) {
          const { data: rows, error: e } = await proofs.list(prefix, { limit, offset });
          if (e) throw e;
          return (rows ?? []).map((r) => ({ name: r.name, isFolder: r.id === null }));
        },
        async remove(paths) {
          const { error: e } = await proofs.remove(paths);
          if (e) throw e;
        },
      },
      {
        async deleteUser(id) {
          const { error: e } = await admin.auth.admin.deleteUser(id);
          if (e) throw e;
        },
      },
    );
    return json(200, { deleted: true, ...result });
  } catch (e) {
    console.error("delete-account", e);
    return json(500, { error: "We couldn't finish deleting your account. Nothing was lost; please try again." });
  }
});
