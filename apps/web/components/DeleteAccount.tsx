"use client";
import { useState } from "react";
import { copy } from "@sparrow/shared";
import { supabase } from "@/lib/supabase";

/** Settings panel: deletes the account through the `delete-account` Edge Function (D20). */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = typed.trim().toLowerCase() === copy.settings.deleteWord;

  async function remove() {
    setBusy(true);
    setErr(null);
    const sb = supabase();
    const { error } = await sb.functions.invoke("delete-account", { body: { confirm: true } });
    if (error) {
      setErr(copy.settings.deleteError);
      setBusy(false);
      return;
    }
    // The server has already removed the user, so only clear this browser's session.
    await sb.auth.signOut({ scope: "local" }).catch(() => {});
    try {
      sessionStorage.setItem("sparrow:deleted", "1");
    } catch {
      /* storage unavailable: the login page just won't show the note */
    }
    window.location.assign("/login");
  }

  return (
    <div className="panel stack">
      <h3>{copy.settings.deleteTitle}</h3>
      <p className="quiet">{copy.settings.deleteBody}</p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}>
          {copy.settings.deleteStart}
        </button>
      ) : (
        <>
          <div>
            <label htmlFor="delete-confirm">{copy.settings.deleteConfirmLabel(copy.settings.deleteWord)}</label>
            <input id="delete-confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <div className="row">
            <button type="button" className="primary" disabled={!ready || busy} onClick={remove}>
              {busy ? copy.settings.deleting : copy.settings.deleteGo}
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={() => (setOpen(false), setTyped(""))}>
              {copy.settings.deleteCancel}
            </button>
          </div>
          {err && (
            <p className="error" role="alert">
              {err}
            </p>
          )}
        </>
      )}
    </div>
  );
}
