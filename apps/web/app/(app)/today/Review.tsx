"use client";
import { useState } from "react";
import Link from "next/link";
import { copy, isHeavyStretch, type DailyPlan, type ItemStatus, type PlanItem, type Task } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";
import { MoodPicker } from "@/components/MoodPicker";

export function Review({
  plan,
  items,
  tasks,
  isToday,
  onDone,
}: {
  plan: DailyPlan;
  items: PlanItem[];
  tasks: Task[];
  isToday: boolean;
  onDone: (msg: string, offerTomorrow: boolean) => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.status === "pending" ? "missed" : i.status])),
  );
  const [mood, setMood] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const opts: { v: ItemStatus; l: string }[] = (["done", "partial", "missed", "rescheduled"] as const).map((v) => ({ v, l: copy.today.reviewOptions[v] }));

  async function submit() {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase().rpc("review_day", { p_plan_id: plan.id, p_statuses: statuses, p_mood: mood });
    setBusy(false);
    if (error) {
      setErr(errorText(error));
      return;
    }
    const r = data as { total: number; done: number; countable: number; full_day_bonus: number };
    const line =
      r.full_day_bonus > 0
        ? copy.fullDay
        : r.done < r.countable
          ? `${copy.partialWin(r.done, r.countable)} ${isToday ? copy.oneSmallWin : ""}`
          : copy.partialWin(r.done, r.countable);
    // After today's review, check whether this was the third heavy day in a row.
    let offer = false;
    if (isToday) {
      const recent = await supabase().rpc("recent_completion", { p_days: 3 });
      offer = !recent.error && isHeavyStretch((recent.data ?? []) as { date: string; completion: number }[]);
    }
    onDone(`${line} (+${r.total} points)`, offer);
  }

  return (
    <div className="panel stack">
      <h2>
        {isToday
          ? copy.today.reviewTitle
          : copy.today.closeDay(new Date(plan.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }))}
      </h2>
      <p className="quiet">{copy.eveningPrompt}</p>
      {items.map((i) => (
        <fieldset key={i.id} style={{ border: "none", padding: 0, margin: "0 0 0.75rem" }}>
          <legend style={{ fontWeight: 700 }}>{tasks.find((t) => t.id === i.task_id)?.title ?? "Task"}</legend>
          <div className="row">
            {opts.map((o) => (
              <button key={o.v} type="button" aria-pressed={statuses[i.id] === o.v} onClick={() => setStatuses((s) => ({ ...s, [i.id]: o.v }))}>
                {o.l}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <MoodPicker label={copy.today.leavingMood} value={mood} onChange={setMood} />
      <button className="primary" disabled={busy} onClick={submit}>
        {copy.today.finishDay}
      </button>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
      <p className="small quiet">
        <Link href="/help">{copy.supportLink}</Link>
      </p>
    </div>
  );
}
