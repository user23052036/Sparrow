"use client";
import { useState } from "react";
import { copy, storageType, voiceExtension, voiceSeconds } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";
import { compressImage, imageDHash } from "@/lib/image";
import { VoiceRecorder, type Recording } from "@/components/VoiceRecorder";

export function ProofCapture({ itemId, userId, onSaved, partnerName }: { itemId: string; userId: string; onSaved: () => void; partnerName?: string | null }) {
  const [mode, setMode] = useState<"closed" | "photo" | "text" | "voice">("closed");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [share, setShare] = useState(true);
  const visibility = share && partnerName ? "buddy" : "private";

  async function savePhoto(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const [blob, hash] = await Promise.all([compressImage(file), imageDHash(file)]);
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const sb = supabase();
      const up = await sb.storage.from("proofs").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { data, error } = await sb
        .from("proofs")
        .insert({ plan_item_id: itemId, kind: "photo", storage_path: path, image_phash: hash, visibility })
        .select("flagged_similar")
        .single();
      if (error) throw error;
      setMsg(data?.flagged_similar ? copy.duplicatePhoto : copy.proof.photoSaved);
      setMode("closed");
      onSaved();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveVoice(r: Recording) {
    setBusy(true);
    setMsg(null);
    try {
      const type = storageType(r.mime);
      if (!type) throw new Error(copy.proof.voiceUnsupported);
      const path = `${userId}/${crypto.randomUUID()}.${voiceExtension(r.mime)}`;
      const sb = supabase();
      const up = await sb.storage.from("proofs").upload(path, r.blob, { contentType: type });
      if (up.error) throw up.error;
      const { error } = await sb.from("proofs").insert({ plan_item_id: itemId, kind: "voice", storage_path: path, duration_s: voiceSeconds(r.ms), visibility });
      if (error) throw error;
      setMsg(copy.proof.voiceSaved);
      setMode("closed");
      onSaved();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveText() {
    if (!text.trim()) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase().from("proofs").insert({ plan_item_id: itemId, kind: "text", text_body: text.trim(), visibility });
    setBusy(false);
    if (error) {
      setMsg(errorText(error));
      return;
    }
    setText("");
    setMode("closed");
    setMsg(copy.proof.noteSaved);
    onSaved();
  }

  return (
    <div className="stack">
      {partnerName && (
        <label className="check">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          {copy.proof.sharePrefix(partnerName)}
        </label>
      )}
      {mode === "closed" && (
        <div className="row">
          <button type="button" onClick={() => setMode("photo")}>
            {copy.proof.addPhoto}
          </button>
          <button type="button" className="ghost" onClick={() => setMode("text")}>
            {copy.proof.writeNote}
          </button>
          <button type="button" className="ghost" onClick={() => setMode("voice")}>
            {copy.proof.recordVoice}
          </button>
        </div>
      )}
      {mode === "voice" && <VoiceRecorder disabled={busy} onRecorded={saveVoice} onCancel={() => setMode("closed")} />}
      {mode === "photo" && (
        <div className="stack">
          <label htmlFor={`photo-${itemId}`}>{copy.proof.photoLabel}</label>
          {/* capture opens the camera on phones; on desktop it falls back to a file picker */}
          <input
            id={`photo-${itemId}`}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && savePhoto(e.target.files[0])}
          />
          <p className="small quiet">{copy.proofPrivate}</p>
          <button type="button" className="ghost" onClick={() => setMode("closed")}>
            {copy.proof.cancel}
          </button>
        </div>
      )}
      {mode === "text" && (
        <div className="stack">
          <label htmlFor={`note-${itemId}`}>{copy.proof.noteLabel}</label>
          <textarea id={`note-${itemId}`} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
          <div className="row">
            <button type="button" className="primary" disabled={busy || !text.trim()} onClick={saveText}>
              {copy.proof.saveNote}
            </button>
            <button type="button" className="ghost" onClick={() => setMode("closed")}>
              {copy.proof.cancel}
            </button>
          </div>
        </div>
      )}
      {msg && (
        <p className="note small" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
