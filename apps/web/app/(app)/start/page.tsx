"use client";
import { useState } from "react";
import Link from "next/link";
import { copy, type DailyPlan, type Task, type TaskStep } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";
import { StepTimer } from "@/components/StepTimer";

type Stage = "task" | "split" | "try" | "key";
const STAGE_NUMBER: Record<Stage, number> = { task: 1, split: 2, try: 3, key: 4 };

/**
 * The guided first day (ROADMAP T1.4), shown once after the profile form: add one task, split
 * it into a five-minute step (which plans today with that task), run the step, then offer to
 * invite someone to hold the key. Every stage writes through the same tables and RPCs as the
 * rest of the app, so leaving half way keeps what was done.
 */
export default function Start() {
  const [stage, setStage] = useState<Stage>("task");
  const [task, setTask] = useState<Task | null>(null);
  const [step, setStep] = useState<TaskStep | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [timing, setTiming] = useState(false);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void guard(async () => {
      const { data, error } = await supabase().from("tasks").insert({ title: text.trim() }).select().single();
      if (error) throw error;
      setTask(data as Task);
      setText("");
      setStage("split");
    });
  };

  const addStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !task) return;
    void guard(async () => {
      const sb = supabase();
      const s = await sb.from("task_steps").insert({ task_id: task.id, title: text.trim(), est_minutes: 5, position: 0 }).select().single();
      if (s.error) throw s.error;
      setStep(s.data as TaskStep);
      // Plan today with this one task, so the step shows on Today as well.
      const today = await sb.rpc("get_today");
      if (today.error) throw today.error;
      const plan = today.data as DailyPlan;
      setDate(plan.date);
      if (!plan.committed_at) {
        const c = await sb.rpc("commit_day", { p_task_ids: [task.id], p_mood: null, p_stake: 0, p_micro: false });
        if (c.error) throw c.error;
      }
      setText("");
      setStage("try");
    });
  };

  const markDone = () =>
    void guard(async () => {
      if (!step || !date) return;
      const { error } = await supabase().from("task_steps").update({ done_on: date }).eq("id", step.id);
      if (error) throw error;
      setTiming(false);
      setFinished(true);
      setStage("key");
    });

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>{copy.start.title}</h1>
        <span className="small quiet">{copy.start.progress(STAGE_NUMBER[stage])}</span>
      </div>

      {stage === "task" && (
        <form onSubmit={addTask} className="panel stack">
          <h2 style={{ margin: 0 }}>{copy.start.taskTitle}</h2>
          <p className="quiet" style={{ margin: 0 }}>
            {copy.start.taskHint}
          </p>
          <div>
            <label htmlFor="start-task">{copy.start.taskLabel}</label>
            <input id="start-task" value={text} maxLength={120} placeholder={copy.start.taskPlaceholder} onChange={(e) => setText(e.target.value)} />
          </div>
          <div>
            <button className="primary" disabled={busy || !text.trim()}>
              {copy.start.next}
            </button>
          </div>
        </form>
      )}

      {stage === "split" && task && (
        <form onSubmit={addStep} className="panel stack">
          <h2 style={{ margin: 0 }}>{copy.start.splitTitle}</h2>
          <p className="quiet" style={{ margin: 0 }}>
            {copy.start.splitHint(task.title)}
          </p>
          <div>
            <label htmlFor="start-step">{copy.start.splitLabel}</label>
            <input id="start-step" value={text} maxLength={120} placeholder={copy.start.splitPlaceholder} onChange={(e) => setText(e.target.value)} />
          </div>
          <div>
            <button className="primary" disabled={busy || !text.trim()}>
              {copy.start.next}
            </button>
          </div>
        </form>
      )}

      {stage === "try" && step && (
        <div className="panel stack">
          <p className="note small" role="status" style={{ margin: 0 }}>
            {copy.start.planned}
          </p>
          <h2 style={{ margin: 0 }}>{copy.start.tryTitle}</h2>
          <p className="quiet" style={{ margin: 0 }}>
            {copy.start.tryHint(step.title)}
          </p>
          {timing ? (
            <StepTimer minutes={5} onDone={markDone} onCancel={() => setTiming(false)} />
          ) : (
            <div className="row">
              <button type="button" className="primary" onClick={() => setTiming(true)}>
                {copy.start.tryStart}
              </button>
              <button type="button" className="ghost" onClick={() => setStage("key")}>
                {copy.start.tryLater}
              </button>
            </div>
          )}
        </div>
      )}

      {stage === "key" && (
        <div className="panel stack">
          <p className="note" role="status" style={{ margin: 0 }}>
            {finished ? copy.start.doneTitle : copy.start.laterTitle}
          </p>
          <h2 style={{ margin: 0 }}>{copy.start.keyTitle}</h2>
          <p style={{ margin: 0 }}>{copy.start.keyBody}</p>
          <div className="row">
            <Link className="button primary" href="/partner">
              {copy.start.keyInvite}
            </Link>
            <Link className="button ghost" href="/today">
              {copy.start.keySkip}
            </Link>
          </div>
        </div>
      )}

      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
      {stage !== "key" && (
        <p className="small">
          <Link href="/tasks">{copy.start.skipTour}</Link>
        </p>
      )}
    </div>
  );
}
