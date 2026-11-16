import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

export const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const isConfigured = Boolean(url && key);

export const supabase = createClient(url || "http://localhost", key || "missing", {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Only refresh tokens while the app is in the foreground (Supabase's RN guidance).
AppState.addEventListener("change", (s) => {
  if (s === "active") void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});

export function errorText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Something went wrong. Please try again.";
}

/** Fire and forget: tells the server a proof was shared, so the partner hears about it (D38). */
export function notifyPartner(kind: "proof_shared", ref: string | null | undefined) {
  if (!ref) return;
  void supabase.functions.invoke("notify", { body: { kind, ref } }).catch(() => {});
}

/**
 * A session started, or ended early: wakes the person's Sparrow extensions on their computers at once (D44)
 * instead of at their next 30-second check. Fire and forget; nothing is shown anywhere.
 */
export function notifyMyExtensions(kind: "session_started" | "session_ended", sessionId: string | null | undefined) {
  if (!sessionId) return;
  void supabase.functions.invoke("notify", { body: { kind, ref: sessionId } }).catch(() => {});
}
