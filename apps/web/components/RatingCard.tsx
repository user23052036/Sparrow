"use client";
import { useEffect, useState } from "react";
import { copy, ratingText, type Rating } from "@sparrow/shared";
import { errorText, supabase } from "@/lib/supabase";

/** The person's own rating, with the switch that lets their partner see it. */
export function RatingCard() {
  const [r, setR] = useState<Rating | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase()
      .rpc("my_rating")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setErr(errorText(error));
        else setR(data as Rating);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(on: boolean) {
    if (!r) return;
    setR({ ...r, shared: on });
    const { data, error } = await supabase().rpc("set_share_rating", { p_on: on });
    if (error) {
      setErr(errorText(error));
      setR({ ...r, shared: !on });
    } else setR(data as Rating);
  }

  if (err)
    return (
      <p className="error" role="alert">
        {err}
      </p>
    );
  if (!r) return null;
  return (
    <div className="panel stack" data-testid="rating-card">
      <h2>{copy.rating.title}</h2>
      <p className="small quiet">{copy.rating.intro}</p>
      <p>
        {copy.rating.reliability}: <strong>{r.reliability === null ? copy.rating.notEnough(r.days_counted, r.days_needed) : ratingText(r.reliability)}</strong>
      </p>
      <p>
        {copy.rating.support}: <strong>{r.support === null ? copy.rating.noPartner : ratingText(r.support)}</strong>
      </p>
      <label className="row">
        <input type="checkbox" checked={r.shared} onChange={(e) => void toggle(e.target.checked)} /> {copy.rating.shareLabel}
      </label>
      <p className="small quiet">{r.shared ? copy.rating.sharedOn : copy.rating.sharedOff}</p>
    </div>
  );
}
