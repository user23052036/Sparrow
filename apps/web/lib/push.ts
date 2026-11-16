"use client";
import { supabase } from "./supabase";

/** Events that can reach the partner as a notification (D38); the server decides who, if anyone. */
export type PushKind = "key_request" | "key_answer" | "proof_shared";

/** Fire and forget: tells the server an event happened. Sparrow works the same when push is off or missing. */
export function notifyPartner(kind: PushKind, ref: string | null | undefined) {
  if (!ref) return;
  void supabase()
    .functions.invoke("notify", { body: { kind, ref } })
    .catch(() => {});
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** The service worker, or null when there is none (development builds register no worker). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** On for the signed-in person: this browser is subscribed and the saved row is theirs (RLS shows only own rows). */
export async function pushIsOnForMe(): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub) return false;
  const { data } = await supabase().from("push_subscriptions").select("id").eq("endpoint", sub.endpoint);
  return (data ?? []).length > 0;
}

export type TurnOnResult = "on" | "denied" | "unsupported" | "not-ready";
type Keys = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

/** Asks for permission and subscribes this browser with the server's key; saving it is up to the caller. */
async function subscribeBrowser(): Promise<Exclude<TurnOnResult, "on"> | Keys> {
  if (!pushSupported()) return "unsupported";
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  const reg = await registration();
  if (!reg) return "unsupported";
  const { data } = await supabase().functions.invoke("notify", { method: "GET" });
  const key = (data as { publicKey?: string | null } | null)?.publicKey;
  if (!key) return "not-ready";
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) });
  return sub.toJSON() as Keys;
}

export async function turnOnPush(): Promise<TurnOnResult> {
  const json = await subscribeBrowser();
  if (typeof json === "string") return json;
  const { error } = await supabase().rpc("save_push_subscription", { p_endpoint: json.endpoint, p_p256dh: json.keys?.p256dh, p_auth: json.keys?.auth });
  if (error) throw error;
  return "on";
}

// ------------------------------------------------------------ a guest partner's browser (D39), no account

/** Tells the server a guest answered a key request, so the owner hears about it. Fire and forget. */
export function notifyAsGuest(key: string, ref: string) {
  void supabase()
    .functions.invoke("notify", { body: { kind: "key_answer", ref, key } })
    .catch(() => {});
}

/** On for this guest: the browser is subscribed and the server has that address for this key (an account may have taken it since). */
export async function guestPushIsOn(key: string): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub) return false;
  const { data } = await supabase().rpc("guest_push_is_on", { p_key: key, p_endpoint: sub.endpoint });
  return data === true;
}

export async function turnOnGuestPush(key: string): Promise<TurnOnResult> {
  const json = await subscribeBrowser();
  if (typeof json === "string") return json;
  const { error } = await supabase().rpc("save_guest_push", { p_key: key, p_endpoint: json.endpoint, p_p256dh: json.keys?.p256dh, p_auth: json.keys?.auth });
  if (error) throw error;
  return "on";
}

/** Shown only while the server has this browser for the key, so this never switches off someone's account. */
export async function turnOffGuestPush(key: string): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => false);
  const { error } = await supabase().rpc("remove_guest_push", { p_key: key, p_endpoint: endpoint });
  if (error) throw error;
}

export async function turnOffPush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => false);
  const { error } = await supabase().rpc("remove_push_subscription", { p_endpoint: endpoint });
  if (error) throw error;
}
