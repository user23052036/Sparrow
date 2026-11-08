"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { copy } from "@sparrow/shared";
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
      <h1 style={{ marginTop: "2rem" }}>{copy.landing.title}</h1>
      <p className="quiet">{copy.landing.body}</p>
      <Branch items={[
        { id: "1", title: "Write 200 words", status: "done" },
        { id: "2", title: "Walk 10 minutes", status: "partial" },
        { id: "3", title: "Reply to one email", status: "pending" },
      ]} />
      <div className="row">
        <Link className="button primary" href="/login">{copy.landing.start}</Link>
        <Link className="button" href="/help">{copy.landing.support}</Link>
      </div>
    </main>
  );
}
