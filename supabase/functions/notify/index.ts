// Edge Function: Web Push for partner requests (D38, ROADMAP T2.1).
// GET  → { publicKey } so a browser can subscribe.
// POST { kind, ref } → the database (claim_push, migrations 0028 and 0030) decides, as the caller, who should hear
//      about that event; this function then sends to that person's (or guest's) browsers with VAPID.
// POST { kind: "key_answer", ref, key } → a guest partner (D39) answered; claim_guest_push checks their key.
// POST { kind: "key_answer", ref, device: { id, secret } } → a key holder answered from their phone (D46, 0032).
// POST { kind: "session_started" | "session_ended", ref } → wakes the caller's own extensions with a silent push (D44, 0036).
// JWT verification stays on (a guest's page sends the public anon key).
// Secrets (set by .github/workflows/deploy-db.yml on first deploy): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { isRefusal, notify, parseRequest, type Recipient } from "./logic.ts";

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
  const parsed = parseRequest(await req.json().catch(() => null));
  if (!parsed) return json(400, { error: "Unknown notification." });
  if (!parsed.guestKey && !parsed.device) {
    const { data: who, error: authError } = await asUser.auth.getUser();
    if (authError || !who.user) return json(401, { error: "Please sign in again, then try once more." });
  }

  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:sparrow@example.com", publicKey, privateKey);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // Extensions (silent) only ever get the empty wake-up push; everything else gets the notifications.
  const subscriptions = async (column: "user_id" | "guest_key_id", id: string, silent = false) => {
    const { data, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq(column, id).eq("silent", silent);
    if (error) throw error;
    return data ?? [];
  };
  let result;
  try {
    result = await notify(parsed.kind, parsed.ref, {
      async claim(kind, ref) {
        // A guest's claim is server-only (0030), so the owner's account id never reaches the guest's browser.
        const { data, error } = parsed.guestKey
          ? await admin.rpc("claim_guest_push", { p_key: parsed.guestKey, p_kind: kind, p_ref: ref })
          : parsed.device
            ? await admin.rpc("claim_device_push", { p_device_id: parsed.device.id, p_secret: parsed.device.secret, p_kind: kind, p_ref: ref })
            : await asUser.rpc("claim_push", { p_kind: kind, p_ref: ref });
        if (error) throw error;
        return (data as Recipient | null) ?? null;
      },
      subscriptionsOf: (userId) => subscriptions("user_id", userId),
      guestSubscriptionsOf: (guestId) => subscriptions("guest_key_id", guestId),
      extensionsOf: (userId) => subscriptions("user_id", userId, true),
      async send(sub, payload) {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600, urgency: "high" });
      },
      async remove(id) {
        await admin.from("push_subscriptions").delete().eq("id", id);
      },
    });
  } catch (e) {
    if (isRefusal(e)) {
      const why = parsed.guestKey
        ? "This key link isn't valid anymore."
        : parsed.device
          ? "This phone needs to sign in again."
          : "Please sign in again, then try once more.";
      return json(403, { error: why });
    }
    throw e;
  }
  return json(200, result);
});
