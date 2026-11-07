import Link from "next/link";

export const metadata = { title: "Support · Sparrow" };

export default function Help() {
  return (
    <main className="shell stack">
      <Link href="/" className="brand">Sparrow</Link>
      <h1>If things feel like too much</h1>
      <p>
        Sparrow is a planning tool, not a replacement for care from people. If you are thinking about harming
        yourself, or you are in danger, please contact local emergency services now.
      </p>
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
        <p>You can turn stakes off at any time in Settings, and you can make any day as small as one step.</p>
      </div>
    </main>
  );
}
