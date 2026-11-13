"use client";
import { useCallback, useEffect, useState } from "react";
import { CIRCLE_GOAL_MAX, CIRCLE_GOAL_MIN, circleGoalLine, circleGoalPercent, copy, validCircleGoal, type CircleGoal } from "@sparrow/shared";
import { errorText, supabase } from "@/lib/supabase";

/** D37: one shared number for the circle. Never shows who moved how many. */
export function CircleGoalPanel() {
  const [g, setG] = useState<CircleGoal | null>(null);
  const [target, setTarget] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase().rpc("circle_goal");
    if (error) setErr(errorText(error));
    else setG(data as CircleGoal);
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function call(fn: string, args: Record<string, unknown> = {}) {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase().rpc(fn, args);
    setBusy(false);
    setConfirming(false);
    if (error) setErr(errorText(error));
    else setG(data as CircleGoal);
  }

  if (!g) return null;
  const shown = g.state === "none" ? null : g;
  const wanted = target === "" ? (g.suggested ?? CIRCLE_GOAL_MIN) : Number(target);

  return (
    <section className="panel stack" aria-label={copy.circleGoal.title}>
      <h3 style={{ margin: 0 }}>{copy.circleGoal.title}</h3>
      {shown ? (
        <>
          <progress
            max={100}
            value={circleGoalPercent(shown.moved, shown.target)}
            aria-label={copy.circleGoal.barLabel(shown.moved, shown.target)}
            style={{ width: "100%", accentColor: "var(--leaf)" }}
          />
          <p style={{ margin: 0 }} data-goal={shown.reached ? "reached" : shown.state}>
            {circleGoalLine(shown)}
          </p>
        </>
      ) : (
        <p className="quiet" style={{ margin: 0 }}>
          {copy.circleGoal.intro}
        </p>
      )}

      {g.can_start ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (validCircleGoal(wanted)) void call("start_circle_goal", { p_target: wanted });
          }}
        >
          <label htmlFor="circle-goal-target">{copy.circleGoal.targetLabel}</label>
          <input
            id="circle-goal-target"
            type="number"
            inputMode="numeric"
            min={CIRCLE_GOAL_MIN}
            max={CIRCLE_GOAL_MAX}
            value={target}
            placeholder={String(g.suggested ?? "")}
            onChange={(e) => setTarget(e.target.value)}
          />
          {!validCircleGoal(wanted) && <p className="small quiet">{copy.circleGoal.bad(CIRCLE_GOAL_MIN, CIRCLE_GOAL_MAX)}</p>}
          <div>
            <button disabled={busy || !validCircleGoal(wanted)}>{shown ? copy.circleGoal.startAnother : copy.circleGoal.start}</button>
          </div>
        </form>
      ) : (
        !shown && <p className="small quiet">{copy.circleGoal.needTwo}</p>
      )}

      {shown?.state === "open" &&
        (confirming ? (
          <div className="stack">
            <p style={{ margin: 0 }}>{copy.circleGoal.letGoConfirm}</p>
            <div className="row">
              <button type="button" className="primary" disabled={busy} onClick={() => call("let_go_circle_goal")}>
                {copy.circleGoal.yesLetGo}
              </button>
              <button type="button" className="ghost" onClick={() => setConfirming(false)}>
                {copy.circleGoal.keep}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button type="button" className="ghost" onClick={() => setConfirming(true)}>
              {copy.circleGoal.letGo}
            </button>
          </div>
        ))}
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}
