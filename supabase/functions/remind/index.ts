// Edge Function: morning and evening reminders (D38, ROADMAP T2.2), and key requests that waited through the key
// holder's quiet hours (D43, ROADMAP T2.4).
// Called every five minutes by the pg_cron job that configure_reminders() (migration 0029) schedules, with the
// job's own secret in `x-reminder-secret`. Deployed with --no-verify-jwt because pg_net sends no user token;
// the secret is the permission, checked by the database. Uses the same VAPID secrets as notify.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { runReminders, runWaitingKeyRequests } from "./logic.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return json(503, { error: "Notifications aren't set up on this server yet." });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: ok } = await admin.rpc("reminder_secret_ok", { p_secret: req.headers.get("x-reminder-secret") ?? "" });
  if (ok !== true) return json(401, { error: "Not the reminder job." });

  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:sparrow@example.com", publicKey, privateKey);
  const subscriptions = async (column: "user_id" | "guest_key_id", id: string) => {
    const { data, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq(column, id);
    if (error) throw error;
    return data ?? [];
  };
  const delivery = {
    subscriptionsOf: (userId: string) => subscriptions("user_id", userId),
    async send(sub: { endpoint: string; p256dh: string; auth: string }, payload: string) {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 1800 });
    },
    async remove(id: string) {
      await admin.from("push_subscriptions").delete().eq("id", id);
    },
  };
  const reminders = await runReminders({
    ...delivery,
    async claimDue() {
      const { data, error } = await admin.rpc("claim_due_reminders");
      if (error) throw error;
      return data ?? [];
    },
  });
  const keyRequests = await runWaitingKeyRequests({
    ...delivery,
    guestSubscriptionsOf: (guestId) => subscriptions("guest_key_id", guestId),
    async claimWaiting() {
      const { data, error } = await admin.rpc("claim_waiting_key_requests");
      if (error) throw error;
      return data ?? [];
    },
  });
  return json(200, { reminders, key_requests: keyRequests });
});
