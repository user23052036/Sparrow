"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { copy, GUEST_KEY_STORAGE, parseGuestKey, type GuestOverview } from "@sparrow/shared";
import { errorText, isConfigured, supabase } from "@/lib/supabase";
import { NotConfigured } from "@/components/NotConfigured";
import { basePath } from "@/lib/site";
import { timeAgo } from "@/lib/format";
import { guestPushIsOn, notifyAsGuest, pushSupported, turnOffGuestPush, turnOnGuestPush } from "@/lib/push";

type Load = { kind: "loading" } | { kind: "no-key" } | { kind: "invalid" } | { kind: "offline" } | { kind: "ok"; ov: GuestOverview };

function storedKey(): string | null {
  try {
    return parseGuestKey(localStorage.getItem(GUEST_KEY_STORAGE));
  } catch {
    return null;
  }
}
function storeKey(key: string | null) {
  try {
    if (key) localStorage.setItem(GUEST_KEY_STORAGE, key);
    else localStorage.removeItem(GUEST_KEY_STORAGE);
  } catch {
    /* storage unavailable: the link itself still works */
  }
}

function GuestPush({ guestKey, name }: { guestKey: string; name: string }) {
  const [state, setState] = useState<"loading" | "on" | "off" | "unsupported">("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) setState("unsupported");
    else void guestPushIsOn(guestKey).then((on) => setState(on ? "on" : "off"));
  }, [guestKey]);

  async function run(turnOn: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      if (!turnOn) {
        await turnOffGuestPush(guestKey);
        setState("off");
        return;
      }
      const r = await turnOnGuestPush(guestKey);
      if (r === "on") setState("on");
      else setMsg(r === "denied" ? copy.push.denied : r === "not-ready" ? copy.push.notReady : copy.push.unsupported);
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack" aria-label={copy.push.title}>
      <h3 style={{ margin: 0 }}>{copy.push.title}</h3>
      <p className="quiet" style={{ margin: 0 }}>
        {copy.keyPage.pushBody(name)}
      </p>
      {state === "unsupported" && <p className="note small">{copy.push.unsupported}</p>}
      {state === "on" && (
        <>
          <p className="small status-done" role="status" style={{ margin: 0 }}>
            {copy.push.on}
          </p>
          <div>
            <button type="button" disabled={busy} onClick={() => run(false)}>
              {copy.push.turnOff}
            </button>
          </div>
        </>
      )}
      {state === "off" && (
        <div>
          <button type="button" className="primary" disabled={busy} onClick={() => run(true)}>
            {copy.push.turnOn}
          </button>
        </div>
      )}
      {msg && (
        <p className="note small" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}

/**
 * D39: a friend holds the key through /key#<key>, without an account. The key is the whole permission:
 * it shows the owner's pending key requests and shared proofs, answers a request, and switches
 * notifications on for this browser. The browser remembers the key so a notification can open this page.
 */
export default function KeyPage() {
  const router = useRouter();
  const [key, setKey] = useState<string | null>(null);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [replaced, setReplaced] = useState(false);
  // The key this browser remembered before this visit; a link's key replaces it only once the server accepts it.
  const before = useRef<string | null>(null);
  // Arriving from a notification's button (sw.js adds ?request=…&answer=…): point at that answer, but a tap still confirms it.
  const [fromPush] = useState(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search);
    const answer = q.get("answer");
    return answer === "let-out" || answer === "keep-going" ? { request: q.get("request"), answer } : null;
  });

  useEffect(() => {
    if (!isConfigured) return;
    const fromLink = parseGuestKey(window.location.hash);
    before.current = storedKey();
    const k = fromLink ?? before.current;
    if (!k) {
      setLoad({ kind: "no-key" });
      return;
    }
    // Out of the address bar and history; the page remembers the key once the server accepts it.
    if (fromLink) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setKey(k);
    void supabase()
      .auth.getSession()
      .then(({ data }) => setSignedIn(!!data.session));
  }, []);
  useEffect(() => {
    // Another key link opened in this same tab changes only the "#…" part: start over with it.
    const again = () => window.location.reload();
    window.addEventListener("hashchange", again);
    return () => window.removeEventListener("hashchange", again);
  }, []);

  const refresh = useCallback(async () => {
    if (!key) return;
    const { data, error } = await supabase()
      .rpc("guest_overview", { p_key: key })
      .then(
        (r) => r,
        (e: unknown) => ({ data: null, error: { message: String(e) } }),
      );
    if (!error) {
      // This browser remembers one key link: a working one takes the place of the one before.
      if (storedKey() !== key) {
        if (before.current && before.current !== key) setReplaced(true);
        storeKey(key);
      }
      setLoad({ kind: "ok", ov: data as GuestOverview });
    } else if ((error as { code?: string }).code === "28000") {
      // Only the database's "not a valid key" answer forgets a key, and only that key: a dead link never
      // wipes the one that works.
      if (storedKey() === key) storeKey(null);
      setKey(null);
      setLoad({ kind: "invalid" });
    } else setLoad({ kind: "offline" });
  }, [key]);
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  async function decide(id: string, letOut: boolean) {
    if (!key) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase().rpc("guest_decide", { p_key: key, p_request_id: id, p_approve: letOut });
    setBusy(false);
    if (error) setErr(errorText(error));
    else {
      notifyAsGuest(key, id);
      setAnswered(letOut);
    }
    await refresh();
  }

  async function convert() {
    if (!key) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase().rpc("convert_guest_key", { p_key: key });
    setBusy(false);
    if (error) setErr(errorText(error));
    else {
      storeKey(null);
      router.replace("/partner");
    }
  }

  function rememberForSignUp() {
    // The app opens this page again after signing up (see the Guard in app/(app)/layout.tsx).
    try {
      sessionStorage.setItem("sparrow:next", "/key");
    } catch {
      /* storage unavailable */
    }
  }

  if (!isConfigured) return <NotConfigured />;
  const ov = load.kind === "ok" ? load.ov : null;

  return (
    <main className="shell stack">
      <Link href="/" className="brand">
        <img src={`${basePath}/icon.svg`} alt="" width={28} height={28} /> Sparrow
      </Link>
      <h1>{ov ? copy.keyPage.title(ov.name) : copy.keyPage.titlePlain}</h1>
      {load.kind === "loading" && <p className="quiet">{copy.keyPage.loading}</p>}
      {load.kind === "no-key" && <p className="panel">{copy.keyPage.noKey}</p>}
      {load.kind === "invalid" && <p className="panel">{copy.keyPage.invalid}</p>}
      {load.kind === "offline" && <p className="panel">{copy.keyPage.offline}</p>}
      {ov && key && (
        <>
          <p className="quiet">{copy.keyPage.intro(ov.name)}</p>
          <p className="small quiet">{copy.keyPage.keepPrivate}</p>
          {replaced && (
            <p className="note small" role="status">
              {copy.keyPage.replacedOther}
            </p>
          )}

          {ov.pending_end_requests.length > 0 ? (
            <div className="panel stack" role="alert">
              <h3>{copy.partnerUi.askingKey(ov.name)}</h3>
              {ov.pending_end_requests.map((r) => {
                const hint = fromPush?.request === r.id ? fromPush.answer : null;
                return (
                  <div key={r.id} className="stack">
                    <p>{copy.partnerUi.theyWant(r.reason)}</p>
                    <p className="small quiet">{copy.partnerDecideHint}</p>
                    {hint && (
                      <p className="note small" role="status">
                        {hint === "let-out" ? copy.push.confirmLetOut : copy.push.confirmKeepGoing}
                      </p>
                    )}
                    <div className="row">
                      <button className="primary" disabled={busy} autoFocus={hint === "keep-going"} onClick={() => decide(r.id, false)}>
                        {copy.partnerUi.encourage}
                      </button>
                      <button disabled={busy} autoFocus={hint === "let-out"} onClick={() => decide(r.id, true)}>
                        {copy.partnerUi.okayStop}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="panel stack">
              {answered !== null && (
                <p className="status-done" role="status">
                  {copy.keyPage.answered(ov.name, answered)}
                </p>
              )}
              <p className="quiet">{copy.keyPage.nothingWaiting(ov.name)}</p>
            </div>
          )}

          <div className="panel stack">
            <h3>{copy.keyPage.proofsTitle(ov.name)}</h3>
            {ov.proofs.length === 0 ? (
              <p className="quiet">{copy.keyPage.noProofs}</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {ov.proofs.map((p) => (
                  <li key={p.id} className="item stack">
                    <div className="spread">
                      <strong>{p.task}</strong>
                      <span className="small quiet">{timeAgo(p.created_at)}</span>
                    </div>
                    {p.kind === "text" ? <p>{p.text}</p> : <p className="quiet">{p.kind === "voice" ? copy.keyPage.voice : copy.keyPage.photo}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <GuestPush guestKey={key} name={ov.name} />

          <div className="panel stack">
            <h3>{copy.keyPage.accountTitle}</h3>
            <p className="quiet">{copy.keyPage.accountBody(ov.name)}</p>
            <div>
              {signedIn ? (
                <button disabled={busy} onClick={convert}>
                  {copy.keyPage.convert(ov.name)}
                </button>
              ) : (
                <Link className="button" href="/login" onClick={rememberForSignUp}>
                  {copy.keyPage.signUp}
                </Link>
              )}
            </div>
          </div>
        </>
      )}
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </main>
  );
}
