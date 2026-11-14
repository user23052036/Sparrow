"use client";
import { useState } from "react";
import { copy, type MakeupStep } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";

export function MakeupPanel({ step, reload, onDone }: { step: MakeupStep; reload: () => void; onDone: (msg: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function settle(outcome: "done" | "let_go") {
    setBusy(true);
    setErr(null);
    const { error } = await supabase().rpc("settle_makeup_step", { p_id: step.id, p_outcome: outcome });
    setBusy(false);
    if (error) {
      setErr(errorText(error));
      return;
    }
    onDone(outcome === "done" ? copy.today.makeupThanks : null);
    reload();
  }
  return (
    <section className="note stack" aria-label={copy.today.makeupTitle}>
      <h3 style={{ margin: 0 }}>{copy.today.makeupTitle}</h3>
      <p style={{ margin: 0 }}>
        <strong>{step.title}</strong>
      </p>
      <p className="small" style={{ margin: 0 }}>
        {copy.today.makeupBody}
      </p>
      <div className="row">
        <button type="button" className="primary" disabled={busy} onClick={() => settle("done")}>
          {copy.today.makeupDone}
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => settle("let_go")}>
          {copy.today.makeupLetGo}
        </button>
      </div>
      <p className="small quiet" style={{ margin: 0 }}>
        {copy.today.makeupLetGoNote}
      </p>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}
