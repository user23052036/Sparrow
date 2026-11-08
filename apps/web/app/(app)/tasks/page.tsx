"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { copy, type Task, type TaskStep } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";

function TaskEditor({ task, steps, reload }: { task: Task; steps: TaskStep[]; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const sb = supabase();

  async function run(p: PromiseLike<{ error: unknown }>) {
    const { error } = await p;
    if (error) setErr(errorText(error)); else { setErr(null); reload(); }
  }
  async function addStep(e: React.FormEvent) {
    e.preventDefault();
    if (!step.trim()) return;
    await run(sb.from("task_steps").insert({ task_id: task.id, title: step.trim(), position: steps.length }));
    setStep("");
  }
  async function move(i: number, dir: -1 | 1) {
    const a = steps[i], b = steps[i + dir];
    if (!a || !b) return;
    await run(sb.from("task_steps").upsert([
      { ...a, position: b.position }, { ...b, position: a.position },
    ]));
  }

  return (
    <li className="item">
      <div className="spread">
        <div>
          <strong>{task.title}</strong>
          <div className="small quiet">
            {steps.length === 0 ? copy.tasks.noSteps : copy.tasks.steps(steps.length)}
            {task.proof_required && copy.tasks.proofAsked}
          </div>
        </div>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? copy.tasks.close : copy.tasks.edit}</button>
      </div>
      {open && (
        <div className="stack" style={{ marginTop: "0.75rem" }}>
          <p className="small quiet">{copy.tasks.stepHint}</p>
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={s.id}>
                <span>{s.title} <span className="small quiet">({s.est_minutes} min)</span></span>
                <span className="row">
                  <button type="button" className="ghost" aria-label={`Move ${s.title} up`} disabled={i === 0} onClick={() => move(i, -1)}>{copy.tasks.up}</button>
                  <button type="button" className="ghost" aria-label={`Move ${s.title} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>{copy.tasks.down}</button>
                  <button type="button" className="ghost" aria-label={`Remove ${s.title}`} onClick={() => run(sb.from("task_steps").delete().eq("id", s.id))}>{copy.tasks.remove}</button>
                </span>
              </li>
            ))}
          </ol>
          <form onSubmit={addStep} className="row">
            <input aria-label={copy.tasks.newStep} value={step} maxLength={120} onChange={(e) => setStep(e.target.value)} placeholder={copy.tasks.stepPlaceholder} style={{ flex: 1, minWidth: 180 }} />
            <button>{copy.tasks.addStep}</button>
          </form>
          <label className="check">
            <input type="checkbox" checked={task.proof_required}
              onChange={(e) => run(sb.from("tasks").update({ proof_required: e.target.checked }).eq("id", task.id))} />
            {copy.tasks.askProof}
          </label>
          <div>
            <button type="button" className="ghost" onClick={() => run(sb.from("tasks").update({ archived: true }).eq("id", task.id))}>
              {copy.tasks.archive}
            </button>
          </div>
          {err && <p className="error" role="alert">{err}</p>}
        </div>
      )}
    </li>
  );
}

function TasksInner() {
  const first = useSearchParams().get("first") === "1";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [title, setTitle] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [t, s] = await Promise.all([
      sb.from("tasks").select("*").eq("archived", false).order("created_at"),
      sb.from("task_steps").select("*").order("position"),
    ]);
    if (t.error || s.error) setErr(errorText(t.error ?? s.error));
    setTasks((t.data as Task[]) ?? []);
    setSteps((s.data as TaskStep[]) ?? []);
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase().from("tasks").insert({ title: title.trim() });
    if (error) setErr(errorText(error)); else { setTitle(""); void load(); }
  }

  return (
    <>
      <h1>{copy.tasks.title}</h1>
      <p className="quiet">{copy.tasks.intro}</p>
      <form onSubmit={add} className="panel row">
        <input aria-label={copy.tasks.newTask} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)}
          placeholder={copy.tasks.placeholder} style={{ flex: 1, minWidth: 200 }} />
        <button className="primary">{copy.tasks.add}</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {loaded && tasks.length === 0 && <p className="note">{copy.tasks.empty}</p>}
      {tasks.length > 0 && (
        <ul className="panel" style={{ listStyle: "none" }}>
          {tasks.map((t) => <TaskEditor key={t.id} task={t} steps={steps.filter((s) => s.task_id === t.id)} reload={load} />)}
        </ul>
      )}
      {(first || tasks.length > 0) && tasks.length > 0 && (
        <Link className="button primary" href="/today">{copy.tasks.planToday}</Link>
      )}
    </>
  );
}

export default function Tasks() {
  return <Suspense><TasksInner /></Suspense>;
}
