"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  copy, eventLabel, inviteLink, parseInviteCode,
  type PartnerOverview, type PartnerProof,
} from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";

type Active = Extract<PartnerOverview, { state: "active" }>;

const STATUS: Record<string, string> = {
  pending: "Not yet", done: "Done", partial: "Partly", missed: "Didn't happen", rescheduled: "Moved",
};

function ProofCard({ proof, reload }: { proof: PartnerProof; reload: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (proof.kind !== "photo" || !proof.path) return;
    supabase().storage.from("proofs").createSignedUrl(proof.path, 600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [proof.kind, proof.path]);

  async function verdict(v: "approve" | "question") {
    const { error } = await supabase().rpc("verify_proof", {
      p_proof_id: proof.id, p_verdict: v, p_comment: v === "question" ? comment : null,
    });
    if (error) setErr(errorText(error)); else { setAsking(false); setComment(""); reload(); }
  }

  return (
    <li className="item stack">
      <div className="spread">
        <strong>{proof.task}</strong>
        <span className="small quiet">{timeAgo(proof.created_at)}</span>
      </div>
      {proof.kind === "text" ? (
        <p>{proof.text}</p>
      ) : url ? (
        <img src={url} alt={`Proof for ${proof.task}`} style={{ maxWidth: "100%", borderRadius: 8 }} />
      ) : (
        <p className="quiet">Loading photo…</p>
      )}
      {proof.flagged && <p className="note small">This photo looks like one they've used before.</p>}
      {proof.verdict && (
        <p className="small status-done">
          {proof.verdict === "approve" ? "You said this looks good." : `You asked: ${proof.comment ?? ""}`}
        </p>
      )}
      {asking ? (
        <div className="stack">
          <label htmlFor={`q-${proof.id}`}>What would you like to ask?</label>
          <input id={`q-${proof.id}`} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} />
          <div className="row">
            <button className="primary" disabled={comment.trim().length < 2} onClick={() => verdict("question")}>Send question</button>
            <button className="ghost" onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button onClick={() => verdict("approve")} aria-pressed={proof.verdict === "approve"}>Looks good</button>
          <button onClick={() => setAsking(true)}>Ask a question</button>
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}
    </li>
  );
}

function ActiveView({ ov, call, busy }: { ov: Active; call: (fn: string, args?: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const name = ov.partner.name;
  const act = ov.activity;
  const attention = ov.pending_end_requests.length > 0;
  const toReview = ov.proofs.filter((p) => !p.verdict);
  const reviewed = ov.proofs.filter((p) => p.verdict);

  return (
    <>
      <h1>You and {name}</h1>

      {attention && (
        <div className="panel stack" role="alert">
          <h3>{name} is asking for your key</h3>
          {ov.pending_end_requests.map((r) => (
            <div key={r.id} className="stack">
              <p>They want to end their focus session early. Their reason: “{r.reason}”</p>
              <p className="small quiet">{copy.partnerDecideHint}</p>
              <div className="row">
                <button className="primary" disabled={busy} onClick={() => call("decide_end_request", { p_request_id: r.id, p_approve: false })}>
                  Encourage them to keep going
                </button>
                <button disabled={busy} onClick={() => call("decide_end_request", { p_request_id: r.id, p_approve: true })}>
                  It's okay to stop
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toReview.length > 0 && (
        <div className="panel stack">
          <h3>Proofs waiting for you</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {toReview.map((p) => <ProofCard key={p.id} proof={p} reload={() => call("partner_overview")} />)}
          </ul>
        </div>
      )}

      <div className="panel stack">
        <h3>{name}'s day</h3>
        {!ov.partner.shares || !act ? (
          <p className="quiet">{name} hasn't turned on activity sharing. They can still send you proofs and ask for your key.</p>
        ) : (
          <>
            <p className="small quiet">
              {act.streak > 0 ? `${act.streak}-day streak. ` : ""}
              {act.focus.sessions > 0 ? `${act.focus.sessions} focus session${act.focus.sessions === 1 ? "" : "s"} today (${act.focus.minutes} min planned).` : "No focus sessions yet today."}
              {act.active_session ? ` Focusing now${act.active_session.locked ? " (locked)" : ""}.` : ""}
            </p>
            {act.today.committed ? (
              <ul className="steps">
                {act.today.items.map((i, idx) => (
                  <li key={idx}><span>{i.title}</span><span className={`small ${i.status === "done" ? "status-done" : "quiet"}`}>{STATUS[i.status]}</span></li>
                ))}
              </ul>
            ) : (
              <p className="quiet">They haven't planned today yet.</p>
            )}
            {act.events.length > 0 && (
              <div className="stack">
                <h3 style={{ fontSize: "var(--step-0)", margin: 0 }}>Recent focus moments</h3>
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {act.events.slice(0, 6).map((e, idx) => (
                    <li key={idx} className="small">{name} {eventLabel(e.kind, e.detail)} <span className="quiet">· {timeAgo(e.at)}</span></li>
                  ))}
                </ul>
                <p className="small quiet">These are moments to check in about, not marks against them.</p>
              </div>
            )}
          </>
        )}
      </div>

      {reviewed.length > 0 && (
        <details className="panel">
          <summary>Proofs you've reviewed ({reviewed.length})</summary>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {reviewed.map((p) => <ProofCard key={p.id} proof={p} reload={() => call("partner_overview")} />)}
          </ul>
        </details>
      )}

      <div className="panel stack">
        <h3>What you share with {name}</h3>
        <label className="check">
          <input type="checkbox" checked={ov.i_share} disabled={busy}
            onChange={(e) => call("set_my_sharing", { p_share: e.target.checked })} />
          My day and focus activity
        </label>
        <p className="small quiet">Proofs are shared one at a time, only when you choose. Locked sessions always send {name} your key requests.</p>
        {confirmEnd ? (
          <div className="stack">
            <p>End this partnership? You'll stop seeing each other's activity, and any locked session is released right away.</p>
            <div className="row">
              <button disabled={busy} onClick={() => call("end_buddy_link", { p_link_id: ov.link_id })}>Yes, end it</button>
              <button className="ghost" onClick={() => setConfirmEnd(false)}>Keep it</button>
            </div>
          </div>
        ) : (
          <div><button className="ghost" onClick={() => setConfirmEnd(true)}>End this partnership</button></div>
        )}
      </div>
    </>
  );
}

export default function PartnerPage() {
  const router = useRouter();
  const [ov, setOv] = useState<PartnerOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase().rpc("partner_overview");
    if (error) setErr(errorText(error)); else { setOv(data as PartnerOverview); setErr(null); }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const call = useCallback(async (fn: string, args: Record<string, unknown> = {}) => {
    if (fn !== "partner_overview") {
      setBusy(true); setErr(null);
      const { error } = await supabase().rpc(fn, args);
      setBusy(false);
      if (error) { setErr(errorText(error)); return; }
    }
    await load();
  }, [load]);

  function goJoin(e: React.FormEvent) {
    e.preventDefault();
    const c = parseInviteCode(code);
    if (!c) setErr("That doesn't look like an invite link or code. Paste the whole link your partner sent."); else router.push(`/partner/join?code=${c}`);
  }

  if (!ov) return <p className="quiet">{err ?? "Loading…"}</p>;

  return (
    <div className="stack">
      {ov.state === "none" && (
        <>
          <h1>Partner</h1>
          <p className="quiet">{copy.partnerIntro}</p>
          <div className="panel stack">
            <h3>Invite someone</h3>
            <p>Send them a link. They'll need their own Sparrow account.</p>
            <div><button className="primary" disabled={busy} onClick={() => call("create_buddy_invite")}>Create an invite link</button></div>
          </div>
          <form className="panel stack" onSubmit={goJoin}>
            <h3>Got an invite?</h3>
            <label htmlFor="invite-code">Paste the link or code</label>
            <input id="invite-code" value={code} onChange={(e) => setCode(e.target.value)} />
            <div><button disabled={!code.trim()}>Continue</button></div>
          </form>
        </>
      )}

      {ov.state === "pending" && (
        <>
          <h1>Invite your partner</h1>
          <div className="panel stack">
            <p>Send this link to the person you want as your partner. It works once.</p>
            <input readOnly aria-label="Invite link" value={inviteLink(typeof window === "undefined" ? "" : window.location.origin, ov.invite_code)}
              onFocus={(e) => e.currentTarget.select()} />
            <div className="row">
              <button className="primary" onClick={async () => {
                await navigator.clipboard.writeText(inviteLink(window.location.origin, ov.invite_code)).catch(() => {});
                setCopied(true);
              }}>{copied ? "Copied" : "Copy link"}</button>
              <button className="ghost" disabled={busy} onClick={() => call("end_buddy_link", { p_link_id: ov.link_id })}>Cancel this invite</button>
            </div>
            <p className="small quiet">Waiting for them to accept. This page updates by itself.</p>
          </div>
        </>
      )}

      {ov.state === "active" && <ActiveView ov={ov} call={call} busy={busy} />}
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  );
}
