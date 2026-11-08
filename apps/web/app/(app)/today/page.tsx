"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { copy, dayShape, isHeavyStretch, isLowMood, MAX_POINT_STAKE, nextDay, trimToLight, type DailyPlan, type ItemStatus, type PlanItem, type Task, type TaskStep } from "@sparrow/shared";
import { useAuth } from "@/lib/auth";
import { supabase, errorText } from "@/lib/supabase";
import { Branch } from "@/components/Branch";
import { MoodPicker } from "@/components/MoodPicker";
import { StepTimer } from "@/components/StepTimer";
import { ProofCapture } from "@/components/ProofCapture";

interface Data {
  plan: DailyPlan;
  unreviewed: DailyPlan[];
  tasks: Task[];
  items: PlanItem[];
  steps: TaskStep[];
  proofCounts: Record<string, number>;
  balance: number;
  heavyStretch: boolean;
  verdicts: Record<string, { verdict: string; comment: string | null }>;
  partnerName: string | null;
}

async function loadData(): Promise<Data> {
  const sb = supabase();
  const today = await sb.rpc("get_today");
  if (today.error) throw today.error;
  const plan = today.data as DailyPlan;
  const [unrev, tasks, items, steps, proofs, bal, recent, vers, po] = await Promise.all([
    sb.rpc("unreviewed_days"),
    sb.from("tasks").select("*").eq("archived", false).order("created_at"),
    sb.from("plan_items").select("*"),
    sb.from("task_steps").select("*").order("position"),
    sb.from("proofs").select("id, plan_item_id"),
    sb.rpc("points_balance"),
    sb.rpc("recent_completion", { p_days: 3 }),
    sb.from("verifications").select("proof_id, verdict, comment, created_at").order("created_at"),
    sb.rpc("partner_overview"),
  ]);
  for (const r of [unrev, tasks, items, steps, proofs, bal, recent]) if (r.error) throw r.error;
  const proofCounts: Record<string, number> = {};
  const itemOfProof: Record<string, string> = {};
  for (const p of (proofs.data ?? []) as { id: string; plan_item_id: string }[]) {
    proofCounts[p.plan_item_id] = (proofCounts[p.plan_item_id] ?? 0) + 1;
    itemOfProof[p.id] = p.plan_item_id;
  }
  const verdicts: Data["verdicts"] = {};
  for (const v of (vers.data ?? []) as { proof_id: string; verdict: string; comment: string | null }[]) {
    const item = itemOfProof[v.proof_id];
    if (item) verdicts[item] = { verdict: v.verdict, comment: v.comment };
  }
  const ov = po.data as { state?: string; partner?: { name: string } } | null;
  const rc = (recent.data ?? []) as { date: string; completion: number }[];
  return {
    plan,
    unreviewed: (unrev.data ?? []) as DailyPlan[],
    tasks: (tasks.data ?? []) as Task[],
    items: (items.data ?? []) as PlanItem[],
    steps: (steps.data ?? []) as TaskStep[],
    proofCounts,
    balance: (bal.data as number) ?? 0,
    heavyStretch: isHeavyStretch(rc),
    verdicts,
    partnerName: ov?.state === "active" ? ov.partner?.name ?? null : null,
  };
}

/* ------------------------------------------------------------ morning */
function Morning({ data, gentle, lightDay, reload }: { data: Data; gentle: boolean; lightDay: boolean; reload: () => void }) {
  const { session, refreshProfile } = useAuth();
  const [declined, setDeclined] = useState(false);
  const [mood, setMood] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [stake, setStake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const low = isLowMood(mood);
  const shape = dayShape({ mood, gentle, lightDay, heavyStretch: data.heavyStretch });
  const maxStake = Math.min(MAX_POINT_STAKE, data.balance);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= shape.maxTasks ? p : [...p, id]));
  }
  async function setLight(on: boolean) {
    setErr(null);
    const { error } = await supabase().from("profiles").update({ light_day: on ? data.plan.date : null }).eq("id", session!.user.id);
    if (error) { setErr(errorText(error)); return; }
    if (on) setPicked((p) => trimToLight(p));
    await refreshProfile();
  }
  async function commit() {
    setBusy(true); setErr(null);
    const { error } = await supabase().rpc("commit_day", { p_task_ids: picked, p_mood: mood, p_stake: shape.showStake ? stake : 0 });
    setBusy(false);
    if (error) setErr(errorText(error)); else reload();
  }

  if (data.tasks.length === 0) {
    return (
      <div className="panel">
        <h2>Good morning</h2>
        <p>You don't have any tasks yet. Add one or two small ones and come back here.</p>
        <Link className="button primary" href="/tasks">Add tasks</Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <h2>Good morning</h2>
        <MoodPicker label={copy.moodPrompt} value={mood} onChange={setMood} />
        {lightDay && (
          <div className="note stack" role="status">
            <p style={{ margin: 0 }}>{copy.lightDayNowOn}</p>
            <div className="row"><button type="button" className="ghost" onClick={() => setLight(false)}>{copy.lightDayOff}</button></div>
          </div>
        )}
        {shape.offerLightDay && !declined && (
          <div className="note stack" role="status">
            <p style={{ margin: 0 }}>{low ? copy.lowMoodOffer : copy.heavyStretchToday}</p>
            <div className="row">
              <button type="button" className="primary" onClick={() => setLight(true)}>{copy.lightDayYes}</button>
              <button type="button" className="ghost" onClick={() => setDeclined(true)}>{copy.lightDayNo}</button>
            </div>
          </div>
        )}
      </div>
      <div className="panel stack">
        <h3>{copy.morningPrompt}</h3>
        <div>
          {data.tasks.map((t) => (
            <label key={t.id} className="check">
              <input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)}
                disabled={!picked.includes(t.id) && picked.length >= shape.maxTasks} />
              {t.title}
            </label>
          ))}
        </div>
        <p className="small quiet">{picked.length} of up to {shape.maxTasks} picked{low && !lightDay && picked.length > 2 ? ". Two might be plenty today." : ""}</p>
      </div>
      {shape.showStake && (
        <div className="panel stack">
          <h3>Stake (optional)</h3>
          {maxStake <= 0 ? (
            <p className="quiet">Earn some points first. You can stake points you've earned, never money.</p>
          ) : (
            <>
              <label htmlFor="stake">Points to set aside: {stake}</label>
              <input id="stake" type="range" min={0} max={maxStake} step={5} value={stake} onChange={(e) => setStake(Number(e.target.value))} />
              {stake > 0 && <p className="small quiet">{copy.stakeExplainer(stake)}</p>}
            </>
          )}
        </div>
      )}
      <button className="primary" disabled={busy || picked.length === 0} onClick={commit}>Commit to today</button>
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  );
}

/* ------------------------------------------------------------ during the day */
function ItemCard({ item, task, steps, date, proofs, userId, reload, verdict, partnerName }: {
  item: PlanItem; task: Task; steps: TaskStep[]; date: string; proofs: number; userId: string; reload: () => void;
  verdict?: { verdict: string; comment: string | null }; partnerName: string | null;
}) {
  const [timerFor, setTimerFor] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sb = supabase();

  async function setStatus(s: ItemStatus) {
    const { error } = await sb.rpc("set_item_status", { p_item_id: item.id, p_status: s });
    if (error) setErr(errorText(error)); else reload();
  }
  async function stepDone(stepId: string, done: boolean) {
    const { error } = await sb.from("task_steps").update({ done_on: done ? date : null }).eq("id", stepId);
    setTimerFor(null);
    if (error) setErr(errorText(error)); else reload();
  }
  const nextStep = steps.find((s) => s.done_on !== date);
  const label: Record<ItemStatus, string> = { pending: "Not yet", done: "Done", partial: "Partly done", missed: "Didn't happen", rescheduled: "Moved" };

  return (
    <li className="item stack">
      <div className="spread">
        <h3 style={{ margin: 0 }}>{task.title}</h3>
        <span className={`small ${item.status === "done" ? "status-done" : ""}`}>{label[item.status]}</span>
      </div>
      {steps.length > 0 && (
        <ul className="steps">
          {steps.map((s) => (
            <li key={s.id} className={s.done_on === date ? "done" : ""}>
              <label className="check" style={{ padding: 0 }}>
                <input type="checkbox" checked={s.done_on === date} onChange={(e) => stepDone(s.id, e.target.checked)} />
                <span>{s.title}</span>
              </label>
              {s.done_on !== date && timerFor !== s.id && (
                <button type="button" className="ghost" onClick={() => setTimerFor(s.id)}>Start now</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {timerFor && (
        <StepTimer minutes={steps.find((s) => s.id === timerFor)?.est_minutes ?? 5}
          onDone={() => stepDone(timerFor, true)} onCancel={() => setTimerFor(null)} />
      )}
      {!timerFor && steps.length === 0 && item.status === "pending" && (
        <p className="small quiet">Tip: give this a first five-minute step on the Tasks page.</p>
      )}
      <div className="row">
        <button type="button" aria-pressed={item.status === "done"} onClick={() => setStatus("done")}>Done</button>
        <button type="button" aria-pressed={item.status === "partial"} onClick={() => setStatus("partial")}>Partly</button>
        <Link className="button ghost" href={`/focus?item=${item.id}`}>Focus on this</Link>
        {nextStep && !timerFor && <span className="small quiet">Next: {nextStep.title}</span>}
      </div>
      {(item.status === "done" || item.status === "partial" || task.proof_required) && (
        proofs > 0
          ? <p className="small status-done">{proofs} proof{proofs === 1 ? "" : "s"} saved</p>
          : <ProofCapture itemId={item.id} userId={userId} onSaved={reload} partnerName={partnerName} />
      )}
      {verdict && partnerName && (
        <p className="note small" role="status">
          {verdict.verdict === "approve" ? `${partnerName} says this looks good.` : `${partnerName} asked: ${verdict.comment ?? "can you tell me more?"}`}
        </p>
      )}
      {err && <p className="error" role="alert">{err}</p>}
    </li>
  );
}

/* ------------------------------------------------------------ evening */
function Review({ plan, items, tasks, isToday, onDone }: {
  plan: DailyPlan; items: PlanItem[]; tasks: Task[]; isToday: boolean; onDone: (msg: string, offerTomorrow: boolean) => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>(
    () => Object.fromEntries(items.map((i) => [i.id, i.status === "pending" ? "missed" : i.status])),
  );
  const [mood, setMood] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const opts: { v: ItemStatus; l: string }[] = [
    { v: "done", l: "Done" }, { v: "partial", l: "Partly" }, { v: "missed", l: "Didn't happen" }, { v: "rescheduled", l: "Move it" },
  ];

  async function submit() {
    setBusy(true); setErr(null);
    const { data, error } = await supabase().rpc("review_day", { p_plan_id: plan.id, p_statuses: statuses, p_mood: mood });
    setBusy(false);
    if (error) { setErr(errorText(error)); return; }
    const r = data as { total: number; done: number; countable: number; full_day_bonus: number };
    const line = r.full_day_bonus > 0 ? copy.fullDay
      : r.done < r.countable ? `${copy.partialWin(r.done, r.countable)} ${isToday ? copy.oneSmallWin : ""}`
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
      <h2>{isToday ? "Evening review" : `Close ${new Date(plan.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`}</h2>
      <p className="quiet">{copy.eveningPrompt}</p>
      {items.map((i) => (
        <fieldset key={i.id} style={{ border: "none", padding: 0, margin: "0 0 0.75rem" }}>
          <legend style={{ fontWeight: 700 }}>{tasks.find((t) => t.id === i.task_id)?.title ?? "Task"}</legend>
          <div className="row">
            {opts.map((o) => (
              <button key={o.v} type="button" aria-pressed={statuses[i.id] === o.v}
                onClick={() => setStatuses((s) => ({ ...s, [i.id]: o.v }))}>{o.l}</button>
            ))}
          </div>
        </fieldset>
      ))}
      <MoodPicker label="How are you leaving the day?" value={mood} onChange={setMood} />
      <button className="primary" disabled={busy} onClick={submit}>Finish the day</button>
      {err && <p className="error" role="alert">{err}</p>}
      <p className="small quiet"><Link href="/help">{copy.supportLink}</Link></p>
    </div>
  );
}

/* ------------------------------------------------------------ page */
export default function Today() {
  const { profile, session, refreshProfile } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<DailyPlan | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [tomorrowOffer, setTomorrowOffer] = useState<string | null>(null); // date of the day just closed
  const [tomorrowSet, setTomorrowSet] = useState(false);

  async function lightenTomorrow(date: string) {
    const { error } = await supabase().from("profiles").update({ light_day: nextDay(date) }).eq("id", session!.user.id);
    if (error) { setErr(errorText(error)); return; }
    setTomorrowSet(true);
    await refreshProfile();
  }

  const reload = useCallback(async () => {
    try { setData(await loadData()); setErr(null); } catch (e) { setErr(errorText(e)); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const todayItems = useMemo(() => (data ? data.items.filter((i) => i.daily_plan_id === data.plan.id) : []), [data]);

  if (err) return <p className="error" role="alert">{err} <button onClick={reload}>Try again</button></p>;
  if (!data || !profile || !session) return <p className="quiet">Loading your day…</p>;

  const { plan } = data;
  const taskOf = (id: string) => data.tasks.find((t) => t.id === id);
  const greeting = profile.display_name ? `, ${profile.display_name}` : "";

  if (reviewing) {
    return (
      <Review plan={reviewing} items={data.items.filter((i) => i.daily_plan_id === reviewing.id)} tasks={data.tasks}
        isToday={reviewing.id === plan.id}
        onDone={(m, offer) => {
          setResult(m); setReviewing(null); setTomorrowSet(false);
          setTomorrowOffer(offer ? reviewing.date : null);
          void reload();
        }} />
    );
  }

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Today{greeting}</h1>
        <span className="small quiet">{data.balance} points</span>
      </div>
      {result && <p className="note" role="status">{result}</p>}
      {tomorrowOffer && (
        <div className="note stack" role="status">
          {tomorrowSet ? (
            <><p style={{ margin: 0 }}>{copy.lightDayTomorrow}</p><p className="small quiet" style={{ margin: 0 }}>{copy.lightDayTomorrowNote}</p></>
          ) : (
            <>
              <p style={{ margin: 0 }}>{copy.heavyStretch}</p>
              <div className="row">
                <button type="button" className="primary" onClick={() => lightenTomorrow(tomorrowOffer)}>{copy.lightDayYes}</button>
                <button type="button" className="ghost" onClick={() => setTomorrowOffer(null)}>{copy.lightDayNo}</button>
              </div>
            </>
          )}
          <p className="small quiet" style={{ margin: 0 }}><Link href="/help">{copy.supportLink}</Link></p>
        </div>
      )}
      {data.unreviewed.map((u) => (
        <div key={u.id} className="panel spread">
          <span>You haven't looked back at {new Date(u.date + "T12:00").toLocaleDateString(undefined, { weekday: "long" })} yet.</span>
          <button onClick={() => setReviewing(u)}>Close that day</button>
        </div>
      ))}

      {!plan.committed_at && <Morning data={data} gentle={profile.gentle_mode} lightDay={profile.light_day === plan.date} reload={reload} />}

      {plan.committed_at && !plan.reviewed_at && (
        <>
          <Branch items={todayItems.map((i) => ({ id: i.id, title: taskOf(i.task_id)?.title ?? "", status: i.status }))} />
          {plan.stake_amount > 0 && <p className="small quiet">{plan.stake_amount} points set aside for today.</p>}
          <ul className="panel" style={{ listStyle: "none" }}>
            {todayItems.map((i) => {
              const t = taskOf(i.task_id);
              return t ? (
                <ItemCard key={i.id} item={i} task={t} steps={data.steps.filter((s) => s.task_id === t.id)} date={plan.date}
                  proofs={data.proofCounts[i.id] ?? 0} userId={session.user.id} reload={reload}
                  verdict={data.verdicts[i.id]} partnerName={data.partnerName} />
              ) : null;
            })}
          </ul>
          <button className="primary" onClick={() => setReviewing(plan)}>Review my day</button>
        </>
      )}

      {plan.reviewed_at && (
        <div className="panel stack">
          <Branch items={todayItems.map((i) => ({ id: i.id, title: taskOf(i.task_id)?.title ?? "", status: i.status }))} />
          <h2>Today is closed</h2>
          <p>You earned {plan.points_earned ?? 0} points today. Rest well. Tomorrow starts fresh.</p>
        </div>
      )}
    </div>
  );
}
