// Edge Function: morning and evening reminders (D38, ROADMAP T2.2), key requests that waited through the key
// holder's quiet hours (D43, ROADMAP T2.4), and proofs past their owner's chosen time (D48, ROADMAP T4.2).
// Called every five minutes by the pg_cron job that configure_reminders() (migration 0029) schedules, with the
// job's own secret in `x-reminder-secret`. Deployed with --no-verify-jwt because pg_net sends no user token;
// the secret is the permission, checked by the database. Uses the same VAPID secrets as notify.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { runReminders, runRetention, runWaitingKeyRequests } from "./logic.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: ok } = await admin.rpc("reminder_secret_ok", { p_secret: req.headers.get("x-reminder-secret") ?? "" });
  if (ok !== true) return json(401, { error: "Not the reminder job." });

  // Proof retention needs no notifications, so it runs first and on its own (files first, then rows: D20, D48).
  const retention = await runRetention({
    async claimExpired() {
      const { data, error } = await admin.rpc("claim_expired_proofs", { p_limit: 200 });
      if (error) throw error;
      return data ?? [];
    },
    async removeFiles(paths) {
      const { error } = await admin.storage.from("proofs").remove(paths);
      if (error) throw error;
    },
    async deleteRows(ids) {
      const { data, error } = await admin.rpc("delete_expired_proofs", { p_ids: ids });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  }).catch((e) => ({ error: String(e) }));

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return json(200, { retention, reminders: "Notifications aren't set up on this server yet." });

  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:sparrow@example.com", publicKey, privateKey);
  // Never the extensions' silent addresses (0036): they only wake up, they show nothing.
  const subscriptions = async (column: "user_id" | "guest_key_id", id: string) => {
    const { data, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq(column, id).eq("silent", false);
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
  // Each part runs even when the other one fails, so a reminder problem never holds key requests back.
  const reminders = await runReminders({
    ...delivery,
    async claimDue() {
      const { data, error } = await admin.rpc("claim_due_reminders");
      if (error) throw error;
      return data ?? [];
    },
  }).catch((e) => ({ error: String(e) }));
  const keyRequests = await runWaitingKeyRequests({
    ...delivery,
    guestSubscriptionsOf: (guestId) => subscriptions("guest_key_id", guestId),
    async claimWaiting() {
      const { data, error } = await admin.rpc("claim_waiting_key_requests");
      if (error) throw error;
      return data ?? [];
    },
  }).catch((e) => ({ error: String(e) }));
  return json(200, { retention, reminders, key_requests: keyRequests });
});
