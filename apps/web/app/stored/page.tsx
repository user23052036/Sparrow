import Link from "next/link";
import { copy, storedTables, type Schema } from "@sparrow/shared";
import schema from "@sparrow/shared/src/schema.json";

export const metadata = { title: "What Sparrow stores · Sparrow" };

// Built once, at build time, from the migrations' own snapshot (ROADMAP T4.1, D47).
const rows = storedTables((schema as Schema).tables);

export default function Stored() {
  const p = copy.stored;
  return (
    <main className="shell stack">
      <Link href="/" className="brand">
        Sparrow
      </Link>
      <h1>{p.title}</h1>
      <p>{p.intro}</p>
      <p className="small quiet">{p.operators}</p>
      {rows.map((t) => (
        <section key={t.table} className="panel stack" aria-labelledby={`t-${t.table}`}>
          <h3 id={`t-${t.table}`} style={{ margin: 0 }}>
            {t.title} <code className="small quiet">{t.table}</code>
          </h3>
          <p style={{ margin: 0 }}>{t.what}</p>
          <p className="small" style={{ margin: 0 }}>
            <strong>{p.who}:</strong> {t.who}
          </p>
          <details>
            <summary>{p.columns(t.columns.length)}</summary>
            <dl className="small" style={{ margin: "0.5rem 0 0" }}>
              {t.columns.map((c) => (
                <div key={c.name} style={{ marginBottom: "0.4rem" }}>
                  <dt>
                    <code>{c.name}</code>
                  </dt>
                  <dd style={{ margin: 0 }}>
                    {c.about}
                    {c.hidden && <em className="quiet"> {p.hidden}</em>}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </section>
      ))}
      <section className="panel stack">
        <h3 style={{ margin: 0 }}>{p.signInTitle}</h3>
        <p style={{ margin: 0 }}>{p.signIn}</p>
      </section>
      <section className="panel stack">
        <h3 style={{ margin: 0 }}>{p.filesTitle}</h3>
        <p style={{ margin: 0 }}>{p.files}</p>
      </section>
      <p className="small">
        <Link href="/privacy">{copy.privacy.title}</Link>
      </p>
    </main>
  );
}
