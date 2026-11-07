"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { extRequest, extStatus, type ExtStatus } from "@/lib/extension";

export default function ExtensionPage() {
  const { session } = useAuth();
  const [st, setSt] = useState<ExtStatus | null>(null);
  const [stage, setStage] = useState<"idle" | "code">("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const email = session?.user.email ?? "";

  const refresh = useCallback(async () => setSt(await extStatus()), []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function startConnect() {
    setBusy(true); setErr(null);
    try {
      await extRequest("SPARROW_CONNECT_START", { supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, email }, 15000);
      setStage("code");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await extRequest("SPARROW_CONNECT_VERIFY", { code: code.trim() }, 15000);
      setStage("idle"); setCode(""); await refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function disconnect() {
    await extRequest("SPARROW_SIGN_OUT").catch(() => {});
    await refresh();
  }

  if (!st) return <p className="quiet">Looking for the extension…</p>;

  return (
    <div className="stack">
      <h1>Browser extension</h1>
      {!st.installed && (
        <div className="panel stack">
          <h3>Install it on this computer</h3>
          <ol>
            <li>Open <code>chrome://extensions</code> (or <code>edge://extensions</code>, <code>brave://extensions</code>).</li>
            <li>Turn on <strong>Developer mode</strong>.</li>
            <li>Click <strong>Load unpacked</strong> and choose the <code>apps/extension</code> folder from the Sparrow project.</li>
            <li>Come back to this page and reload it.</li>
          </ol>
          <button onClick={refresh}>Check again</button>
        </div>
      )}
      {st.installed && !st.connected && stage === "idle" && (
        <div className="panel stack">
          <h3>Connect it to your account</h3>
          <p className="quiet">The extension signs in separately, so we'll email a fresh code to {email}.</p>
          <button className="primary" disabled={busy} onClick={startConnect}>Email me a code for the extension</button>
        </div>
      )}
      {st.installed && !st.connected && stage === "code" && (
        <form className="panel stack" onSubmit={verify}>
          <label htmlFor="code">Code from the email</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          <button className="primary" disabled={busy || code.length < 6}>Connect</button>
        </form>
      )}
      {st.installed && st.connected && (
        <div className="panel stack">
          <h3>Connected</h3>
          <p>This browser blocks your listed sites during focus sessions. Signed in as {st.email}.</p>
          <p className="small quiet">It checks for changes every 30 seconds, and instantly when you use Sparrow in this browser.</p>
          <div><button className="ghost" onClick={disconnect}>Disconnect this browser</button></div>
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  );
}
