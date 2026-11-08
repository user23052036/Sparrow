/**
 * Voice-note proofs (D27). Limits mirror supabase/migrations/0018_voice_proofs.sql:
 * at most 60 seconds (database check) and kept well under the bucket's size limit.
 */
export const MAX_VOICE_SECONDS = 60;
export const MAX_VOICE_BYTES = 1024 * 1024;
/** Opus at this rate is clear for speech: 60 s is about 240 KB. */
export const VOICE_BITS_PER_SECOND = 32_000;

/** In order of preference. Chrome/Edge/Firefox record webm or ogg, Safari records mp4. */
export const VOICE_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"] as const;

/** The types the storage bucket accepts (no codec parameters). */
export const VOICE_STORAGE_TYPES = ["audio/webm", "audio/ogg", "audio/mp4"] as const;

export function pickVoiceMime(isSupported: (type: string) => boolean): string | null {
  return VOICE_MIME_CANDIDATES.find((t) => isSupported(t)) ?? null;
}

/** "audio/webm;codecs=opus" -> "audio/webm". Returns null for anything the bucket would refuse. */
export function storageType(mime: string): (typeof VOICE_STORAGE_TYPES)[number] | null {
  const base = mime.split(";")[0].trim().toLowerCase();
  return (VOICE_STORAGE_TYPES as readonly string[]).includes(base) ? (base as (typeof VOICE_STORAGE_TYPES)[number]) : null;
}

export function voiceExtension(mime: string): "webm" | "ogg" | "m4a" {
  const t = storageType(mime);
  return t === "audio/ogg" ? "ogg" : t === "audio/mp4" ? "m4a" : "webm";
}

/** Whole seconds for the database (1..60). A tap that records nothing still counts as one second. */
export function voiceSeconds(ms: number): number {
  return Math.max(1, Math.min(MAX_VOICE_SECONDS, Math.round(ms / 1000)));
}

/** "0:07" style label. */
export function clockLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
