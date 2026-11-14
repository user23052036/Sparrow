// Edge Function: Web Push for partner requests (D38, ROADMAP T2.1).
// GET  → { publicKey } so a browser can subscribe.
// POST { kind, ref } → the database (claim_push, migration 0028) decides, as the caller, who should hear about
//      that event; this function then sends to that person's browsers with VAPID. JWT verification stays on.
// Secrets (set by .github/workflows/deploy-db.yml on first deploy): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { notify, parseRequest } from "./logic.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (req.method === "GET") return json(200, { publicKey: publicKey ?? null });
  if (req.method !== "POST") return json(405, { error: "Use GET or POST." });
  if (!publicKey || !privateKey) return json(503, { error: "Notifications aren't set up on this server yet." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: who, error: authError } = await asUser.auth.getUser();
  if (authError || !who.user) return json(401, { error: "Please sign in again, then try once more." });
  const parsed = parseRequest(await req.json().catch(() => null));
  if (!parsed) return json(400, { error: "Unknown notification." });

  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:sparrow@example.com", publicKey, privateKey);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const result = await notify(parsed.kind, parsed.ref, {
    async claim(kind, ref) {
      const { data, error } = await asUser.rpc("claim_push", { p_kind: kind, p_ref: ref });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    async subscriptionsOf(userId) {
      const { data, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
      if (error) throw error;
      return data ?? [];
    },
    async send(sub, payload) {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600, urgency: "high" });
    },
    async remove(id) {
      await admin.from("push_subscriptions").delete().eq("id", id);
    },
  });
  return json(200, result);
});
