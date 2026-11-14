"use client";
import { useState } from "react";
import { copy, KIND_ACT_POINTS } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";

export function KindAct({ planId, done, reload }: { planId: string; done: boolean; reload: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (done)
    return (
      <p className="note" role="status">
        {copy.today.kindThanks}
      </p>
    );
  async function log() {
    setBusy(true);
    const { error } = await supabase().rpc("log_kind_act", { p_plan_id: planId, p_note: note.trim() || null });
    setBusy(false);
    if (error) setErr(errorText(error));
    else reload();
  }
  return (
    <div className="note stack">
      <h3 style={{ margin: 0 }}>{copy.today.kindTitle}</h3>
      <p style={{ margin: 0 }}>{copy.today.kindBody}</p>
      <div>
        <label htmlFor="kind-note">{copy.today.kindLabel}</label>
        <input id="kind-note" value={note} maxLength={200} placeholder={copy.today.kindPlaceholder} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div>
        <button type="button" disabled={busy} onClick={log}>
          {copy.today.kindBtn(KIND_ACT_POINTS)}
        </button>
      </div>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
