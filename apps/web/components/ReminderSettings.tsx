"use client";
import { useState } from "react";
import { copy, type Profile } from "@sparrow/shared";
import { useAuth } from "@/lib/auth";
import { supabase, errorText } from "@/lib/supabase";

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

/** Morning and evening reminder times (T2.2). Off by default; the server sends at most two a day. */
export function ReminderSettings() {
  const { profile } = useAuth();
  return profile ? <ReminderForm profile={profile} /> : null;
}

function ReminderForm({ profile }: { profile: Profile }) {
  const { session, refreshProfile } = useAuth();
  const [morning, setMorning] = useState(hhmm(profile.remind_morning));
  const [evening, setEvening] = useState(hhmm(profile.remind_evening));
  const [morningOn, setMorningOn] = useState(!!profile.remind_morning);
  const [eveningOn, setEveningOn] = useState(!!profile.remind_evening);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase()
      .from("profiles")
      .update({ remind_morning: morningOn && morning ? morning : null, remind_evening: eveningOn && evening ? evening : null })
      .eq("id", session.user.id);
    setBusy(false);
    if (error) {
      setMsg(errorText(error));
      return;
    }
    setMsg(copy.push.remindSaved);
    await refreshProfile();
  }

  const row = (label: string, on: boolean, setOn: (v: boolean) => void, value: string, setValue: (v: string) => void, fallback: string, id: string) => (
    <div className="row">
      <label className="check" style={{ padding: 0 }}>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            if (e.target.checked && !value) setValue(fallback);
          }}
        />
        {label}
      </label>
      <input
        id={id}
        type="time"
        aria-label={copy.push.remindAt(label)}
        value={value}
        disabled={!on}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: "auto" }}
      />
    </div>
  );

  return (
    <form onSubmit={save} className="panel stack" aria-label={copy.push.remindTitle}>
      <h3 style={{ margin: 0 }}>{copy.push.remindTitle}</h3>
      <p className="quiet" style={{ margin: 0 }}>
        {copy.push.remindBody}
      </p>
      {row(copy.push.remindMorning, morningOn, setMorningOn, morning, setMorning, "08:00", "remind-morning")}
      {row(copy.push.remindEvening, eveningOn, setEveningOn, evening, setEvening, "20:30", "remind-evening")}
      <div>
        <button disabled={busy}>{copy.push.remindSave}</button>
      </div>
      {msg && (
        <p className="small quiet" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}
