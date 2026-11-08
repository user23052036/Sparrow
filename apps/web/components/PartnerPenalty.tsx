"use client";
import { useCallback, useEffect, useState } from "react";
import { copy, CURRENCY_SYMBOL, type PenaltyStatus } from "@sparrow/shared";
import { errorText, supabase } from "@/lib/supabase";

/** Mutual opt-in for the practice partner pledge (D25). Nobody sees the other's amounts. */
export function PartnerPenalty({ name }: { name: string }) {
  const [s, setS] = useState<PenaltyStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase().rpc("penalty_status");
    setS((data as PenaltyStatus) ?? null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!s || s.state !== "active") return null;

  async function toggle(on: boolean) {
    setBusy(true);
    setErr(null);
    if (s?.state === "active") setS({ ...s, mine: on, on: on && s.theirs }); // flip right away; the server answer follows
    const { error } = await supabase().rpc("set_penalty_optin", { p_on: on });
    setBusy(false);
    if (error) setErr(errorText(error));
    await load();
  }

  return (
    <div className="panel stack">
      <h3>{copy.partnerPenalty.title}</h3>
      <p className="small quiet">{copy.partnerPenalty.explain(name)}</p>
      <label className="check">
        <input type="checkbox" checked={s.mine} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
        {copy.partnerPenalty.agree}
      </label>
      <p className="small" role="status">
        {s.on ? copy.partnerPenalty.on : s.mine ? copy.partnerPenalty.waiting(name) : copy.partnerPenalty.off}
      </p>
      {s.practice_total_30d > 0 && <p className="small quiet">{copy.partnerPenalty.total(CURRENCY_SYMBOL, s.practice_total_30d)}</p>}
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
