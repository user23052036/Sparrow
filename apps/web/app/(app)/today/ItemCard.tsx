"use client";
import { useState } from "react";
import Link from "next/link";
import { copy, ifThenLine, type ItemStatus, type PlanItem, type Task, type TaskStep } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";
import { StepTimer } from "@/components/StepTimer";
import { ProofCapture } from "@/components/ProofCapture";

export function ItemCard({
  item,
  task,
  steps,
  date,
  proofs,
  userId,
  reload,
  verdict,
  partnerName,
}: {
  item: PlanItem;
  task: Task;
  steps: TaskStep[];
  date: string;
  proofs: number;
  userId: string;
  reload: () => void;
  verdict?: { verdict: string; comment: string | null };
  partnerName: string | null;
}) {
  const [timerFor, setTimerFor] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // What saving a proof had to say (e.g. "looks like an earlier photo"); kept here because the capture form goes away once a proof exists.
  const [proofNote, setProofNote] = useState<string | null>(null);
  const sb = supabase();

  async function setStatus(s: ItemStatus) {
    const { error } = await sb.rpc("set_item_status", { p_item_id: item.id, p_status: s });
    if (error) setErr(errorText(error));
    else reload();
  }
  async function stepDone(stepId: string, done: boolean) {
    const { error } = await sb
      .from("task_steps")
      .update({ done_on: done ? date : null })
      .eq("id", stepId);
    setTimerFor(null);
    if (error) setErr(errorText(error));
    else reload();
  }
  const nextStep = steps.find((s) => s.done_on !== date);
  const label: Record<ItemStatus, string> = copy.today.status;

  return (
    <li className="item stack">
      <div className="spread">
        <h3 style={{ margin: 0 }}>{task.title}</h3>
        <span className={`small ${item.status === "done" ? "status-done" : ""}`}>{label[item.status]}</span>
      </div>
      {ifThenLine(task) && <p className="small quiet">{ifThenLine(task)}</p>}
      {steps.length > 0 && (
        <ul className="steps">
          {steps.map((s) => (
            <li key={s.id} className={s.done_on === date ? "done" : ""}>
              <label className="check" style={{ padding: 0 }}>
                <input type="checkbox" checked={s.done_on === date} onChange={(e) => stepDone(s.id, e.target.checked)} />
                <span>{s.title}</span>
              </label>
              {s.done_on !== date && timerFor !== s.id && (
                <button type="button" className="ghost" onClick={() => setTimerFor(s.id)}>
                  {copy.today.startNow}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {timerFor && (
        <StepTimer
          minutes={steps.find((s) => s.id === timerFor)?.est_minutes ?? 5}
          onDone={() => stepDone(timerFor, true)}
          onCancel={() => setTimerFor(null)}
        />
      )}
      {!timerFor && steps.length === 0 && item.status === "pending" && <p className="small quiet">{copy.today.stepTip}</p>}
      <div className="row">
        <button type="button" aria-pressed={item.status === "done"} onClick={() => setStatus("done")}>
          {copy.today.done}
        </button>
        <button type="button" aria-pressed={item.status === "partial"} onClick={() => setStatus("partial")}>
          {copy.today.partly}
        </button>
        <Link className="button ghost" href={`/focus?item=${item.id}`}>
          {copy.today.focusOnThis}
        </Link>
        {nextStep && !timerFor && <span className="small quiet">{copy.today.nextStep(nextStep.title)}</span>}
      </div>
      {(item.status === "done" || item.status === "partial" || task.proof_required) &&
        (proofs > 0 ? (
          <p className="small status-done">{copy.today.proofsSaved(proofs)}</p>
        ) : (
          <ProofCapture
            itemId={item.id}
            userId={userId}
            onSaved={(note) => {
              setProofNote(note);
              reload();
            }}
            partnerName={partnerName}
          />
        ))}
      {proofNote && proofs > 0 && (
        <p className="note small" role="status">
          {proofNote}
        </p>
      )}
      {verdict && partnerName && (
        <p className="note small" role="status">
          {verdict.verdict === "approve"
            ? copy.today.partnerApproves(partnerName)
            : copy.today.partnerAsked(partnerName, verdict.comment ?? copy.today.partnerAskedFallback)}
        </p>
      )}
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </li>
  );
}
