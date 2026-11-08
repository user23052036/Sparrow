import Link from "next/link";
import { copy } from "@sparrow/shared";

export const metadata = { title: "Support · Sparrow" };

export default function Help() {
  return (
    <main className="shell stack">
      <Link href="/" className="brand">Sparrow</Link>
      <h1>{copy.helpTitle}</h1>
      <p>{copy.helpIntro}</p>
      <div className="panel stack">
        <h3>Talk to someone</h3>
        <p>
          <strong>Find a helpline in your country:</strong>{" "}
          <a href="https://findahelpline.com" rel="noopener noreferrer" target="_blank">findahelpline.com</a> lists free,
          confidential services worldwide.
        </p>
        <p>
          <strong>India:</strong> Tele-MANAS, the government mental-health helpline, is free and available around the clock
          at <a href="tel:14416">14416</a> or <a href="tel:18008914416">1-800-891-4416</a>.
        </p>
        <p className="small quiet">Numbers can change. If one doesn't connect, use the directory above.</p>
      </div>
      <div className="panel stack">
        <h3>Inside Sparrow</h3>
        <p>{copy.helpInside}</p>
      </div>
    </main>
  );
}
