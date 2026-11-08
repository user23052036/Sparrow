"use client";
import { useState } from "react";
import { copy } from "@sparrow/shared";
import { supabase } from "@/lib/supabase";

/** Settings panel: downloads everything Sparrow holds about the signed-in person as a JSON file. */
export function ExportData() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase().rpc("export_my_data");
    setBusy(false);
    if (error || !data) {
      setErr(copy.settings.exportError);
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sparrow-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="panel stack">
      <h3>{copy.settings.exportTitle}</h3>
      <p className="quiet">{copy.settings.exportBody}</p>
      <div>
        <button type="button" disabled={busy} onClick={download}>
          {busy ? copy.settings.exporting : copy.settings.exportBtn}
        </button>
      </div>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
