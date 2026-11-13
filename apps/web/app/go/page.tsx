"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { copy, parseFocusLinkKey, type FocusLinkResult } from "@sparrow/shared";
import { isConfigured, supabase } from "@/lib/supabase";
import { NotConfigured } from "@/components/NotConfigured";

type State = { kind: "starting" } | { kind: "ok"; result: FocusLinkResult } | { kind: "no-key" } | { kind: "invalid" } | { kind: "offline" };

/**
 * D35: opening /go#<key> starts a focus session. No sign-in is needed: the key is the whole
 * permission, and all it can do is start a session of the length its owner chose.
 */
export default function Go() {
  const [state, setState] = useState<State>({ kind: "starting" });
  const sent = useRef(false);

  useEffect(() => {
    if (!isConfigured || sent.current) return;
    sent.current = true; // never twice for one page load
    const key = parseFocusLinkKey(window.location.hash);
    if (!key) {
      setState({ kind: "no-key" });
      return;
    }
    supabase()
      .rpc("use_focus_link", { p_key: key })
      .then(
        ({ data, error }) => {
          if (error) setState(/fetch|network/i.test(error.message) ? { kind: "offline" } : { kind: "invalid" });
          else setState({ kind: "ok", result: data as FocusLinkResult });
        },
        () => setState({ kind: "offline" }),
      );
  }, []);

  if (!isConfigured) return <NotConfigured />;

  return (
    <main className="shell stack">
      <Link href="/" className="brand">
        <img src="/icon.svg" alt="" width={28} height={28} /> Sparrow
      </Link>
      <h1>{copy.go.title}</h1>
      <div className="panel stack" role="status" aria-live="polite" data-go={state.kind === "ok" ? (state.result.started ? "started" : "running") : state.kind}>
        {state.kind === "starting" && <p className="quiet">{copy.go.starting}</p>}
        {state.kind === "ok" && (
          <>
            <p>
              <strong>{state.result.started ? copy.go.started(state.result.minutes) : copy.go.running}</strong>
            </p>
            <p className="quiet">{copy.go.until(new Date(state.result.ends_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))}</p>
          </>
        )}
        {state.kind === "no-key" && <p>{copy.go.noKey}</p>}
        {state.kind === "invalid" && <p>{copy.go.invalid}</p>}
        {state.kind === "offline" && <p>{copy.go.offline}</p>}
      </div>
      <div>
        <Link className="button" href="/focus">
          {copy.go.open}
        </Link>
      </div>
    </main>
  );
}
