"use client";
import { useEffect, useState } from "react";
import { copy } from "@sparrow/shared";
import { errorText } from "@/lib/supabase";
import { currentSubscription, pushSupported, turnOffPush, turnOnPush } from "@/lib/push";

/** Settings switch for Web Push (D38). Off by default; on is per browser. */
export function PushSettings() {
  const [state, setState] = useState<"loading" | "on" | "off" | "unsupported">("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) {
      setState("unsupported");
      return;
    }
    void currentSubscription().then((s) => setState(s ? "on" : "off"));
  }, []);

  async function on() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await turnOnPush();
      if (r === "on") setState("on");
      else setMsg(r === "denied" ? copy.push.denied : r === "not-ready" ? copy.push.notReady : copy.push.unsupported);
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function off() {
    setBusy(true);
    setMsg(null);
    try {
      await turnOffPush();
      setState("off");
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
        {copy.push.body}
      </p>
      {state === "unsupported" && <p className="note small">{copy.push.unsupported}</p>}
      {state === "on" && (
        <>
          <p className="small status-done" role="status" style={{ margin: 0 }}>
            {copy.push.on}
          </p>
          <div>
            <button type="button" disabled={busy} onClick={off}>
              {copy.push.turnOff}
            </button>
          </div>
        </>
      )}
      {state === "off" && (
        <div>
          <button type="button" className="primary" disabled={busy} onClick={on}>
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
