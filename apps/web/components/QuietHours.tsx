"use client";
import { useState } from "react";
import { copy, quietTime } from "@sparrow/shared";

type Hours = { from: string; to: string } | null;

/**
 * The key holder's quiet hours (D43): requests and shared proofs don't notify them in between.
 * `save` stores the times (both null switches quiet hours off) and answers an error sentence, or null.
 * Remount it (a `key`) when the stored hours change elsewhere.
 */
export function QuietHours({
  name,
  initial,
  save,
}: {
  name: string;
  initial: Hours;
  save: (from: string | null, to: string | null) => Promise<string | null>;
}) {
  const [current, setCurrent] = useState<Hours>(initial);
  const [from, setFrom] = useState(initial?.from ?? "22:00");
  const [to, setTo] = useState(initial?.to ?? "07:00");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(next: Hours) {
    setErr(null);
    if (next && (!quietTime(next.from) || !quietTime(next.to) || next.from === next.to)) {
      setErr(copy.fatigue.needBoth);
      return;
    }
    setBusy(true);
    const e = await save(next?.from ?? null, next?.to ?? null);
    setBusy(false);
    if (e) setErr(e);
    else setCurrent(next);
  }

  return (
    <section className="panel stack" aria-label={copy.fatigue.quietTitle}>
      <h3 style={{ margin: 0 }}>{copy.fatigue.quietTitle}</h3>
      <p className="quiet" style={{ margin: 0 }}>
        {copy.fatigue.quietBody(name)}
      </p>
      <p className="small" role="status" style={{ margin: 0 }}>
        {current ? copy.fatigue.saved(current.from, current.to) : copy.fatigue.none}
      </p>
      <div className="row">
        <label>
          {copy.fatigue.from} <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {copy.fatigue.to} <input type="time" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button type="button" disabled={busy} onClick={() => run({ from, to })}>
          {copy.fatigue.save}
        </button>
        {current && (
          <button type="button" className="ghost" disabled={busy} onClick={() => run(null)}>
            {copy.fatigue.turnOff}
          </button>
        )}
      </div>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}
