"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isConfigured, supabase, errorText } from "@/lib/supabase";
import { NotConfigured } from "@/components/NotConfigured";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!isConfigured) return <NotConfigured />;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setErr(errorText(error)); else setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setErr(errorText(error)); else router.replace("/today");
  }

  return (
    <main className="shell">
      <Link href="/" className="brand" style={{ marginBottom: "1.5rem" }}>Sparrow</Link>
      <div className="panel stack" style={{ maxWidth: 440 }}>
        {!sent ? (
          <form onSubmit={send} className="stack">
            <h2>Sign in</h2>
            <p className="quiet">We'll email you a sign-in code. No password needed.</p>
            <div>
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="primary" disabled={busy}>Email me a code</button>
          </form>
        ) : (
          <form onSubmit={verify} className="stack">
            <h2>Check your email</h2>
            <p className="quiet">Enter the code sent to {email}, or open the link in the email on this device.</p>
            <div>
              <label htmlFor="code">Code</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" required
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </div>
            <button className="primary" disabled={busy}>Sign in</button>
            <button type="button" className="ghost" onClick={() => { setSent(false); setCode(""); }}>Use a different email</button>
          </form>
        )}
        {err && <p className="error" role="alert">{err}</p>}
      </div>
    </main>
  );
}
