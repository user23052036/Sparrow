"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { copy, eventLabel, inviteLink, parseInviteCode, type PartnerOverview, type PartnerProof } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import { PartnerPenalty } from "@/components/PartnerPenalty";
import { SupportNudge } from "@/components/SupportNudge";

type Active = Extract<PartnerOverview, { state: "active" }>;

const STATUS: Record<string, string> = copy.partnerUi.status;

function ProofCard({ proof, reload }: { proof: PartnerProof; reload: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (proof.kind !== "photo" || !proof.path) return;
    supabase()
      .storage.from("proofs")
      .createSignedUrl(proof.path, 600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [proof.kind, proof.path]);

  async function verdict(v: "approve" | "question") {
    const { error } = await supabase().rpc("verify_proof", {
      p_proof_id: proof.id,
      p_verdict: v,
      p_comment: v === "question" ? comment : null,
    });
    if (error) setErr(errorText(error));
    else {
      setAsking(false);
      setComment("");
      reload();
    }
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
        <p className="quiet">{copy.partnerUi.loadingPhoto}</p>
      )}
      {proof.flagged && <p className="note small">{copy.partnerUi.reused}</p>}
      {proof.verdict && (
        <p className="small status-done">{proof.verdict === "approve" ? copy.partnerUi.youApproved : copy.partnerUi.youAsked(proof.comment ?? "")}</p>
      )}
      {asking ? (
        <div className="stack">
          <label htmlFor={`q-${proof.id}`}>{copy.partnerUi.whatAsk}</label>
          <input id={`q-${proof.id}`} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} />
          <div className="row">
            <button className="primary" disabled={comment.trim().length < 2} onClick={() => verdict("question")}>
              {copy.partnerUi.sendQuestion}
            </button>
            <button className="ghost" onClick={() => setAsking(false)}>
              {copy.partnerUi.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button onClick={() => verdict("approve")} aria-pressed={proof.verdict === "approve"}>
            {copy.partnerUi.looksGood}
          </button>
          <button onClick={() => setAsking(true)}>{copy.partnerUi.askQuestion}</button>
        </div>
      )}
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
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
      <h1>{copy.partnerUi.withName(name)}</h1>
      <SupportNudge link={false} />

      {attention && (
        <div className="panel stack" role="alert">
          <h3>{copy.partnerUi.askingKey(name)}</h3>
          {ov.pending_end_requests.map((r) => (
            <div key={r.id} className="stack">
              <p>{copy.partnerUi.theyWant(r.reason)}</p>
              <p className="small quiet">{copy.partnerDecideHint}</p>
              <div className="row">
                <button className="primary" disabled={busy} onClick={() => call("decide_end_request", { p_request_id: r.id, p_approve: false })}>
                  {copy.partnerUi.encourage}
                </button>
                <button disabled={busy} onClick={() => call("decide_end_request", { p_request_id: r.id, p_approve: true })}>
                  {copy.partnerUi.okayStop}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toReview.length > 0 && (
        <div className="panel stack">
          <h3>{copy.partnerUi.proofsWaiting}</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {toReview.map((p) => (
              <ProofCard key={p.id} proof={p} reload={() => call("partner_overview")} />
            ))}
          </ul>
        </div>
      )}

      <div className="panel stack">
        <h3>{copy.partnerUi.theirDay(name)}</h3>
        {!ov.partner.shares || !act ? (
          <p className="quiet">{copy.partnerUi.noSharing(name)}</p>
        ) : (
          <>
            <p className="small quiet">
              {act.streak > 0 ? copy.partnerUi.streak(act.streak) : ""}
              {act.focus.sessions > 0 ? copy.partnerUi.sessionsToday(act.focus.sessions, act.focus.minutes) : copy.partnerUi.noSessions}
              {act.active_session ? copy.partnerUi.focusingNow(act.active_session.locked) : ""}
            </p>
            {act.today.committed ? (
              <ul className="steps">
                {act.today.items.map((i, idx) => (
                  <li key={idx}>
                    <span>{i.title}</span>
                    <span className={`small ${i.status === "done" ? "status-done" : "quiet"}`}>{STATUS[i.status]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="quiet">{copy.partnerUi.notPlanned}</p>
            )}
            {act.events.length > 0 && (
              <div className="stack">
                <h3 style={{ fontSize: "var(--step-0)", margin: 0 }}>{copy.partnerUi.recentMoments}</h3>
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {act.events.slice(0, 6).map((e, idx) => (
                    <li key={idx} className="small">
                      {name} {eventLabel(e.kind, e.detail)} <span className="quiet">· {timeAgo(e.at)}</span>
                    </li>
                  ))}
                </ul>
                <p className="small quiet">{copy.partnerUi.momentsHint}</p>
              </div>
            )}
          </>
        )}
      </div>

      {reviewed.length > 0 && (
        <details className="panel">
          <summary>{copy.partnerUi.reviewed(reviewed.length)}</summary>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {reviewed.map((p) => (
              <ProofCard key={p.id} proof={p} reload={() => call("partner_overview")} />
            ))}
          </ul>
        </details>
      )}

      <PartnerPenalty name={name} />

      <div className="panel stack">
        <h3>{copy.partnerUi.shareTitle(name)}</h3>
        <label className="check">
          <input type="checkbox" checked={ov.i_share} disabled={busy} onChange={(e) => call("set_my_sharing", { p_share: e.target.checked })} />
          {copy.partnerUi.shareDay}
        </label>
        <p className="small quiet">{copy.partnerUi.shareHint(name)}</p>
        {confirmEnd ? (
          <div className="stack">
            <p>{copy.partnerUi.endConfirm}</p>
            <div className="row">
              <button disabled={busy} onClick={() => call("end_buddy_link", { p_link_id: ov.link_id })}>
                {copy.partnerUi.yesEnd}
              </button>
              <button className="ghost" onClick={() => setConfirmEnd(false)}>
                {copy.partnerUi.keepIt}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button className="ghost" onClick={() => setConfirmEnd(true)}>
              {copy.partnerUi.endPartnership}
            </button>
          </div>
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
    if (error) setErr(errorText(error));
    else {
      setOv(data as PartnerOverview);
      setErr(null);
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const call = useCallback(
    async (fn: string, args: Record<string, unknown> = {}) => {
      if (fn !== "partner_overview") {
        setBusy(true);
        setErr(null);
        const { error } = await supabase().rpc(fn, args);
        setBusy(false);
        if (error) {
          setErr(errorText(error));
          return;
        }
      }
      await load();
    },
    [load],
  );

  function goJoin(e: React.FormEvent) {
    e.preventDefault();
    const c = parseInviteCode(code);
    if (!c) setErr(copy.partnerUi.badInvite);
    else router.push(`/partner/join?code=${c}`);
  }

  if (!ov) return <p className="quiet">{err ?? "Loading…"}</p>;

  return (
    <div className="stack">
      {ov.state === "none" && (
        <>
          <h1>{copy.partnerUi.title}</h1>
          <p className="quiet">{copy.partnerIntro}</p>
          <div className="panel stack">
            <h3>{copy.partnerUi.inviteSomeone}</h3>
            <p>{copy.partnerUi.inviteBody}</p>
            <div>
              <button className="primary" disabled={busy} onClick={() => call("create_buddy_invite")}>
                {copy.partnerUi.createInvite}
              </button>
            </div>
          </div>
          <form className="panel stack" onSubmit={goJoin}>
            <h3>{copy.partnerUi.gotInvite}</h3>
            <label htmlFor="invite-code">{copy.partnerUi.pasteLabel}</label>
            <input id="invite-code" value={code} onChange={(e) => setCode(e.target.value)} />
            <div>
              <button disabled={!code.trim()}>{copy.partnerUi.continue}</button>
            </div>
          </form>
        </>
      )}

      {ov.state === "pending" && (
        <>
          <h1>{copy.partnerUi.invitePartner}</h1>
          <div className="panel stack">
            <p>{copy.partnerUi.inviteWorksOnce}</p>
            <input
              readOnly
              aria-label={copy.partnerUi.inviteLinkLabel}
              value={inviteLink(typeof window === "undefined" ? "" : window.location.origin, ov.invite_code)}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="row">
              <button
                className="primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteLink(window.location.origin, ov.invite_code)).catch(() => {});
                  setCopied(true);
                }}
              >
                {copied ? copy.partnerUi.copied : copy.partnerUi.copyLink}
              </button>
              <button className="ghost" disabled={busy} onClick={() => call("end_buddy_link", { p_link_id: ov.link_id })}>
                {copy.partnerUi.cancelInvite}
              </button>
            </div>
            <p className="small quiet">{copy.partnerUi.waiting}</p>
          </div>
        </>
      )}

      {ov.state === "active" && <ActiveView ov={ov} call={call} busy={busy} />}
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
