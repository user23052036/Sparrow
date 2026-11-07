"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
    setMode(m); setErr(null); setInfo(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setInfo(null);
    const sb = supabase();
    try {
      if (mode === "link") {
        const { error } = await sb.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: true },
        });
        if (error) throw error;
        setInfo(`We emailed a sign-in link to ${email.trim()}. Open it in this browser.`);
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("Use at least 8 characters for your password");
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (data.session) router.replace("/today");
        else setInfo("Check your email to confirm your address, then sign in.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.replace("/today");
      }
    } catch (e2) {
      const m = errorText(e2);
      setErr(/invalid login/i.test(m) ? "That email and password don't match. Try again, or create an account." : m);
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "signup" ? "Create your account" : mode === "link" ? "Get a sign-in link" : "Sign in";

  return (
    <main className="shell">
      <Link href="/" className="brand" style={{ marginBottom: "1.5rem" }}>Sparrow</Link>
      <form onSubmit={submit} className="panel stack" style={{ maxWidth: 440 }}>
        <h2>{heading}</h2>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== "link" && (
          <div>
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === "signup" && <p className="small quiet">At least 8 characters.</p>}
          </div>
        )}
        <button className="primary" disabled={busy}>
          {mode === "signup" ? "Create account" : mode === "link" ? "Email me a link" : "Sign in"}
        </button>
        {err && <p className="error" role="alert">{err}</p>}
        {info && <p className="note" role="status">{info}</p>}
        <div className="row small">
          {mode !== "signin" && <button type="button" className="ghost" onClick={() => switchMode("signin")}>Sign in with password</button>}
          {mode !== "signup" && <button type="button" className="ghost" onClick={() => switchMode("signup")}>Create an account</button>}
          {mode !== "link" && <button type="button" className="ghost" onClick={() => switchMode("link")}>Email me a link instead</button>}
        </div>
      </form>
    </main>
  );
}
