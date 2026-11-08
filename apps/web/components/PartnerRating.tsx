"use client";
import { useEffect, useState } from "react";
import { copy, ratingText, type PartnerRating as PR } from "@sparrow/shared";
import { supabase } from "@/lib/supabase";

/** The partner's rating, shown only when they chose to share it. */
export function PartnerRating() {
  const [r, setR] = useState<PR | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase()
      .rpc("partner_rating")
      .then(({ data }) => alive && setR((data as PR) ?? null));
    return () => {
      alive = false;
    };
  }, []);
  if (!r) return null;
  if (!r.shared) return <p className="small quiet">{copy.rating.partnerHidden}</p>;
  return (
    <div className="panel stack" data-testid="partner-rating">
      <h2>{copy.rating.partnerTitle(r.name)}</h2>
      <p>
        {copy.rating.reliability}: <strong>{r.reliability === null ? "–" : ratingText(r.reliability)}</strong>
      </p>
      <p>
        {copy.rating.support}: <strong>{r.support === null ? "–" : ratingText(r.support)}</strong>
      </p>
    </div>
  );
}
