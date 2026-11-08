"use client";
import { useEffect, useState } from "react";
import { copy } from "@sparrow/shared";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const KEY = "sparrow:installDismissed";

/** Offers "install this app" once, only when the browser says it can. Easy to dismiss, never repeated. */
export function InstallBanner() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      /* storage unavailable: show it once per visit */
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setEvt(null);
  }
  async function install() {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice.catch(() => undefined);
    dismiss();
  }

  if (!evt) return null;
  return (
    <aside className="shell" aria-label={copy.pwa.installTitle}>
      <div className="panel spread">
        <div>
          <strong>{copy.pwa.installTitle}</strong>
          <p className="small quiet" style={{ margin: 0 }}>
            {copy.pwa.installBody}
          </p>
        </div>
        <div className="row">
          <button className="primary" onClick={install}>
            {copy.pwa.install}
          </button>
          <button className="ghost" onClick={dismiss}>
            {copy.pwa.notNow}
          </button>
        </div>
      </div>
    </aside>
  );
}
