"use client";
import { useEffect, useState } from "react";
import { copy, CRAFTED_KEYS, craftRows, isCraftedKey, type AnyBadgeKey, type Collection as CollectionData, type CraftedKey } from "@sparrow/shared";
import { errorText, supabase } from "@/lib/supabase";

function badgeName(k: AnyBadgeKey): string {
  return isCraftedKey(k) ? copy.craft.badges[k].name : copy.progress.badges[k].name;
}

/** D36: craft a badge from badges already held. Private, no points, nothing used up. */
export function Collection({ earned }: { earned: string[] }) {
  const [c, setC] = useState<CollectionData | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<CraftedKey | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase()
      .rpc("my_collection")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setErr(errorText(error));
        else setC(data as CollectionData);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function craft(key: CraftedKey) {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase().rpc("craft_badge", { p_key: key });
    setBusy(false);
    if (error) {
      setErr(errorText(error));
      return;
    }
    setC(data as CollectionData);
    setMade(key);
  }

  if (!c)
    return err ? (
      <p className="error" role="alert">
        {err}
      </p>
    ) : null;

  const rows = craftRows(earned, c);
  return (
    <div className="panel stack">
      <h2>{copy.craft.title}</h2>
      <p className="small quiet">
        {copy.craft.count(c.crafted.filter(isCraftedKey).length, CRAFTED_KEYS.length)} · {copy.craft.intro}
      </p>
      {made && (
        <p className="note" role="status">
          {copy.craft.justCrafted(copy.craft.badges[made].name)}
        </p>
      )}
      <ul style={{ listStyle: "none" }} aria-label={copy.craft.title}>
        {rows.map((r) => (
          <li key={r.key} className={r.state === "waiting" ? "item quiet" : "item"} data-craft={r.key} data-state={r.state}>
            <div className="spread">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                <strong>{copy.craft.badges[r.key].name}</strong>
                <span className="small">{copy.craft.badges[r.key].about}</span>
              </div>
              {r.state === "crafted" && <span className="small status-done">{copy.craft.crafted}</span>}
              {r.state === "waiting" && <span className="small">{copy.craft.waiting}</span>}
              {r.state === "ready" && (
                <button type="button" className="primary" disabled={busy} onClick={() => craft(r.key)}>
                  {copy.craft.craft(copy.craft.badges[r.key].name)}
                </button>
              )}
            </div>
            <div className="small">
              {copy.craft.madeFrom}:{" "}
              {r.parts.map((p, i) => (
                <span key={p.key} data-part={p.key} data-held={p.held}>
                  {i > 0 && " + "}
                  {badgeName(p.key)} ({p.held ? copy.craft.have : copy.craft.need})
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
