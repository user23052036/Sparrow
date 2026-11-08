import Link from "next/link";
import { copy } from "@sparrow/shared";

export const metadata = { title: "Privacy · Sparrow" };

export default function Privacy() {
  const p = copy.privacy;
  return (
    <main className="shell stack">
      <Link href="/" className="brand">
        Sparrow
      </Link>
      <h1>{p.title}</h1>
      <p>{p.intro}</p>
      <div className="panel stack">
        <h3>{p.keepTitle}</h3>
        <ul>
          {p.keep.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div className="panel stack">
        <h3>{p.seeTitle}</h3>
        <ul>
          {p.see.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div className="panel stack">
        <h3>{p.fontsTitle}</h3>
        <p>{p.fonts}</p>
      </div>
      <div className="panel stack">
        <h3>{p.ownTitle}</h3>
        <p>{p.own}</p>
      </div>
    </main>
  );
}
