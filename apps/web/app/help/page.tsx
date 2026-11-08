import Link from "next/link";
import { copy } from "@sparrow/shared";

export const metadata = { title: "Support · Sparrow" };

export default function Help() {
  return (
    <main className="shell stack">
      <Link href="/" className="brand">
        Sparrow
      </Link>
      <h1>{copy.helpTitle}</h1>
      <p>{copy.helpIntro}</p>
      <div className="panel stack">
        <h3>{copy.help.talkTitle}</h3>
        <p>
          <strong>{copy.help.findLabel}</strong>{" "}
          <a href="https://findahelpline.com" rel="noopener noreferrer" target="_blank">
            findahelpline.com
          </a>
          {copy.help.findTail}
        </p>
        <p>
          <strong>{copy.help.indiaLabel}</strong> {copy.help.indiaBody}
          <a href="tel:14416">14416</a>
          {copy.help.or}
          <a href="tel:18008914416">1-800-891-4416</a>.
        </p>
        <p className="small quiet">{copy.help.numbersChange}</p>
      </div>
      <div className="panel stack">
        <h3>{copy.help.insideTitle}</h3>
        <p>{copy.helpInside}</p>
      </div>
    </main>
  );
}
