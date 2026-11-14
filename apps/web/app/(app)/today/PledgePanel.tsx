"use client";
import { useEffect, useState } from "react";
import { copy, CURRENCY_SYMBOL, type Charity } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";

export function PledgePanel({ charities, reload }: { charities: Charity[]; reload: () => void }) {
  const [limit, setLimit] = useState<number | null>(null);
  const [amount, setAmount] = useState("10");
  const [charity, setCharity] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void supabase()
      .rpc("pledge_limit")
      .then(({ data }) => setLimit(typeof data === "number" ? data : null));
  }, []);
  async function set(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase().rpc("set_pledge", { p_amount: Number(amount), p_charity_id: charity, p_understood: ok });
    setBusy(false);
    if (error) setErr(errorText(error));
    else reload();
  }
  return (
    <form onSubmit={set} className="panel stack" aria-label={copy.pledge.title}>
      <h3 style={{ margin: 0 }}>{copy.pledge.title}</h3>
      <p className="note" style={{ margin: 0 }}>
        {copy.pledge.practiceNote}
      </p>
      <div>
        <label htmlFor="pledge-amount">{copy.pledge.amountLabel}</label>
        <input id="pledge-amount" type="number" min={1} max={limit ?? 100} value={amount} onChange={(e) => setAmount(e.target.value)} />
        {limit !== null && <p className="small quiet">{copy.pledge.limit(CURRENCY_SYMBOL, limit)}</p>}
      </div>
      <div>
        <label htmlFor="pledge-charity">{copy.pledge.charityLabel}</label>
        <select id="pledge-charity" value={charity} onChange={(e) => setCharity(e.target.value)} required>
          <option value="">{copy.pledge.pickCharity}</option>
          {charities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <label className="check">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        {copy.pledge.understood}
      </label>
      <div>
        <button className="primary" disabled={busy || !ok || !charity}>
          {copy.pledge.setBtn}
        </button>
      </div>
      <p className="small quiet">{copy.pledge.why}</p>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}
