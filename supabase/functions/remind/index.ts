// Edge Function: morning and evening reminders (D38, ROADMAP T2.2).
// Called every five minutes by the pg_cron job that configure_reminders() (migration 0029) schedules, with the
// job's own secret in `x-reminder-secret`. Deployed with --no-verify-jwt because pg_net sends no user token;
// the secret is the permission, checked by the database. Uses the same VAPID secrets as notify.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { runReminders } from "./logic.ts";

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
  const result = await runReminders({
    async claimDue() {
      const { data, error } = await admin.rpc("claim_due_reminders");
      if (error) throw error;
      return data ?? [];
    },
    async subscriptionsOf(userId) {
      const { data, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
      if (error) throw error;
      return data ?? [];
    },
    async send(sub, payload) {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 1800 });
    },
    async remove(id) {
      await admin.from("push_subscriptions").delete().eq("id", id);
    },
  });
  return json(200, result);
});
