"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { copy, CURRENCY_SYMBOL, isLowMood, nextDay, type DailyPlan } from "@sparrow/shared";
import { useAuth } from "@/lib/auth";
import { supabase, errorText } from "@/lib/supabase";
import { Branch } from "@/components/Branch";
import { SupportNudge } from "@/components/SupportNudge";
import { loadData, type Data } from "./data";
import { Morning } from "./Morning";
import { ItemCard } from "./ItemCard";
import { Review } from "./Review";
import { PledgePanel } from "./PledgePanel";
import { MakeupPanel } from "./MakeupPanel";
import { KindAct } from "./KindAct";

export default function Today() {
  const { profile, session, refreshProfile } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<DailyPlan | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [tomorrowOffer, setTomorrowOffer] = useState<string | null>(null); // date of the day just closed
  const [tomorrowSet, setTomorrowSet] = useState(false);

  async function lightenTomorrow(date: string) {
    const { error } = await supabase()
      .from("profiles")
      .update({ light_day: nextDay(date) })
      .eq("id", session!.user.id);
    if (error) {
      setErr(errorText(error));
      return;
    }
    setTomorrowSet(true);
    await refreshProfile();
  }

  const reload = useCallback(async () => {
    try {
      setData(await loadData());
      setErr(null);
    } catch (e) {
      setErr(errorText(e));
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const todayPledge = data?.pledges.find((p) => p.plan_id === data.plan.id);
  const todayItems = useMemo(() => (data ? data.items.filter((i) => i.daily_plan_id === data.plan.id) : []), [data]);

  if (err)
    return (
      <p className="error" role="alert">
        {err} <button onClick={reload}>{copy.today.tryAgain}</button>
      </p>
    );
  if (!data || !profile || !session) return <p className="quiet">{copy.today.loading}</p>;

  const { plan } = data;
  const taskOf = (id: string) => data.tasks.find((t) => t.id === id);
  const canPledge =
    !todayPledge &&
    !plan.reviewed_at &&
    !profile.gentle_mode &&
    profile.light_day !== plan.date &&
    !isLowMood(plan.mood_morning) &&
    todayItems.every((i) => i.status === "pending") &&
    data.charities.length > 0;
  const greeting = profile.display_name ? `, ${profile.display_name}` : "";

  if (reviewing) {
    return (
      <Review
        plan={reviewing}
        items={data.items.filter((i) => i.daily_plan_id === reviewing.id)}
        tasks={data.tasks}
        isToday={reviewing.id === plan.id}
        onDone={(m, offer) => {
          setResult(m);
          setReviewing(null);
          setTomorrowSet(false);
          setTomorrowOffer(offer ? reviewing.date : null);
          void reload();
        }}
      />
    );
  }

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>{copy.today.title(greeting)}</h1>
        <span className="small quiet">{copy.today.points(data.balance)}</span>
      </div>
      {data.partnerName && <SupportNudge />}
      {result && (
        <p className="note" role="status">
          {result}
        </p>
      )}
      {tomorrowOffer && (
        <div className="note stack" role="status">
          {tomorrowSet ? (
            <>
              <p style={{ margin: 0 }}>{copy.lightDayTomorrow}</p>
              <p className="small quiet" style={{ margin: 0 }}>
                {copy.lightDayTomorrowNote}
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>{copy.heavyStretch}</p>
              <div className="row">
                <button type="button" className="primary" onClick={() => lightenTomorrow(tomorrowOffer)}>
                  {copy.lightDayYes}
                </button>
                <button type="button" className="ghost" onClick={() => setTomorrowOffer(null)}>
                  {copy.lightDayNo}
                </button>
              </div>
            </>
          )}
          <p className="small quiet" style={{ margin: 0 }}>
            <Link href="/help">{copy.supportLink}</Link>
          </p>
        </div>
      )}
      {data.makeups
        .filter((m) => m.status === "owed" && m.due_on <= plan.date)
        .map((m) => (
          <MakeupPanel key={m.id} step={m} reload={reload} onDone={setResult} />
        ))}
      {data.unreviewed.map((u) => (
        <div key={u.id} className="panel spread">
          <span>{copy.today.unreviewed(new Date(u.date + "T12:00").toLocaleDateString(undefined, { weekday: "long" }))}</span>
          <button onClick={() => setReviewing(u)}>{copy.today.closeThatDay}</button>
        </div>
      ))}

      {!plan.committed_at && <Morning data={data} gentle={profile.gentle_mode} lightDay={profile.light_day === plan.date} reload={reload} />}

      {plan.committed_at && !plan.reviewed_at && (
        <>
          <Branch items={todayItems.map((i) => ({ id: i.id, title: taskOf(i.task_id)?.title ?? "", status: i.status }))} />
          {plan.stake_amount > 0 && <p className="small quiet">{copy.today.stakeSetAside(plan.stake_amount)}</p>}
          {plan.stake_type === "micro_task" && <p className="small quiet">{copy.today.microSet}</p>}
          {todayPledge && (
            <p className="small quiet" role="status">
              {copy.pledge.summary(CURRENCY_SYMBOL, todayPledge.amount, data.charities.find((c) => c.id === todayPledge.charity_id)?.name ?? "")}
            </p>
          )}
          {canPledge && <PledgePanel charities={data.charities} reload={reload} />}
          <ul className="panel" style={{ listStyle: "none" }}>
            {todayItems.map((i) => {
              const t = taskOf(i.task_id);
              return t ? (
                <ItemCard
                  key={i.id}
                  item={i}
                  task={t}
                  steps={data.steps.filter((s) => s.task_id === t.id)}
                  date={plan.date}
                  proofs={data.proofCounts[i.id] ?? 0}
                  userId={session.user.id}
                  reload={reload}
                  verdict={data.verdicts[i.id]}
                  partnerName={data.partnerName}
                />
              ) : null;
            })}
          </ul>
          <button className="primary" onClick={() => setReviewing(plan)}>
            {copy.today.reviewMyDay}
          </button>
        </>
      )}

      {plan.reviewed_at && (
        <div className="panel stack">
          <Branch items={todayItems.map((i) => ({ id: i.id, title: taskOf(i.task_id)?.title ?? "", status: i.status }))} />
          <h2>{copy.today.closedTitle}</h2>
          <p>{copy.today.closedBody(plan.points_earned ?? 0)}</p>
          {todayPledge && todayPledge.status === "cleared" && <p className="note">{copy.pledge.cleared(CURRENCY_SYMBOL, todayPledge.amount)}</p>}
          {todayPledge && todayPledge.status === "owed" && (
            <p className="note">
              {copy.pledge.helped(CURRENCY_SYMBOL, todayPledge.owed, data.charities.find((c) => c.id === todayPledge.charity_id)?.name ?? "")}{" "}
              {copy.oneSmallWin}
            </p>
          )}
          {plan.stake_type === "micro_task" && todayItems.some((i) => i.status === "missed") && (
            <p className="small quiet" role="status">
              {copy.today.makeupTomorrow}
            </p>
          )}
          {todayItems.some((i) => i.status === "missed") && <KindAct planId={plan.id} done={data.kindActs.includes(plan.id)} reload={reload} />}
        </div>
      )}
    </div>
  );
}
