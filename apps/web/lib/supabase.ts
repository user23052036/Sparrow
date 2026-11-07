"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

/** Lazily created so the app can build and show a setup message without env vars. */
export function supabase(): SupabaseClient {
  if (!isConfigured) throw new Error("Supabase is not configured. See apps/web/.env.example.");
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/** Turn a Supabase/Postgres error into a sentence a person can act on. */
export function errorText(e: unknown): string {
  if (!e) return "Something went wrong. Try again.";
  const msg = typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (/fetch|network/i.test(msg)) return "Can't reach Sparrow right now. Check your connection and try again.";
  return msg.charAt(0).toUpperCase() + msg.slice(1).replace(/\.$/, "") + ".";
}
