"use client";
import { useEffect, useState } from "react";
import { copy } from "@sparrow/shared";
import { clock } from "@/lib/format";

/** "Start now" timer for a single small step. Purely local; nothing is penalised. */
export function StepTimer({ minutes, onDone, onCancel }: { minutes: number; onDone: () => void; onCancel: () => void }) {
  const [end] = useState(() => Date.now() + minutes * 60000);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const left = end - now;
  return (
    <div className="row" aria-live="polite">
      <span className="timer" style={{ fontSize: "var(--step-1)" }}>{left > 0 ? clock(left) : copy.timer.timesUp}</span>
      <button type="button" className="primary" onClick={onDone}>{copy.timer.markDone}</button>
      <button type="button" className="ghost" onClick={onCancel}>{copy.timer.stop}</button>
    </div>
  );
}
