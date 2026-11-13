"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { circleDayLine, circleInviteLink, copy, normalizeCircleAlias, parseCircleCode, type CircleMember, type CircleOverview } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";
import { CircleGoalPanel } from "@/components/CircleGoalPanel";

type Active = Extract<CircleOverview, { state: "active" }>;

function MemberRow({ m, onCheer, busy }: { m: CircleMember; onCheer: (key: string) => void; busy: boolean }) {
  const focus = m.focus_minutes ? copy.circle.focusLine(m.focus_minutes) : "";
  return (
    <li className="item spread" aria-label={m.me ? copy.circle.you : m.name}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
        <strong>{m.me ? copy.circle.you : m.name}</strong>
        <span className="small">{circleDayLine(m.today, m.shares || m.me)}</span>
        {focus && <span className="small quiet">{focus}</span>}
      </div>
      {!m.me &&
        (m.cheered ? (
          <span className="small status-done">{copy.circle.cheered}</span>
        ) : (
          <button type="button" disabled={busy} onClick={() => onCheer(m.key)}>
            {copy.circle.cheer(m.name)}
          </button>
        ))}
    </li>
  );
}

/** D31: go by a made-up name in the circle, or go back to your own. */
function AliasPanel({ ov, call, busy }: { ov: Active; call: (fn: string, args?: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const [alias, setAlias] = useState(ov.my_alias ?? "");
  const tidy = normalizeCircleAlias(alias);
  return (
    <form
      className="panel stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (tidy) void call("set_circle_alias", { p_alias: tidy });
      }}
    >
      <h3 style={{ margin: 0 }}>{copy.circle.aliasTitle}</h3>
      <p style={{ margin: 0 }}>{ov.my_alias ? copy.circle.aliasShown(ov.my_alias) : copy.circle.aliasOwn}</p>
      <label htmlFor="circle-alias">{copy.circle.aliasLabel}</label>
      <input id="circle-alias" value={alias} maxLength={20} placeholder={copy.circle.aliasPlaceholder} onChange={(e) => setAlias(e.target.value)} />
      {tidy === null && <p className="small quiet">{copy.circle.aliasBad}</p>}
      <div className="row">
        <button disabled={busy || !tidy || tidy === (ov.my_alias ?? "")}>{copy.circle.aliasSave}</button>
        {ov.my_alias && (
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => {
              setAlias("");
              void call("set_circle_alias", { p_alias: null });
            }}
          >
            {copy.circle.aliasClear}
          </button>
        )}
      </div>
    </form>
  );
}

function ActiveCircle({ ov, call, busy }: { ov: Active; call: (fn: string, args?: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const left = ov.circle.max - ov.circle.size;
  const link = circleInviteLink(typeof window === "undefined" ? "" : window.location.origin, ov.circle.invite_code);
  return (
    <>
      <div className="spread">
        <h1 style={{ margin: 0 }}>{ov.circle.name}</h1>
        <span className="small quiet">{copy.circle.size(ov.circle.size, ov.circle.max)}</span>
      </div>
      {ov.cheers_today.length > 0 && (
        <p className="note" role="status">
          {copy.circle.cheersToday(ov.cheers_today.join(", "))}
        </p>
      )}
      <ul className="panel" style={{ listStyle: "none" }}>
        {ov.members.map((m) => (
          <MemberRow key={m.key} m={m} busy={busy} onCheer={(key) => call("send_cheer", { p_member_key: key })} />
        ))}
      </ul>
      <CircleGoalPanel />
      <div className="panel stack">
        <h3 style={{ margin: 0 }}>{copy.circle.inviteTitle}</h3>
        {left > 0 ? (
          <>
            <p style={{ margin: 0 }}>{copy.circle.inviteBody(left)}</p>
            <input readOnly aria-label={copy.circle.inviteLinkLabel} value={link} onFocus={(e) => e.currentTarget.select()} />
            <div>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(link).catch(() => {});
                  setCopied(true);
                }}
              >
                {copied ? copy.circle.copied : copy.circle.copy}
              </button>
            </div>
          </>
        ) : (
          <p style={{ margin: 0 }}>{copy.circle.full}</p>
        )}
      </div>
      <AliasPanel ov={ov} call={call} busy={busy} />
      <div className="panel stack">
        <label className="check">
          <input type="checkbox" checked={ov.i_share} disabled={busy} onChange={(e) => call("set_circle_sharing", { p_on: e.target.checked })} />
          {copy.circle.shareLabel}
        </label>
        <p className="small quiet" style={{ margin: 0 }}>
          {copy.circle.shareHint}
        </p>
        {leaving ? (
          <div className="stack">
            <p style={{ margin: 0 }}>{copy.circle.leaveConfirm}</p>
            <div className="row">
              <button className="primary" disabled={busy} onClick={() => call("leave_circle")}>
                {copy.circle.yesLeave}
              </button>
              <button className="ghost" onClick={() => setLeaving(false)}>
                {copy.circle.stay}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button className="ghost" onClick={() => setLeaving(true)}>
              {copy.circle.leave}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default function CirclePage() {
  const router = useRouter();
  const [ov, setOv] = useState<CircleOverview | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [alias, setAlias] = useState("");
  const tidyAlias = normalizeCircleAlias(alias);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase().rpc("circle_overview");
    if (error) setErr(errorText(error));
    else setOv(data as CircleOverview);
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const call = useCallback(
    async (fn: string, args: Record<string, unknown> = {}) => {
      setBusy(true);
      setErr(null);
      const { error } = await supabase().rpc(fn, args);
      setBusy(false);
      if (error) {
        setErr(errorText(error));
        return;
      }
      await load();
    },
    [load],
  );

  function goJoin(e: React.FormEvent) {
    e.preventDefault();
    const c = parseCircleCode(code);
    if (!c) setErr(copy.circle.badCode);
    else router.push(`/circle/join?code=${c}`);
  }

  if (!ov) return <p className="quiet">{err ?? copy.circle.loading}</p>;

  return (
    <div className="stack">
      {ov.state === "none" ? (
        <>
          <h1>{copy.circle.title}</h1>
          <p className="quiet">{copy.circle.intro}</p>
          <form
            className="panel stack"
            onSubmit={(e) => {
              e.preventDefault();
              void call("create_circle", { p_name: name.trim(), p_alias: tidyAlias || null });
            }}
          >
            <h3 style={{ margin: 0 }}>{copy.circle.createTitle}</h3>
            <label htmlFor="circle-name">{copy.circle.nameLabel}</label>
            <input id="circle-name" value={name} maxLength={40} placeholder={copy.circle.namePlaceholder} onChange={(e) => setName(e.target.value)} />
            <label htmlFor="circle-alias-new">{copy.circle.aliasLabel}</label>
            <input id="circle-alias-new" value={alias} maxLength={20} placeholder={copy.circle.aliasPlaceholder} onChange={(e) => setAlias(e.target.value)} />
            <p className="small quiet" style={{ margin: 0 }}>
              {tidyAlias === null ? copy.circle.aliasBad : copy.circle.aliasHint}
            </p>
            <div>
              <button className="primary" disabled={busy || !name.trim() || tidyAlias === null}>
                {copy.circle.create}
              </button>
            </div>
          </form>
          <form className="panel stack" onSubmit={goJoin}>
            <h3 style={{ margin: 0 }}>{copy.circle.joinTitle}</h3>
            <label htmlFor="circle-code">{copy.circle.pasteLabel}</label>
            <input id="circle-code" value={code} onChange={(e) => setCode(e.target.value)} />
            <div>
              <button disabled={!code.trim()}>{copy.circle.continue}</button>
            </div>
          </form>
        </>
      ) : (
        <ActiveCircle ov={ov} call={call} busy={busy} />
      )}
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
