"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { copy } from "@sparrow/shared";
import { isConfigured, supabase, errorText } from "@/lib/supabase";
import { NotConfigured } from "@/components/NotConfigured";

type Mode = "signin" | "signup" | "link";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  if (!isConfigured) return <NotConfigured />;

  function switchMode(m: Mode) {
    setMode(m);
    setErr(null);
    setInfo(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setInfo(null);
    const sb = supabase();
    try {
      if (mode === "link") {
        const { error } = await sb.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: true },
        });
        if (error) throw error;
        setInfo(copy.auth.linkSent(email.trim()));
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error(copy.auth.shortPassword);
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (data.session) router.replace("/today");
        else setInfo(copy.auth.confirmEmail);
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.replace("/today");
      }
    } catch (e2) {
      const m = errorText(e2);
      setErr(/invalid login/i.test(m) ? copy.auth.mismatch : m);
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "signup" ? copy.auth.createAccount : mode === "link" ? copy.auth.linkTitle : copy.auth.signIn;

  return (
    <main className="shell">
      <Link href="/" className="brand" style={{ marginBottom: "1.5rem" }}>
        Sparrow
      </Link>
      <form onSubmit={submit} className="panel stack" style={{ maxWidth: 440 }}>
        <h2>{heading}</h2>
        <div>
          <label htmlFor="email">{copy.auth.email}</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== "link" && (
          <div>
            <label htmlFor="password">{copy.auth.password}</label>
            <input
              id="password"
              type="password"
              required
              minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "signup" && <p className="small quiet">{copy.auth.atLeast8}</p>}
          </div>
        )}
        <button className="primary" disabled={busy}>
          {mode === "signup" ? copy.auth.createBtn : mode === "link" ? copy.auth.emailLinkBtn : copy.auth.signIn}
        </button>
        {err && (
          <p className="error" role="alert">
            {err}
          </p>
        )}
        {info && (
          <p className="note" role="status">
            {info}
          </p>
        )}
        <div className="row small">
          {mode !== "signin" && (
            <button type="button" className="ghost" onClick={() => switchMode("signin")}>
              {copy.auth.withPassword}
            </button>
          )}
          {mode !== "signup" && (
            <button type="button" className="ghost" onClick={() => switchMode("signup")}>
              {copy.auth.createInstead}
            </button>
          )}
          {mode !== "link" && (
            <button type="button" className="ghost" onClick={() => switchMode("link")}>
              {copy.auth.linkInstead}
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
