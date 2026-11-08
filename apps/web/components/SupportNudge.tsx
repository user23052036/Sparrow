"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { copy, type SupportNudge as Nudge } from "@sparrow/shared";
import { supabase } from "@/lib/supabase";

/** A gentle in-app nudge to the partner when the other person has had a few hard days and shares their activity. */
export function SupportNudge({ link = true }: { link?: boolean }) {
  const [n, setN] = useState<Nudge | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase()
      .rpc("partner_support_nudge")
      .then(({ data }) => alive && setN((data as Nudge) ?? null));
    return () => {
      alive = false;
    };
  }, []);
  if (!n || n.level === 0 || !n.name) return null;
  return (
    <div className="note stack" role="status">
      <p style={{ margin: 0 }}>{n.level === 2 ? copy.nudge.level2(n.name) : copy.nudge.level1(n.name)}</p>
      {link && (
        <p style={{ margin: 0 }}>
          <Link href="/partner">{copy.nudge.open}</Link>
        </p>
      )}
    </div>
  );
}
