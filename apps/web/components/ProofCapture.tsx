"use client";
import { useState } from "react";
import { copy } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";
import { compressImage, imageDHash } from "@/lib/image";

export function ProofCapture({ itemId, userId, onSaved, partnerName }: { itemId: string; userId: string; onSaved: () => void; partnerName?: string | null }) {
  const [mode, setMode] = useState<"closed" | "photo" | "text">("closed");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [share, setShare] = useState(true);
  const visibility = share && partnerName ? "buddy" : "private";

  async function savePhoto(file: File) {
    setBusy(true); setMsg(null);
    try {
      const [blob, hash] = await Promise.all([compressImage(file), imageDHash(file)]);
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const sb = supabase();
      const up = await sb.storage.from("proofs").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { data, error } = await sb.from("proofs")
        .insert({ plan_item_id: itemId, kind: "photo", storage_path: path, image_phash: hash, visibility })
        .select("flagged_similar").single();
      if (error) throw error;
      setMsg(data?.flagged_similar ? copy.duplicatePhoto : "Photo saved.");
      setMode("closed");
      onSaved();
    } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  }

  async function saveText() {
    if (!text.trim()) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase().from("proofs").insert({ plan_item_id: itemId, kind: "text", text_body: text.trim(), visibility });
    setBusy(false);
    if (error) { setMsg(errorText(error)); return; }
    setText(""); setMode("closed"); setMsg("Note saved."); onSaved();
  }

  return (
    <div className="stack">
      {partnerName && (
        <label className="check">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          Share this proof with {partnerName}
        </label>
      )}
      {mode === "closed" && (
        <div className="row">
          <button type="button" onClick={() => setMode("photo")}>Add photo proof</button>
          <button type="button" className="ghost" onClick={() => setMode("text")}>Write a note instead</button>
        </div>
      )}
      {mode === "photo" && (
        <div className="stack">
          <label htmlFor={`photo-${itemId}`}>Take a photo of what you did</label>
          {/* capture opens the camera on phones; on desktop it falls back to a file picker */}
          <input id={`photo-${itemId}`} type="file" accept="image/*" capture="environment" disabled={busy}
            onChange={(e) => e.target.files?.[0] && savePhoto(e.target.files[0])} />
          <p className="small quiet">{copy.proofPrivate}</p>
          <button type="button" className="ghost" onClick={() => setMode("closed")}>Cancel</button>
        </div>
      )}
      {mode === "text" && (
        <div className="stack">
          <label htmlFor={`note-${itemId}`}>What did you do?</label>
          <textarea id={`note-${itemId}`} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
          <div className="row">
            <button type="button" className="primary" disabled={busy || !text.trim()} onClick={saveText}>Save note</button>
            <button type="button" className="ghost" onClick={() => setMode("closed")}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className="note small" role="status">{msg}</p>}
    </div>
  );
}
