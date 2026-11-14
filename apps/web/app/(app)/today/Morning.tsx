"use client";
import { useState } from "react";
import Link from "next/link";
import { copy, dayShape, isLowMood, MAX_POINT_STAKE, recentDaysFrom, suggestTaskCount, trimToLight } from "@sparrow/shared";
import { useAuth } from "@/lib/auth";
import { supabase, errorText } from "@/lib/supabase";
import { MoodPicker } from "@/components/MoodPicker";
import type { Data } from "./data";

export function Morning({ data, gentle, lightDay, reload }: { data: Data; gentle: boolean; lightDay: boolean; reload: () => void }) {
  const { session, refreshProfile } = useAuth();
  const [declined, setDeclined] = useState(false);
  const [mood, setMood] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [stake, setStake] = useState(0);
  const [stakeKind, setStakeKind] = useState<"none" | "points" | "micro">("none");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const low = isLowMood(mood);
  const shape = dayShape({ mood, gentle, lightDay, heavyStretch: data.heavyStretch });
  const maxStake = Math.min(MAX_POINT_STAKE, data.balance);
  const suggestion = suggestTaskCount(recentDaysFrom(data.recentPlans, data.items), { mood, lightDay });

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= shape.maxTasks ? p : [...p, id]));
  }
  async function setLight(on: boolean) {
    setErr(null);
    const { error } = await supabase()
      .from("profiles")
      .update({ light_day: on ? data.plan.date : null })
      .eq("id", session!.user.id);
    if (error) {
      setErr(errorText(error));
      return;
    }
    if (on) setPicked((p) => trimToLight(p));
    await refreshProfile();
  }
  async function commit() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase().rpc("commit_day", {
      p_task_ids: picked,
      p_mood: mood,
      p_stake: shape.showStake && stakeKind === "points" ? stake : 0,
      p_micro: shape.showStake && stakeKind === "micro",
    });
    setBusy(false);
    if (error) setErr(errorText(error));
    else reload();
  }

  if (data.tasks.length === 0) {
    return (
      <div className="panel">
        <h2>{copy.today.goodMorning}</h2>
        <p>{copy.today.noTasks}</p>
        <Link className="button primary" href="/tasks">
          {copy.today.addTasks}
        </Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <h2>{copy.today.goodMorning}</h2>
        <MoodPicker label={copy.moodPrompt} value={mood} onChange={setMood} />
        {lightDay && (
          <div className="note stack" role="status">
            <p style={{ margin: 0 }}>{copy.lightDayNowOn}</p>
            <div className="row">
              <button type="button" className="ghost" onClick={() => setLight(false)}>
                {copy.lightDayOff}
              </button>
            </div>
          </div>
        )}
        {shape.offerLightDay && !declined && (
          <div className="note stack" role="status">
            <p style={{ margin: 0 }}>{low ? copy.lowMoodOffer : copy.heavyStretchToday}</p>
            <div className="row">
              <button type="button" className="primary" onClick={() => setLight(true)}>
                {copy.lightDayYes}
              </button>
              <button type="button" className="ghost" onClick={() => setDeclined(true)}>
                {copy.lightDayNo}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="panel stack">
        <h3>{copy.morningPrompt}</h3>
        <p className="small" role="status" aria-label={copy.today.suggestion(suggestion.count)}>
          <strong>{copy.today.suggestion(suggestion.count)}</strong> <span className="quiet">{copy.today.suggestionWhy[suggestion.reason]}</span>
        </p>
        <div>
          {data.tasks.map((t) => (
            <label key={t.id} className="check">
              <input
                type="checkbox"
                checked={picked.includes(t.id)}
                onChange={() => toggle(t.id)}
                disabled={!picked.includes(t.id) && picked.length >= shape.maxTasks}
              />
              {t.title}
            </label>
          ))}
        </div>
        <p className="small quiet">
          {copy.today.picked(picked.length, shape.maxTasks)}
          {low && !lightDay && picked.length > 2 ? copy.today.twoPlenty : ""}
        </p>
      </div>
      {shape.showStake && (
        <div className="panel stack">
          <h3>{copy.today.stakeTitle}</h3>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend className="small">{copy.today.stakeKindLabel}</legend>
            <div className="row">
              {(
                [
                  ["none", copy.today.stakeNone],
                  ["points", copy.today.stakePoints],
                  ["micro", copy.today.stakeMicro],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={stakeKind === k} onClick={() => setStakeKind(k)}>
                  {l}
                </button>
              ))}
            </div>
          </fieldset>
          {stakeKind === "points" &&
            (maxStake <= 0 ? (
              <p className="quiet">{copy.today.stakeNoPoints}</p>
            ) : (
              <>
                <label htmlFor="stake">{copy.today.stakeLabel(stake)}</label>
                <input id="stake" type="range" min={0} max={maxStake} step={5} value={stake} onChange={(e) => setStake(Number(e.target.value))} />
                {stake > 0 && <p className="small quiet">{copy.stakeExplainer(stake)}</p>}
              </>
            ))}
          {stakeKind === "micro" && <p className="small quiet">{copy.today.microExplainer}</p>}
        </div>
      )}
      <button className="primary" disabled={busy || picked.length === 0} onClick={commit}>
        {copy.today.commit}
      </button>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
