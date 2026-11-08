import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
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
