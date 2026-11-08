"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "@sparrow/shared";
import { useAuth } from "@/lib/auth";
import { supabase, errorText } from "@/lib/supabase";

const zones = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
};

export function ProfileForm({ mode }: { mode: "onboarding" | "settings" }) {
  const { profile, session, refreshProfile } = useAuth();
  const router = useRouter();
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [name, setName] = useState(profile?.display_name ?? "");
  const [tz, setTz] = useState(mode === "onboarding" ? detected : (profile?.timezone ?? detected));
  const [gentle, setGentle] = useState(profile?.gentle_mode ?? true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase()
      .from("profiles")
      .update({ display_name: name.trim() || null, timezone: tz, gentle_mode: gentle, onboarded: true })
      .eq("id", session!.user.id);
    setBusy(false);
    if (error) {
      setMsg(errorText(error));
      return;
    }
    await refreshProfile();
    if (mode === "onboarding") router.replace("/tasks?first=1");
    else setMsg(copy.settings.saved);
  }

  return (
    <form onSubmit={save} className="panel stack">
      <div>
        <label htmlFor="name">{copy.settings.name}</label>
        <input id="name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={copy.settings.namePlaceholder} />
      </div>
      <div>
        <label htmlFor="tz">{copy.settings.timezone}</label>
        <select id="tz" value={tz} onChange={(e) => setTz(e.target.value)}>
          {zones().map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <p className="small quiet">{copy.settings.timezoneHint}</p>
      </div>
      <div>
        <label className="check">
          <input type="checkbox" checked={gentle} onChange={(e) => setGentle(e.target.checked)} />
          {copy.settings.gentleMode}
        </label>
        <p className="small quiet">{gentle ? copy.gentleModeExplainer : copy.settings.gentleOff}</p>
      </div>
      <div className="row">
        <button className="primary" disabled={busy}>
          {mode === "onboarding" ? copy.settings.continue : copy.settings.save}
        </button>
        {mode === "settings" && (
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              await supabase().auth.signOut();
              router.replace("/");
            }}
          >
            {copy.settings.signOut}
          </button>
        )}
      </div>
      {msg && (
        <p className="note" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}
