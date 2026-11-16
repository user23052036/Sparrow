"use client";
import { useEffect, useState } from "react";
import { copy, type Profile } from "@sparrow/shared";
import { useAuth } from "@/lib/auth";
import { supabase, errorText } from "@/lib/supabase";

type Keep = 7 | 30 | 90 | null;
const CHOICES: Keep[] = [null, 90, 30, 7];

/** How long proofs are kept (T4.2, D48). A shorter time removes older proofs within minutes, so it asks first. */
export function ProofRetention() {
  const { profile } = useAuth();
  return profile ? <RetentionForm profile={profile} /> : null;
}

/** Shorter than before (or a limit where there was none): older proofs will go. */
const shortens = (from: Keep, to: Keep) => to !== null && (from === null || to < from);

function RetentionForm({ profile }: { profile: Profile }) {
  const { session, refreshProfile } = useAuth();
  const saved = (profile.proof_keep_days ?? null) as Keep;
  const [choice, setChoice] = useState<Keep>(saved);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // A choice saved elsewhere (another tab, another device) replaces the one shown.
  useEffect(() => setChoice(saved), [saved]);

  async function save() {
    if (!session) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase().from("profiles").update({ proof_keep_days: choice }).eq("id", session.user.id);
    setBusy(false);
    setConfirming(false);
    if (error) {
      setMsg(errorText(error));
      return;
    }
    setMsg(copy.retention.saved);
    await refreshProfile();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (shortens(saved, choice) && !confirming) setConfirming(true);
    else void save();
  }

  return (
    <form onSubmit={submit} className="panel stack" aria-label={copy.retention.title}>
      <h3 style={{ margin: 0 }}>{copy.retention.title}</h3>
      <p className="quiet" style={{ margin: 0 }}>
        {copy.retention.body}
      </p>
      <fieldset style={{ border: "none", padding: 0, margin: 0 }} aria-label={copy.retention.title}>
        {CHOICES.map((k) => (
          <label key={String(k)} className="check" style={{ padding: "0.2rem 0" }}>
            <input
              type="radio"
              name="keep"
              checked={choice === k}
              onChange={() => {
                setChoice(k);
                setConfirming(false);
                setMsg(null);
              }}
            />
            {k === null ? copy.retention.forever : copy.retention.days(k)}
          </label>
        ))}
      </fieldset>
      {confirming && choice !== null ? (
        <div className="note stack" role="alert">
          <p style={{ margin: 0 }}>{copy.retention.confirm(choice)}</p>
          <div className="row">
            <button className="primary" disabled={busy}>
              {copy.retention.confirmYes}
            </button>
            <button type="button" className="ghost" onClick={() => setConfirming(false)}>
              {copy.retention.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button disabled={busy || choice === saved}>{copy.retention.save}</button>
        </div>
      )}
      {msg && (
        <p className="small quiet" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}
