"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { copy, normalizeDomainList, type Device } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";
import { clock, timeAgo } from "@/lib/format";
import { extSyncNow } from "@/lib/extension";

interface FocusState { active: boolean; session_id: string | null; ends_at: string | null; server_now: string; domains: string[]; locked: boolean }
interface EndReq { status: string }
interface Tamper { id: number; kind: string; device_id: string | null; created_at: string; detail: string | null }

const SUGGESTED = ["youtube.com", "instagram.com", "x.com", "reddit.com", "facebook.com", "tiktok.com", "netflix.com"];
const DURATIONS = [15, 25, 45, 60, 90];

function EarlyExit({ sessionId, onEnded, onCancel }: { sessionId: string; onEnded: () => void; onCancel: () => void }) {
  const [wait, setWait] = useState(30);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  async function end() {
    const { error } = await supabase().rpc("end_focus_session", { p_session_id: sessionId, p_reason: reason });
    if (error) setErr(errorText(error)); else onEnded();
  }
  return (
    <div className="panel stack" aria-live="polite">
      {wait > 0 ? (
        <>
          <h3>{copy.focus.breathTitle}</h3>
          <p>{copy.focus.breathBody(wait)}</p>
          <button className="primary" onClick={onCancel}>{copy.focus.keepFocusing}</button>
        </>
      ) : (
        <>
          <label htmlFor="reason">{copy.earlyExitPrompt}</label>
          <input id="reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <div className="row">
            <button className="primary" onClick={onCancel}>{copy.focus.keepFocusing}</button>
            <button disabled={reason.trim().length < 3} onClick={end}>{copy.focus.endSession}</button>
          </div>
          <p className="small quiet">{copy.focus.endedNote}</p>
          {err && <p className="error" role="alert">{err}</p>}
        </>
      )}
    </div>
  );
}

/** Locked sessions: only the partner can end them early. */
function LockedExit({ sessionId, name, req, onChanged }: { sessionId: string; name: string; req: EndReq | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function ask() {
    const { error } = await supabase().rpc("request_end_session", { p_session_id: sessionId, p_reason: reason });
    if (error) setErr(errorText(error)); else { setOpen(false); setReason(""); setErr(null); onChanged(); }
  }
  if (req?.status === "pending") return <p className="note" role="status">{copy.partnerWaiting(name)}</p>;
  return (
    <div className="stack">
      {req?.status === "denied" && <p className="note" role="status">{copy.partnerKeepGoing(name)}</p>}
      {open ? (
        <div className="stack">
          <label htmlFor="key-reason">{copy.focus.askWhy(name)}</label>
          <input id="key-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <div className="row">
            <button className="primary" disabled={reason.trim().length < 3} onClick={ask}>{copy.partnerKeyRequest(name)}</button>
            <button className="ghost" onClick={() => setOpen(false)}>{copy.focus.keepFocusing}</button>
          </div>
        </div>
      ) : (
        <div><button className="ghost" onClick={() => setOpen(true)}>{copy.partnerKeyRequest(name)}</button></div>
      )}
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  );
}

function FocusInner() {
  const itemId = useSearchParams().get("item");
  const [state, setState] = useState<FocusState | null>(null);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [domains, setDomains] = useState<string[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<Tamper[]>([]);
  const [itemTitle, setItemTitle] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [exiting, setExiting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [lockIt, setLockIt] = useState(false);
  const [endReq, setEndReq] = useState<EndReq | null>(null);
  const stateRef = useRef<FocusState | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    await sb.rpc("check_my_heartbeats");
    const [fs, dev] = await Promise.all([sb.rpc("get_focus_state"), sb.from("devices").select("*").order("last_heartbeat_at", { ascending: false })]);
    if (fs.error) { setErr(errorText(fs.error)); return; }
    const s = fs.data as FocusState;
    const prev = stateRef.current;
    stateRef.current = s;
    setState(s);
    const po = await sb.rpc("partner_overview");
    const ov = po.data as { state?: string; partner?: { name: string } } | null;
    const pname = ov?.state === "active" ? ov.partner?.name ?? null : null;
    setPartnerName(pname);
    if (s.locked && s.session_id) {
      const er = await sb.from("end_requests").select("status").eq("session_id", s.session_id).order("created_at", { ascending: false }).limit(1);
      setEndReq((er.data as EndReq[] | null)?.[0] ?? null);
    } else {
      setEndReq(null);
      if (prev?.active && prev.locked && !s.active && prev.session_id) {
        const er = await sb.from("end_requests").select("status").eq("session_id", prev.session_id).order("created_at", { ascending: false }).limit(1);
        if ((er.data as EndReq[] | null)?.[0]?.status === "approved") setMsg(copy.partnerLetGo(pname ?? "Your partner"));
      }
    }
    setSkew(new Date(s.server_now).getTime() - Date.now());
    setDomains(s.domains ?? []);
    setDevices((dev.data as Device[]) ?? []);
    if (s.session_id) {
      const ev = await sb.from("tamper_events").select("*").eq("focus_session_id", s.session_id).order("created_at");
      setEvents((ev.data as Tamper[]) ?? []);
    } else setEvents([]);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!itemId) return;
    supabase().from("plan_items").select("task_id, tasks(title)").eq("id", itemId).maybeSingle()
      .then(({ data }) => setItemTitle((data as unknown as { tasks: { title: string } | null })?.tasks?.title ?? null));
  }, [itemId]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const p = setInterval(() => { if (state?.active) void load(); }, state?.locked ? 5000 : 30000);
    return () => { clearInterval(t); clearInterval(p); };
  }, [load, state?.active, state?.locked]);

  const remaining = state?.active && state.ends_at ? new Date(state.ends_at).getTime() - (now + skew) : 0;
  useEffect(() => {
    if (state?.active && state.session_id && remaining <= 0) {
      supabase().rpc("end_focus_session", { p_session_id: state.session_id }).then(() => {
        setMsg(copy.focus.complete); extSyncNow(); void load();
      });
    }
  }, [remaining, state, load]);

  async function start(minutes: number) {
    setErr(null); setMsg(null);
    if (domains.length === 0) { setErr(copy.focus.addOne); return; }
    const { error } = await supabase().rpc("start_focus_session", { p_minutes: minutes, p_item_id: itemId, p_locked: lockIt && partnerName !== null });
    if (error) setErr(errorText(error)); else { extSyncNow(); await load(); }
  }
  async function saveDomains(next: string[]) {
    const clean = normalizeDomainList(next);
    setDomains(clean);
    const { data: u } = await supabase().auth.getUser();
    const { error } = await supabase().from("blocklists")
      .upsert({ user_id: u.user!.id, domains: clean, updated_at: new Date().toISOString() });
    if (error) setErr(errorText(error)); else extSyncNow();
  }
  function addFromInput(e: React.FormEvent) {
    e.preventDefault();
    const parts = input.split(/[\s,]+/).filter(Boolean);
    const valid = normalizeDomainList(parts);
    if (parts.length && valid.length === 0) { setErr(copy.focus.badSite); return; }
    setErr(null); setInput("");
    void saveDomains([...domains, ...valid]);
  }

  const blockers = devices.filter((d) => d.platform !== "web");
  const deviceName = (id: string | null) => devices.find((d) => d.id === id)?.label ?? copy.focus.fallbackDevice;
  const eventText: Record<string, string> = {
    heartbeat_lost: copy.focus.eventQuiet,
    protection_disabled: copy.focus.eventOff,
    early_exit: "",
  };

  if (!state) return <p className="quiet">{copy.focus.loading}</p>;

  return (
    <div className="stack">
      <h1>{copy.focus.title}</h1>
      {msg && <p className="note" role="status">{msg}</p>}

      {state.active && state.session_id ? (
        <div className="panel stack">
          <p className="quiet" style={{ margin: 0 }}>{copy.focus.focusing(itemTitle)}</p>
          <div className="big-timer" aria-live="off">{clock(remaining)}</div>
          <p className="small quiet">{copy.focus.sitesBlocked(domains.length)}</p>
          {events.filter((e) => e.kind !== "early_exit").map((e) => (
            <p key={e.id} className="note small">{copy.focus.eventAt(deviceName(e.device_id), eventText[e.kind], new Date(e.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</p>
          ))}
          {state.locked ? (
            <>
              <p className="note small">{copy.partnerLockExplainer(partnerName ?? "your partner")}</p>
              <LockedExit sessionId={state.session_id} name={partnerName ?? "your partner"} req={endReq} onChanged={() => void load()} />
            </>
          ) : exiting
            ? <EarlyExit sessionId={state.session_id} onCancel={() => setExiting(false)}
                onEnded={() => { setExiting(false); extSyncNow(); void load(); }} />
            : <div><button className="ghost" onClick={() => setExiting(true)}>{copy.focus.endEarly}</button></div>}
        </div>
      ) : (
        <div className="panel stack">
          <h3>{copy.focus.startTitle(itemTitle)}</h3>
          <div className="row">
            {DURATIONS.map((m) => <button key={m} className={m === 25 ? "primary" : ""} onClick={() => start(m)}>{copy.focus.minutes(m)}</button>)}
          </div>
          {partnerName && (
            <label className="check">
              <input type="checkbox" checked={lockIt} onChange={(e) => setLockIt(e.target.checked)} />
              {copy.focus.lockIt(partnerName)}
            </label>
          )}
          {blockers.length === 0 && (
            <p className="note small">{copy.focus.noBlocker} <Link href="/extension">{copy.focus.connectExt}</Link>{copy.focus.noBlockerTail}</p>
          )}
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}

      <div className="panel stack">
        <h3>{copy.focus.sitesTitle}</h3>
        {state.active && <p className="small quiet">{copy.focus.addDuring}</p>}
        <div className="row">
          {domains.map((d) => (
            <span key={d} className="chip">{d}
              {!state.active && <button aria-label={copy.focus.stopBlocking(d)} onClick={() => saveDomains(domains.filter((x) => x !== d))}>×</button>}
            </span>
          ))}
          {domains.length === 0 && <span className="quiet">{copy.focus.nothingYet}</span>}
        </div>
        <form onSubmit={addFromInput} className="row">
          <input aria-label={copy.focus.websiteLabel} value={input} onChange={(e) => setInput(e.target.value)} placeholder="youtube.com" style={{ flex: 1, minWidth: 180 }} />
          <button>{copy.focus.add}</button>
        </form>
        <div className="row small">
          <span className="quiet">{copy.focus.commonPicks}</span>
          {SUGGESTED.filter((s) => !domains.includes(s)).map((s) => (
            <button key={s} className="ghost" onClick={() => saveDomains([...domains, s])}>+ {s}</button>
          ))}
        </div>
      </div>

      <div className="panel stack">
        <h3>{copy.focus.devices}</h3>
        {blockers.length === 0 ? <p className="quiet">{copy.focus.noDevices}</p> : (
          <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
            {blockers.map((d) => <li key={d.id}>{d.label ?? d.platform} <span className="small quiet">{copy.focus.lastSeen(timeAgo(d.last_heartbeat_at, now))}</span></li>)}
          </ul>
        )}
        <Link href="/extension" className="small">{copy.focus.manageExt}</Link>
      </div>
    </div>
  );
}

export default function Focus() {
  return <Suspense><FocusInner /></Suspense>;
}
