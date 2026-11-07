"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isConfigured, supabase } from "@/lib/supabase";
import { NotConfigured } from "@/components/NotConfigured";
import { Branch } from "@/components/Branch";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (!isConfigured) return;
    supabase().auth.getSession().then(({ data }) => { if (data.session) router.replace("/today"); });
  }, [router]);
  if (!isConfigured) return <NotConfigured />;
  return (
    <main className="shell">
      <h1 style={{ marginTop: "2rem" }}>Small steps, kept gently.</h1>
      <p className="quiet">
        Pick a few things each morning, focus with distractions blocked on your laptop, and look back each evening.
        Partial days count. Nothing here is built to shame you.
      </p>
      <Branch items={[
        { id: "1", title: "Write 200 words", status: "done" },
        { id: "2", title: "Walk 10 minutes", status: "partial" },
        { id: "3", title: "Reply to one email", status: "pending" },
      ]} />
      <div className="row">
        <Link className="button primary" href="/login">Get started</Link>
        <Link className="button" href="/help">Need support right now?</Link>
      </div>
    </main>
  );
}
