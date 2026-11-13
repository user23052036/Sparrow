"use client";
import { useEffect, useState } from "react";
import { BADGE_KEYS, copy, moodWord, splitBadges, type Progress } from "@sparrow/shared";
import { errorText, supabase } from "@/lib/supabase";
import { RatingCard } from "@/components/RatingCard";
import { LeaderboardCard } from "@/components/LeaderboardCard";
import { Collection } from "@/components/Collection";

export default function ProgressPage() {
  const [p, setP] = useState<Progress | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase()
      .rpc("my_progress", { p_days: 14 })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setErr(errorText(error));
        else setP(data as Progress);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (err)
    return (
      <p className="error" role="alert">
        {err}
      </p>
    );
  if (!p) return <p className="quiet">{copy.progress.loading}</p>;

  const { earned, notYet } = splitBadges(p.badges);
  const mood = [...p.mood].reverse(); // newest first

  return (
    <div className="stack">
      <h1>{copy.progress.title}</h1>
      <p className="quiet">{copy.progress.intro}</p>

      <div className="panel stack">
        <h2>{copy.progress.pointsTitle}</h2>
        <p>{copy.progress.points(p.balance)}</p>
      </div>

      <div className="panel stack">
        <h2>{copy.progress.badgesTitle}</h2>
        <p className="small quiet">
          {copy.progress.earnedCount(earned.length, BADGE_KEYS.length)} · {copy.progress.runLine(p.best_run)}
        </p>
        <ul style={{ listStyle: "none" }} aria-label={copy.progress.badgesTitle}>
          {earned.map((k) => (
            <li key={k} className="item" data-badge={k} data-earned="true">
              <strong>{copy.progress.badges[k].name}</strong>
              <div className="small quiet">{copy.progress.badges[k].how}</div>
            </li>
          ))}
          {notYet.map((k) => (
            <li key={k} className="item quiet" data-badge={k} data-earned="false">
              <strong>{copy.progress.badges[k].name}</strong> <span className="small">· {copy.progress.notYet}</span>
              <div className="small">{copy.progress.badges[k].how}</div>
            </li>
          ))}
        </ul>
      </div>

      <Collection earned={p.badges} />

      <div className="panel stack">
        <h2>{copy.progress.moodTitle}</h2>
        <p className="small quiet">{copy.progress.moodHint}</p>
        {mood.length === 0 ? (
          <p>{copy.progress.moodEmpty}</p>
        ) : (
          <ul style={{ listStyle: "none" }} aria-label={copy.progress.moodTitle}>
            {mood.map((m) => (
              <li key={m.date} className="spread">
                <span>{new Date(m.date + "T12:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
                <span className="small">
                  {copy.progress.morning}: {moodWord(m.morning) ?? "–"} · {copy.progress.evening}: {moodWord(m.evening) ?? "–"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel stack">
        <h2>{copy.progress.helpingTitle}</h2>
        <p>{copy.progress.helpingDays(p.helping_days)}</p>
        {p.kind_acts > 0 && <p>{copy.progress.kindActs(p.kind_acts)}</p>}
      </div>

      <RatingCard />
      <LeaderboardCard />
    </div>
  );
}
