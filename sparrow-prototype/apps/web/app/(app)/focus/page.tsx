"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { copy, normalizeDomainList, type Device } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";
import { clock, timeAgo } from "@/lib/format";
import { extSyncNow } from "@/lib/extension";

interface FocusState { active: boolean; session_id: string | null; ends_at: string | null; server_now: string; domains: string[] }
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
          <h3>Take a breath first</h3>
          <p>Wait {wait} seconds. If the urge passes, you can just go back to your session.</p>
          <button className="primary" onClick={onCancel}>Keep focusing</button>
        </>
      ) : (
        <>
          <label htmlFor="reason">{copy.earlyExitPrompt}</label>
          <input id="reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <div className="row">
            <button className="primary" onClick={onCancel}>Keep focusing</button>
            <button disabled={reason.trim().length < 3} onClick={end}>End session</button>
          </div>
          <p className="small quiet">Ending early is noted in your history, just so you can see your patterns.</p>
          {err && <p className="error" role="alert">{err}</p>}
        </>
      )}
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

  const load = useCallback(async () => {
    const sb = supabase();
    await sb.rpc("check_my_heartbeats");
    const [fs, dev] = await Promise.all([sb.rpc("get_focus_state"), sb.from("devices").select("*").order("last_heartbeat_at", { ascending: false })]);
    if (fs.error) { setErr(errorText(fs.error)); return; }
    const s = fs.data as FocusState;
    setState(s);
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
    const p = setInterval(() => { if (state?.active) void load(); }, 30000);
    return () => { clearInterval(t); clearInterval(p); };
  }, [load, state?.active]);

  const remaining = state?.active && state.ends_at ? new Date(state.ends_at).getTime() - (now + skew) : 0;
  useEffect(() => {
    if (state?.active && state.session_id && remaining <= 0) {
      supabase().rpc("end_focus_session", { p_session_id: state.session_id }).then(() => {
        setMsg("Session complete. Nicely done."); extSyncNow(); void load();
      });
    }
  }, [remaining, state, load]);

  async function start(minutes: number) {
    setErr(null); setMsg(null);
    if (domains.length === 0) { setErr("Add at least one site to block first."); return; }
    const { error } = await supabase().rpc("start_focus_session", { p_minutes: minutes, p_item_id: itemId });
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
    if (parts.length && valid.length === 0) { setErr("That doesn't look like a website address. Try something like youtube.com."); return; }
    setErr(null); setInput("");
    void saveDomains([...domains, ...valid]);
  }

  const blockers = devices.filter((d) => d.platform !== "web");
  const deviceName = (id: string | null) => devices.find((d) => d.id === id)?.label ?? "A device";
  const eventText: Record<string, string> = {
    heartbeat_lost: "went quiet during this session (closed, disabled, or offline)",
    protection_disabled: "reported that blocking was switched off",
    early_exit: "",
  };

  if (!state) return <p className="quiet">Loading…</p>;

  return (
    <div className="stack">
      <h1>Focus</h1>
      {msg && <p className="note" role="status">{msg}</p>}

      {state.active && state.session_id ? (
        <div className="panel stack">
          <p className="quiet" style={{ margin: 0 }}>Focusing{itemTitle ? ` on ${itemTitle}` : ""}</p>
          <div className="big-timer" aria-live="off">{clock(remaining)}</div>
          <p className="small quiet">{domains.length} site{domains.length === 1 ? "" : "s"} blocked on every connected device.</p>
          {events.filter((e) => e.kind !== "early_exit").map((e) => (
            <p key={e.id} className="note small">{deviceName(e.device_id)} {eventText[e.kind]} at {new Date(e.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</p>
          ))}
          {exiting
            ? <EarlyExit sessionId={state.session_id} onCancel={() => setExiting(false)}
                onEnded={() => { setExiting(false); extSyncNow(); void load(); }} />
            : <div><button className="ghost" onClick={() => setExiting(true)}>End early</button></div>}
        </div>
      ) : (
        <div className="panel stack">
          <h3>Start a session{itemTitle ? ` for ${itemTitle}` : ""}</h3>
          <div className="row">
            {DURATIONS.map((m) => <button key={m} className={m === 25 ? "primary" : ""} onClick={() => start(m)}>{m} min</button>)}
          </div>
          {blockers.length === 0 && (
            <p className="note small">No blocking device connected yet. <Link href="/extension">Connect the browser extension</Link> so sites are actually blocked.</p>
          )}
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}

      <div className="panel stack">
        <h3>Sites to block</h3>
        {state.active && <p className="small quiet">You can add sites during a session, but removing them waits until it ends.</p>}
        <div className="row">
          {domains.map((d) => (
            <span key={d} className="chip">{d}
              {!state.active && <button aria-label={`Stop blocking ${d}`} onClick={() => saveDomains(domains.filter((x) => x !== d))}>×</button>}
            </span>
          ))}
          {domains.length === 0 && <span className="quiet">Nothing yet.</span>}
        </div>
        <form onSubmit={addFromInput} className="row">
          <input aria-label="Website to block" value={input} onChange={(e) => setInput(e.target.value)} placeholder="youtube.com" style={{ flex: 1, minWidth: 180 }} />
          <button>Add</button>
        </form>
        <div className="row small">
          <span className="quiet">Common picks:</span>
          {SUGGESTED.filter((s) => !domains.includes(s)).map((s) => (
            <button key={s} className="ghost" onClick={() => saveDomains([...domains, s])}>+ {s}</button>
          ))}
        </div>
      </div>

      <div className="panel stack">
        <h3>Devices</h3>
        {blockers.length === 0 ? <p className="quiet">No devices yet.</p> : (
          <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
            {blockers.map((d) => <li key={d.id}>{d.label ?? d.platform} <span className="small quiet">· last seen {timeAgo(d.last_heartbeat_at, now)}</span></li>)}
          </ul>
        )}
        <Link href="/extension" className="small">Manage the browser extension</Link>
      </div>
    </div>
  );
}

export default function Focus() {
  return <Suspense><FocusInner /></Suspense>;
}
