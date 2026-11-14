"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { copy } from "@sparrow/shared";
import { isConfigured, supabase } from "@/lib/supabase";
import { Branch } from "@/components/Branch";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (!isConfigured) return;
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace("/today");
      });
  }, [router]);
  // The page explains Sparrow even where no backend is connected yet; only signing up waits for one.
  return (
    <main className="shell stack landing">
      <h1 style={{ marginTop: "2rem", marginBottom: 0 }}>{copy.landing.title}</h1>
      <p className="lead">{copy.landing.body}</p>
      <div className="row">
        {isConfigured ? (
          <Link className="button primary" href="/login">
            {copy.landing.start}
          </Link>
        ) : (
          <p className="note small" role="status">
            {copy.landing.notOpen}
          </p>
        )}
      </div>
      <section aria-labelledby="how" className="stack">
        <h2 id="how">{copy.landing.stepsTitle}</h2>
        <ol className="how">
          {copy.landing.steps.map((s) => (
            <li key={s.title} className="panel">
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-label={copy.landing.sample}>
        <Branch
          items={[
            { id: "1", title: "Write 200 words", status: "done" },
            { id: "2", title: "Walk 10 minutes", status: "partial" },
            { id: "3", title: "Reply to one email", status: "pending" },
          ]}
        />
      </section>
      <nav className="row" aria-label={copy.landing.help}>
        <Link className="button" href="/help">
          {copy.landing.help}
        </Link>
        <Link className="button" href="/privacy">
          {copy.nav.privacy}
        </Link>
        <Link className="button ghost" href="/help">
          {copy.landing.support}
        </Link>
      </nav>
    </main>
  );
}
