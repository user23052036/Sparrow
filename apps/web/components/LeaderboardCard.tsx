"use client";
import { useEffect, useState } from "react";
import { copy, validHandle, type Leaderboard } from "@sparrow/shared";
import { errorText, supabase } from "@/lib/supabase";

/** Optional monthly board. Opt-in with a made-up handle; hidden until enough people have joined. */
export function LeaderboardCard() {
  const [lb, setLb] = useState<Leaderboard | null>(null);
  const [handle, setHandle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void supabase()
      .rpc("monthly_leaderboard")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setErr(errorText(error));
        else setLb(data as Leaderboard);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function call(fn: "join_leaderboard" | "leave_leaderboard", args?: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    const { error } = await supabase().rpc(fn, args);
    if (error) setErr(errorText(error));
    else {
      const { data } = await supabase().rpc("monthly_leaderboard");
      setLb(data as Leaderboard);
      setHandle("");
    }
    setBusy(false);
  }

  if (!lb) return err ? <p className="error">{err}</p> : null;
  return (
    <div className="panel stack" data-testid="leaderboard">
      <h2>{copy.leaderboard.title}</h2>
      <p className="small quiet">{copy.leaderboard.intro}</p>
      {err && <p className="error">{err}</p>}
      {lb.state === "not_joined" ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validHandle(handle)) return setErr(copy.leaderboard.invalid);
            void call("join_leaderboard", { p_handle: handle });
          }}
        >
          <label>
            {copy.leaderboard.handleLabel}
            <input value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={20} />
          </label>
          <p className="small quiet">{copy.leaderboard.handleHint}</p>
          <button type="submit" disabled={busy}>
            {copy.leaderboard.join}
          </button>
        </form>
      ) : (
        <>
          {lb.state === "waiting" ? (
            <p>{copy.leaderboard.waiting(lb.have, lb.needed)}</p>
          ) : (
            <>
              <p>{copy.leaderboard.band[lb.band]}</p>
              <p className="small quiet">{copy.leaderboard.days(lb.my_days)}</p>
              <ol aria-label={copy.leaderboard.title}>
                {lb.top.map((r) => (
                  <li key={r.handle} data-me={r.me}>
                    {r.handle}
                    {r.me ? " (you)" : ""} · {copy.leaderboard.days(r.days)}
                  </li>
                ))}
              </ol>
            </>
          )}
          <button type="button" className="secondary" disabled={busy} onClick={() => void call("leave_leaderboard")}>
            {copy.leaderboard.leave}
          </button>
        </>
      )}
    </div>
  );
}
